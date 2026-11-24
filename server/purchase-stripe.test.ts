import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { createDb, type Database } from "./db/client";
import { payments, paymentSettings, procurementBills, procurementOrders, purchaseStripePayments, user, wallets, walletTransactions } from "./db/schema";
import { createPurchaseStripe, cancelPurchaseStripe, purchaseStripeStatus, reconcilePurchaseStripe, applyPurchaseStripeEvent } from "./purchase-stripe";
import { payPurchaseBill, customerPurchase } from "./purchase";
import { cancelCustomerPurchase } from "./purchase-customer-cancel";
import { voidBill } from "./product-billing";
import { encryptSecret } from "./email/crypto";
import { handleStripeWebhook, purchaseStripeClient } from "./payments";
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("cloudflare:sockets", () => ({ connect: vi.fn() }));

let mf: Miniflare, db: Database;
const actor = { id: "stripe-purchase-user", email: "stripe-purchase@example.invalid" };
const env = { BETTER_AUTH_SECRET: "isolated-test-secret-no-production-access" };
const webhookSecret = "whsec_isolated_test_only";
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "purchase-stripe-test", modules: true, script: "export default {fetch(){return new Response('test')}}", d1Databases: ["DB"] }] }));
  const binding = await mf.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) {
    await binding.batch(readFileSync(`drizzle/${file}`, "utf8").split(";").map(s => s.replaceAll("--> statement-breakpoint", "").trim()).filter(Boolean).map(s => binding.prepare(s)));
  }
  db = createDb(binding as unknown as D1Database);
  await db.insert(user).values({ id: actor.id, email: actor.email, name: "Test", memberCode: "SPTEST", createdAt: new Date(), updatedAt: new Date() });
  await db.insert(wallets).values({ userId: actor.id, balanceFen: 100000 });
  await db.insert(paymentSettings).values({ id: "default", stripeEnabled: true, stripeSecretCiphertext: await encryptSecret(env.BETTER_AUTH_SECRET, "sk_test_isolated_dummy"), stripeWebhookCiphertext: await encryptSecret(env.BETTER_AUTH_SECRET, webhookSecret), updatedAt: Date.now() });
}, 30000);
afterAll(async () => { await mf?.dispose(); });

async function fixture(paidCents = 0) {
  const orderId = crypto.randomUUID(), billId = crypto.randomUUID(), now = Date.now();
  await db.insert(procurementOrders).values({ id: orderId, number: orderId, customerId: actor.id, platform: "1688", goodsCents: 1000, shippingCents: 0, totalCents: 1000, requestHash: orderId, createdBy: actor.id, createdAt: now, updatedAt: now });
  await db.insert(procurementBills).values({ id: billId, orderId, customerId: actor.id, status: "issued", currency: "USD", goodsCents: 1000, serviceCents: 0, shippingCents: 0, totalCents: 1000, paidCents, snapshot: "{}", requestHash: billId, createdBy: actor.id, createdAt: now });
  const input = { id: crypto.randomUUID(), confirm: true as const, billVersion: 1, amountCents: 1000 - paidCents };
  let session: Stripe.Checkout.Session;
  const create = vi.fn(async (body: Stripe.Checkout.SessionCreateParams, _options?: Stripe.RequestOptions) => {
    session ??= { id: `cs_test_${input.id}`, object: "checkout.session", url: "https://checkout.stripe.com/test", status: "open", payment_status: "unpaid", mode: "payment", amount_total: input.amountCents, currency: "usd", client_reference_id: body.client_reference_id, metadata: body.metadata, payment_intent: `pi_test_${input.id}` } as Stripe.Checkout.Session;
    return session;
  });
  const retrieve = vi.fn(async () => session);
  const expire = vi.fn(async () => { session = { ...session, status: "expired" }; return session; });
  const stripe = { checkout: { sessions: { create, retrieve, expire } } } as unknown as Pick<Stripe, "checkout">;
  const start = () => createPurchaseStripe(db, stripe, actor.id, orderId, input, "https://store.example.invalid");
  const paid = () => ({ ...session, status: "complete", payment_status: "paid" }) as Stripe.Checkout.Session;
  const bill = async () => (await db.select().from(procurementBills).where(eq(procurementBills.id, billId)))[0];
  return { orderId, billId, input, stripe, start, create, retrieve, expire, paid, bill };
}

describe("purchase Stripe settlement", () => {
  it("freezes caller browser URLs across a lost response and retries with changed input", async () => {
    const f = await fixture();
    const input = { ...f.input, successUrl: "https://client.example/paid?lang=zh", cancelUrl: "https://client.example/cancel" };
    const start = (body = input) => createPurchaseStripe(db, f.stripe, actor.id, f.orderId, body, "https://backend.example");
    const create = f.create.getMockImplementation()!;
    f.create.mockImplementationOnce(async body => { await create(body); throw new Error("lost response"); });
    await expect(start()).rejects.toThrow("same payment id");
    const first = f.create.mock.calls[0][0];
    expect(first.success_url).toContain("session_id={CHECKOUT_SESSION_ID}");
    const url = new URL(first.success_url!);
    expect(url.origin).toBe("https://client.example");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ purpose: "purchase", orderId: f.orderId, billId: f.billId, paymentId: f.input.id, lang: "zh" });
    await start({ ...input, successUrl: "https://changed.example/paid", cancelUrl: "https://changed.example/cancel" });
    expect(f.create.mock.calls[1][0]).toEqual(first);
    expect((await f.bill()).paidCents).toBe(0);
  });
  it("rejects invalid caller URLs before creating a payment attempt", async () => {
    const f = await fixture();
    await expect(createPurchaseStripe(db, f.stripe, actor.id, f.orderId, { ...f.input, successUrl: "javascript:alert(1)" }, "https://backend.example")).rejects.toThrow();
    expect(f.create).not.toHaveBeenCalled();
    expect(await db.select().from(payments).where(eq(payments.id, f.input.id))).toHaveLength(0);
  });
  it("freezes the server amount, blocks wallet/cancel/void and credits exactly once without touching the wallet", async () => {
    const f = await fixture();
    const before = (await db.select().from(wallets))[0].balanceFen;
    const first = await f.start();
    expect(await f.start()).toEqual(first);
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.create.mock.calls[0][0].line_items?.[0].price_data?.unit_amount).toBe(1000);
    await expect(payPurchaseBill(db, actor, f.orderId)).rejects.toThrow();
    await expect(cancelCustomerPurchase(db, actor, f.orderId, { confirm: true, reason: "test cancel" })).rejects.toThrow();
    await expect(voidBill(db, actor, f.orderId, f.billId, { version: 1, reason: "test void" })).rejects.toThrow();
    await Promise.all([reconcilePurchaseStripe(db, f.paid()), reconcilePurchaseStripe(db, f.paid())]);
    await reconcilePurchaseStripe(db, f.paid());
    expect(await f.bill()).toMatchObject({ status: "paid", paidCents: 1000, version: 2 });
    expect((await db.select().from(wallets))[0].balanceFen).toBe(before);
    expect(await purchaseStripeStatus(db, actor.id, f.orderId, f.input.id)).toMatchObject({ status: "paid", url: null });
    await reconcilePurchaseStripe(db, { ...f.paid(), status: "expired", payment_status: "unpaid" });
    expect((await f.bill()).paidCents).toBe(1000);
  });
  it("recovers an unknown creation with the same Stripe idempotency key", async () => {
    const f = await fixture();
    const create = f.create.getMockImplementation()!;
    f.create.mockImplementationOnce(async body => { await create(body); throw new Error("response lost after remote creation"); });
    await expect(f.start()).rejects.toThrow("same payment id");
    await expect(payPurchaseBill(db, actor, f.orderId)).rejects.toThrow();
    await f.start();
    expect(f.create.mock.calls[0]).toEqual(f.create.mock.calls[1]);
    expect((await db.select().from(payments).where(eq(payments.id, f.input.id)))).toHaveLength(1);
  });
  it("serializes competing requests and protects ownership and confirmed amount", async () => {
    const f = await fixture();
    await expect(createPurchaseStripe(db, f.stripe, "other", f.orderId, f.input, "https://store.example.invalid")).rejects.toThrow("not found");
    await expect(createPurchaseStripe(db, f.stripe, actor.id, f.orderId, { ...f.input, amountCents: 1 }, "https://store.example.invalid")).rejects.toThrow("Refresh");
    const results = await Promise.all([f.start(), createPurchaseStripe(db, f.stripe, actor.id, f.orderId, { ...f.input, id: crypto.randomUUID() }, "https://store.example.invalid")]);
    expect(results[0]).toEqual(results[1]);
    expect(new Set(f.create.mock.calls.map(call => call[1]?.idempotencyKey))).toEqual(new Set([`purchase-stripe:${results[0].paymentId}`]));
    expect(await db.select().from(purchaseStripePayments).where(eq(purchaseStripePayments.orderId, f.orderId))).toHaveLength(1);
    expect(await db.select().from(payments).where(eq(payments.id, results[0].paymentId))).toHaveLength(1);
    await expect(purchaseStripeStatus(db, "other", f.orderId, f.input.id)).rejects.toThrow("not found");
  });
  it("resumes the existing checkout when the client submits a new payment id", async () => {
    const f = await fixture();
    const first = await f.start();
    const retryId = crypto.randomUUID();
    expect(await createPurchaseStripe(db, f.stripe, actor.id, f.orderId, { ...f.input, id: retryId }, "https://different.example.invalid")).toEqual(first);
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(await db.select().from(payments).where(eq(payments.id, retryId))).toHaveLength(0);
    expect((await f.bill()).paidCents).toBe(0);
  });
  it("recovers a lost Stripe response with a new client id using the original request and redirects", async () => {
    const f = await fixture();
    const create = f.create.getMockImplementation()!;
    f.create.mockImplementationOnce(async body => { await create(body); throw new Error("lost response"); });
    await expect(f.start()).rejects.toMatchObject({ code: "PAYMENT_PENDING", details: { paymentId: f.input.id } });
    const result = await createPurchaseStripe(db, f.stripe, actor.id, f.orderId, { ...f.input, id: crypto.randomUUID(), successUrl: "https://changed.example/paid" }, "https://changed.example");
    expect(result).toMatchObject({ paymentId: f.input.id, status: "pending" });
    expect(f.create.mock.calls[1]).toEqual(f.create.mock.calls[0]);
    expect(await db.select().from(purchaseStripePayments).where(eq(purchaseStripePayments.orderId, f.orderId))).toHaveLength(1);
  });
  it("does not reuse a payment for a changed bill or an id belonging to another order", async () => {
    const f = await fixture(); await f.start();
    const other = await fixture(); await other.start();
    await expect(createPurchaseStripe(db, f.stripe, actor.id, f.orderId, { ...f.input, id: other.input.id }, "https://store.example.invalid")).rejects.toThrow("different request");
    await db.update(procurementBills).set({ version: 2, goodsCents: 1200, totalCents: 1200 }).where(eq(procurementBills.id, f.billId));
    await expect(createPurchaseStripe(db, f.stripe, actor.id, f.orderId, { ...f.input, id: crypto.randomUUID(), billVersion: 2, amountCents: 1200 }, "https://store.example.invalid")).rejects.toThrow("Refresh");
    expect(f.create).toHaveBeenCalledTimes(1);
  });
  it("keeps old unknown sessions locked even when the client changes its id", async () => {
    const f = await fixture();
    f.create.mockRejectedValueOnce(new Error("timeout"));
    await expect(f.start()).rejects.toThrow("same payment id");
    await db.update(purchaseStripePayments).set({ createdAt: Date.now() - 24 * 60 * 60_000 }).where(eq(purchaseStripePayments.id, f.input.id));
    await expect(createPurchaseStripe(db, f.stripe, actor.id, f.orderId, { ...f.input, id: crypto.randomUUID() }, "https://store.example.invalid")).rejects.toThrow("operator reconciliation");
    expect(f.create).toHaveBeenCalledTimes(1);
    await expect(payPurchaseBill(db, actor, f.orderId)).rejects.toThrow();
  });
  it.each(["mismatch", "risk"])("explains staff review without creating another session: %s", async reason => {
    const f = await fixture(); await f.start();
    if (reason === "mismatch") await reconcilePurchaseStripe(db, { ...f.paid(), amount_total: 999 });
    else await db.update(payments).set({ riskStatus: "review" }).where(eq(payments.id, f.input.id));
    for (const id of [f.input.id, crypto.randomUUID()]) {
      await expect(createPurchaseStripe(db, f.stripe, actor.id, f.orderId, { ...f.input, id }, "https://store.example.invalid")).rejects.toMatchObject({ code: "PAYMENT_REVIEW", details: { paymentId: f.input.id, status: "review" } });
    }
    expect(f.create).toHaveBeenCalledTimes(1);
    await expect(payPurchaseBill(db, actor, f.orderId)).rejects.toThrow();
  });
  it("expires at Stripe before releasing the bill to wallet payment", async () => {
    const f = await fixture(); await f.start();
    expect(await cancelPurchaseStripe(db, f.stripe, actor.id, f.orderId, f.input.id)).toMatchObject({ status: "expired" });
    expect(f.expire).toHaveBeenCalledTimes(1);
    expect((await payPurchaseBill(db, actor, f.orderId)).bills[0].status).toBe("paid");
  });
  it("allows a fresh checkout only after the original checkout is cancelled", async () => {
    const f = await fixture(); await f.start();
    await cancelPurchaseStripe(db, f.stripe, actor.id, f.orderId, f.input.id);
    const id = crypto.randomUUID();
    f.create.mockImplementationOnce(async body => ({ ...f.paid(), id: `cs_test_${id}`, status: "open", payment_status: "unpaid", client_reference_id: body.client_reference_id, metadata: body.metadata }) as Stripe.Checkout.Session);
    expect(await createPurchaseStripe(db, f.stripe, actor.id, f.orderId, { ...f.input, id }, "https://store.example.invalid")).toMatchObject({ paymentId: id, status: "pending", sessionId: `cs_test_${id}` });
    expect(await purchaseStripeStatus(db, actor.id, f.orderId, f.input.id)).toMatchObject({ status: "expired", url: null });
    expect(f.create).toHaveBeenCalledTimes(2);
  });
  it("only charges the supplementary balance and rejects stale versions", async () => {
    const f = await fixture(700);
    await db.insert(walletTransactions).values({id:`purchase:${f.billId}`,userId:actor.id,type:"PURCHASE_PAYMENT",amountFen:-700,currency:"USD",balanceBefore:1000,balanceAfter:300,referenceType:"procurement",referenceId:f.orderId,description:"Fixture initial wallet payment",createdAt:Date.now()-1000});
    await expect(createPurchaseStripe(db, f.stripe, actor.id, f.orderId, { ...f.input, billVersion: 2 }, "https://store.example.invalid")).rejects.toThrow("Refresh");
    await f.start();
    expect(f.create.mock.calls[0][0].line_items?.[0].price_data?.unit_amount).toBe(300);
    await reconcilePurchaseStripe(db, f.paid());
    expect(await f.bill()).toMatchObject({ paidCents: 1000, status: "paid" });
    const view = await customerPurchase(db,actor.id,f.orderId);
    expect(view.bills[0]).toMatchObject({paymentMethod:"mixed",paymentMethods:["wallet","stripe"]});
    expect(view.bills[0].paymentHistory.map(p=>p.amountCents)).toEqual([700,300]);
  });
  it.each([{ amount_total: 999 }, { currency: "eur" }])("holds mismatched paid receipts for review: %j", async mismatch => {
    const f = await fixture(); await f.start();
    await reconcilePurchaseStripe(db, { ...f.paid(), ...mismatch });
    expect(await f.bill()).toMatchObject({ paidCents: 0, status: "issued" });
    expect(await purchaseStripeStatus(db, actor.id, f.orderId, f.input.id)).toMatchObject({ status: "review" });
    await expect(payPurchaseBill(db, actor, f.orderId)).rejects.toThrow();
  });
  it("rolls back the whole settlement on a DB failure and replays safely", async () => {
    const f = await fixture(); await f.start();
    await db.run(sql.raw(`CREATE TRIGGER fail_stripe_settlement BEFORE UPDATE ON payments WHEN NEW.id='${f.input.id}' BEGIN SELECT RAISE(ABORT,'test rollback'); END`));
    await expect(reconcilePurchaseStripe(db, f.paid())).rejects.toThrow();
    expect(await f.bill()).toMatchObject({ status: "issued", paidCents: 0, version: 1 });
    await db.run(sql`DROP TRIGGER fail_stripe_settlement`);
    await reconcilePurchaseStripe(db, f.paid());
    expect((await f.bill()).status).toBe("paid");
  });
  it("verifies the real webhook signature and deduplicates repeated events", async () => {
    const f = await fixture(); await f.start();
    const payload = JSON.stringify({ id: `evt_${f.input.id}`, livemode: false, type: "checkout.session.completed", data: { object: f.paid() } });
    const stripe = new Stripe("sk_test_isolated_dummy");
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    await expect(handleStripeWebhook(db, env, payload, "invalid")).rejects.toThrow("signature");
    expect((await f.bill()).status).toBe("issued");
    await handleStripeWebhook(db, env, payload, signature);
    expect(await handleStripeWebhook(db, env, payload, signature)).toMatchObject({ duplicate: true });
    expect(await f.bill()).toMatchObject({ status: "paid", paidCents: 1000, version: 2 });
  });
  it("keeps refund/dispute receipts under review instead of refunding the wallet", async () => {
    const f = await fixture(); await f.start(); await reconcilePurchaseStripe(db, f.paid());
    await applyPurchaseStripeEvent(db, { type: "charge.refunded", data: { object: { payment_intent: f.paid().payment_intent } } } as Stripe.Event);
    expect(await purchaseStripeStatus(db, actor.id, f.orderId, f.input.id)).toMatchObject({ status: "review" });
  });
  it("retries an early refund event until checkout has linked the receipt", async () => {
    const f = await fixture(); await f.start();
    const event = { type: "charge.refunded", data: { object: { payment_intent: f.paid().payment_intent } } } as Stripe.Event;
    await expect(applyPurchaseStripeEvent(db, event)).rejects.toThrow("not linked yet");
    await reconcilePurchaseStripe(db, f.paid());
    expect(await applyPurchaseStripeEvent(db, event)).toBe(true);
    expect(await purchaseStripeStatus(db, actor.id, f.orderId, f.input.id)).toMatchObject({ status: "review" });
  });
  it("requires enabled Stripe and a configured signing secret", async () => {
    await db.update(paymentSettings).set({ stripeEnabled: false });
    await expect(purchaseStripeClient(db, env)).rejects.toThrow("not configured");
    await db.update(paymentSettings).set({ stripeEnabled: true });
  });
  it("can receive the paid webhook before the create response is persisted", async () => {
    const f = await fixture();
    const create = f.create.getMockImplementation()!;
    f.create.mockImplementationOnce(async body => {
      const session = await create(body);
      await reconcilePurchaseStripe(db, { ...session, status: "complete", payment_status: "paid" });
      return session;
    });
    expect(await f.start()).toMatchObject({ status: "paid", url: null });
    expect((await f.bill()).paidCents).toBe(1000);
  });
  it("a completed but unpaid session never credits the bill", async () => {
    const f = await fixture(); await f.start();
    await reconcilePurchaseStripe(db, { ...f.paid(), payment_status: "unpaid" });
    expect((await f.bill()).paidCents).toBe(0);
    await expect(payPurchaseBill(db, actor, f.orderId)).rejects.toThrow();
  });
  it("a definitive create rejection unlocks payment, unlike an unknown network outcome", async () => {
    const f = await fixture();
    f.create.mockRejectedValueOnce({ type: "StripeInvalidRequestError", statusCode: 400 });
    await expect(f.start()).rejects.toThrow("Stripe rejected");
    expect(await purchaseStripeStatus(db, actor.id, f.orderId, f.input.id)).toMatchObject({ status: "expired" });
    expect((await payPurchaseBill(db, actor, f.orderId)).bills[0].status).toBe("paid");
  });
  it("serializes wallet payment against Stripe creation", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([f.start(), payPurchaseBill(db, actor, f.orderId)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const bill = await f.bill();
    expect(bill.status === "paid" ? f.create.mock.calls.length : bill.paidCents).toBe(0);
  });
});
