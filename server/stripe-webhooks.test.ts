import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import Stripe from "stripe";
import { createDb, type Database } from "./db/client";
import { bankAccounts, checkouts, paymentSettings, paymentSettingsRevisions, stripeWebhookRegistrations as registrations } from "./db/schema";
import { createShipmentCheckoutSession, createTopupCheckoutSession, handleStripeWebhook, publicPaymentSettings, savePaymentSettings } from "./payments";
import { cleanupStripeWebhooks, registerStripeWebhook, stripeWebhookUrl, webhookEvents, type StripeWebhookFactory } from "./stripe-webhooks";
import { decryptSecret, encryptSecret } from "./email/crypto";
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("cloudflare:sockets", () => ({ connect: vi.fn() }));

let mf: Miniflare, db: Database;
const env = { BETTER_AUTH_SECRET: "isolated-config-test", APP_URL: "https://shop.example.com" };
const base = { revision: 0, stripeEnabled: true, stripeMode: "test" as const, publishableKey: "pk_test_dummy", secretKey: "sk_test_dummy", cardTopupEnabled: true,
  minTopupFen: 100, maxTopupFen: 1000, dailyTopupFen: 2000, bankEnabled: false, bankAccounts: [] };
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "stripe-webhooks-test", modules: true, script: "export default {fetch(){return new Response('test')}}", d1Databases: ["DB"] }] }));
  const binding = await mf.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) {
    await binding.batch(readFileSync(`drizzle/${file}`, "utf8").split(";").map(s => s.replaceAll("--> statement-breakpoint", "").trim()).filter(Boolean).map(s => binding.prepare(s)));
  }
  db = createDb(binding as unknown as D1Database);
}, 30000);
afterAll(async () => { await mf?.dispose(); });
beforeEach(async () => {
  await db.batch([db.delete(bankAccounts), db.delete(paymentSettings), db.delete(paymentSettingsRevisions), db.delete(registrations)]);
});

function remote() {
  const endpoints = new Map<string, { id: string; secret: string; livemode: boolean }>();
  let timeoutOnce = false, rejectDelete = false;
  const create = vi.fn(async (_body: Stripe.WebhookEndpointCreateParams, options?: Stripe.RequestOptions) => {
    const id = options!.idempotencyKey!;
    if (!endpoints.has(id)) endpoints.set(id, { id: `we_${endpoints.size + 1}`, secret: `whsec_${endpoints.size + 1}`, livemode: false });
    if (timeoutOnce) { timeoutOnce = false; throw new Error("simulated lost response"); }
    return endpoints.get(id)!;
  });
  const del = vi.fn(async () => { if (rejectDelete) throw new Error("simulated permissions failure"); return { deleted: true }; });
  const factory = vi.fn(() => ({ webhookEndpoints: { create, del } })) as unknown as StripeWebhookFactory;
  return { factory, create, del, endpoints, timeout: () => { timeoutOnce = true; }, deletionFails: (value: boolean) => { rejectDelete = value; } };
}
async function row() { return (await db.select().from(paymentSettings))[0]; }

describe("automatic Stripe Webhook configuration", () => {
  it("passes caller frontend URLs to shipment and top-up Checkout without touching the notification URL", async () => {
    const r = remote();
    await savePaymentSettings(db, env, base, r.factory);
    const id = crypto.randomUUID(), userId = crypto.randomUUID();
    await db.insert(checkouts).values({ id, userId, status: "READY", currency: "USD", totalFen: 100, createdAt: Date.now(), expiresAt: Date.now() + 60000 });
    const bodies: URLSearchParams[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      expect(String(input)).toBe("https://api.stripe.com/v1/checkout/sessions");
      bodies.push(new URLSearchParams(String(init?.body)));
      return new Response(JSON.stringify({ id: `cs_mock_${crypto.randomUUID()}`, url: "https://checkout.stripe.com/mock", payment_intent: null }), { status: 200, headers: { "content-type": "application/json" } });
    });
    try {
      await createShipmentCheckoutSession(db, env, userId, id, "https://backend.example", { successUrl: "https://client.example/paid", cancelUrl: "https://client.example/cancel" });
      await createTopupCheckoutSession(db, env, userId, 100, "https://backend.example", { successUrl: "https://client.example/paid", cancelUrl: "https://client.example/cancel" });
    } finally { fetchSpy.mockRestore(); }
    expect(bodies).toHaveLength(2);
    expect(new URL(bodies[0].get("success_url")!).searchParams.get("checkoutId")).toBe(id);
    expect(new URL(bodies[1].get("success_url")!).searchParams.get("purpose")).toBe("topup");
    for (const body of bodies) {
      expect(body.get("success_url")).toContain("https://client.example/paid?");
      expect(body.get("success_url")).toContain("session_id={CHECKOUT_SESSION_ID}");
      expect(body.get("cancel_url")).toContain("https://client.example/cancel?");
    }
    expect((await publicPaymentSettings(db)).webhookUrl).toBe(`${env.APP_URL}/api/payments/stripe/webhook`);
  });

  it("registers the handled events and encrypted secret, exposing only safe status", async () => {
    const r = remote();
    const result = await savePaymentSettings(db, env, base, r.factory);
    expect(result).toMatchObject({ revision: 1, webhookSet: true, webhookEndpointId: "we_1", webhookUrl: `${env.APP_URL}/api/payments/stripe/webhook` });
    expect(r.create.mock.calls[0][0]).toMatchObject({ enabled_events: webhookEvents, api_version: Stripe.API_VERSION });
    expect(await decryptSecret(env.BETTER_AUTH_SECRET, (await row()).stripeWebhookCiphertext!)).toBe("whsec_1");
    expect(JSON.stringify(result)).not.toMatch(/sk_test_dummy|whsec_/);
  });

  it("rotates on save with a blank key, keeping the managed old endpoint until its retry grace expires", async () => {
    const r = remote(); await savePaymentSettings(db, env, base, r.factory);
    const next = await savePaymentSettings(db, env, { ...base, revision: 1, secretKey: "" }, r.factory);
    expect(next.webhookEndpointId).toBe("we_2");
    expect(r.del).not.toHaveBeenCalled();
    await db.update(registrations).set({ retiredAt: 1 }).where(eq(registrations.endpointId, "we_1"));
    await cleanupStripeWebhooks(db, env.BETTER_AUTH_SECRET, r.factory);
    expect(r.del).toHaveBeenCalledExactlyOnceWith("we_1");
    const old = (await db.select().from(registrations).where(eq(registrations.endpointId, "we_1")))[0];
    expect(old.keyCiphertext).toBeNull(); expect(old.deletedAt).toBeTruthy();
  });

  it("recovers a lost remote response using the same durable idempotency key", async () => {
    const r = remote(); r.timeout();
    await expect(savePaymentSettings(db, env, base, r.factory)).rejects.toThrow("Existing payment settings were kept");
    expect((await row()).revision).toBe(0);
    await savePaymentSettings(db, env, base, r.factory);
    expect(r.endpoints.size).toBe(1);
    expect(r.create.mock.calls[0][1]).toEqual(r.create.mock.calls[1][1]);
  });

  it("rolls back bank accounts and config if a batch write fails, and reuses the registered secret", async () => {
    const r = remote(); await savePaymentSettings(db, env, base, r.factory);
    await db.run(sql`CREATE TRIGGER fail_settings BEFORE UPDATE ON payment_settings BEGIN SELECT RAISE(ABORT, 'test interruption'); END`);
    try { await expect(savePaymentSettings(db, env, { ...base, revision: 1 }, r.factory)).rejects.toThrow(); }
    finally { await db.run(sql`DROP TRIGGER fail_settings`); }
    expect((await row()).revision).toBe(1); expect(r.del).not.toHaveBeenCalled();
    expect(await db.select().from(paymentSettingsRevisions)).toHaveLength(1);
    await savePaymentSettings(db, env, { ...base, revision: 1 }, r.factory);
    expect(r.create).toHaveBeenCalledTimes(2); // Initial registration + replacement, no third request.
  });

  it("allows exactly one concurrent save and rejects stale pages without another remote call", async () => {
    const r = remote(); await publicPaymentSettings(db);
    const results = await Promise.allSettled([
      savePaymentSettings(db, env, { ...base, maxTopupFen: 1100 }, r.factory),
      savePaymentSettings(db, env, { ...base, maxTopupFen: 1200 }, r.factory),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await row()).revision).toBe(1);
    expect(r.endpoints.size).toBe(1); expect(r.del).not.toHaveBeenCalled();
    const calls = r.create.mock.calls.length;
    await expect(savePaymentSettings(db, env, base, r.factory)).rejects.toThrow("Reload");
    expect(r.create).toHaveBeenCalledTimes(calls);
  });

  it("never mixes bank accounts or signing secrets from two concurrent configurations", async () => {
    const r = remote(); await publicPaymentSettings(db);
    const account = (id: string) => ({ id, label: id, bankName: id, accountHolder: id, accountNumber: id, swift: "", country: "", currency: "USD", instructions: "" });
    const results = await Promise.allSettled(["a", "b"].map(id => savePaymentSettings(db, env, {
      ...base, secretKey: `sk_test_${id}`, publishableKey: `pk_test_${id}`, bankEnabled: true, bankAccounts: [account(id)],
    }, r.factory)));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const saved = await row();
    const winner = saved.stripePublishableKey!.slice(-1);
    expect(await decryptSecret(env.BETTER_AUTH_SECRET, saved.stripeSecretCiphertext!)).toBe(`sk_test_${winner}`);
    expect((await db.select().from(bankAccounts)).map(a => a.id)).toEqual([winner]);
    const active = (await db.select().from(registrations).where(eq(registrations.id, saved.stripeWebhookRegistrationId!)))[0];
    expect(active.retiredAt).toBeNull();
    expect(active.secretCiphertext).toBe(saved.stripeWebhookCiphertext);
  });

  it("rolls back the prior account deletion if inserting the replacement account fails", async () => {
    const r = remote();
    const account = { id: "old", label: "", bankName: "Bank", accountHolder: "Holder", accountNumber: "123", swift: "", country: "", currency: "USD", instructions: "" };
    await savePaymentSettings(db, env, { ...base, bankAccounts: [account] }, r.factory);
    await db.run(sql`CREATE TRIGGER fail_bank_insert BEFORE INSERT ON bank_accounts BEGIN SELECT RAISE(ABORT, 'test bank failure'); END`);
    try { await expect(savePaymentSettings(db, env, { ...base, revision: 1, bankAccounts: [{ ...account, id: "new" }] }, r.factory)).rejects.toThrow(); }
    finally { await db.run(sql`DROP TRIGGER fail_bank_insert`); }
    expect((await row()).revision).toBe(1);
    expect((await db.select().from(bankAccounts)).map(a => a.id)).toEqual(["old"]);
    expect(await db.select().from(paymentSettingsRevisions)).toHaveLength(1);
  });

  it("keeps cleanup failures visible and retries using the original credential", async () => {
    const r = remote(); await savePaymentSettings(db, env, base, r.factory);
    r.deletionFails(true);
    await savePaymentSettings(db, env, { ...base, revision: 1, secretKey: "sk_test_replacement" }, r.factory);
    await db.update(registrations).set({ retiredAt: 1 }).where(eq(registrations.endpointId, "we_1"));
    await cleanupStripeWebhooks(db, env.BETTER_AUTH_SECRET, r.factory);
    const next = await publicPaymentSettings(db);
    expect(next.webhookCleanupPending).toBe(true);
    expect(r.factory).toHaveBeenLastCalledWith("sk_test_dummy");
    r.deletionFails(false);
    expect((await savePaymentSettings(db, env, { ...base, revision: 2, secretKey: "" }, r.factory)).webhookCleanupPending).toBe(false);
  });

  it("accepts an in-flight old signed event during rotation and rejects wrong mode or expired grace", async () => {
    const r = remote(); await savePaymentSettings(db, env, base, r.factory);
    await savePaymentSettings(db, env, { ...base, revision: 1 }, r.factory);
    const raw = JSON.stringify({ id: crypto.randomUUID(), type: "unhandled.test", livemode: false, data: { object: {} } });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: "whsec_1" });
    expect(await handleStripeWebhook(db, env, raw, signature)).toMatchObject({ ok: true });
    expect(await handleStripeWebhook(db, env, raw, signature)).toMatchObject({ duplicate: true });
    const wrongMode = raw.replace('"livemode":false', '"livemode":true');
    await expect(handleStripeWebhook(db, env, wrongMode, Stripe.webhooks.generateTestHeaderString({ payload: wrongMode, secret: "whsec_2" }))).rejects.toThrow("signature");
    await db.update(registrations).set({ retiredAt: 1 }).where(eq(registrations.endpointId, "we_1"));
    await expect(handleStripeWebhook(db, env, raw, signature)).rejects.toThrow("signature");
  });

  it("migrates a legacy secret without deleting an endpoint it does not own", async () => {
    await publicPaymentSettings(db);
    await db.update(paymentSettings).set({ stripeWebhookCiphertext: await encryptSecret(env.BETTER_AUTH_SECRET, "whsec_legacy") });
    const r = remote(); await savePaymentSettings(db, env, base, r.factory);
    expect(r.del).not.toHaveBeenCalled();
    expect((await db.select().from(registrations)).some(r => r.id === "legacy-1")).toBe(true);
  });

  it("saves bank-only settings without Stripe or a public URL", async () => {
    const r = remote();
    await savePaymentSettings(db, {}, { ...base, stripeEnabled: false, secretKey: "", publishableKey: "" }, r.factory);
    expect(r.create).not.toHaveBeenCalled(); expect((await row()).revision).toBe(1);
  });

  it("fails closed after the safe idempotency retry window", async () => {
    const r = remote(); r.timeout();
    const input = { revision: 1, key: base.secretKey, mode: "test" as const, url: stripeWebhookUrl(env.APP_URL) };
    await expect(registerStripeWebhook(db, env.BETTER_AUTH_SECRET, input, r.factory)).rejects.toThrow();
    await db.update(registrations).set({ createdAt: 1 });
    await expect(registerStripeWebhook(db, env.BETTER_AUTH_SECRET, input, r.factory)).rejects.toThrow("unresolved");
    expect(r.create).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, "http://shop.example.com", "https://localhost", "https://127.0.0.1", "https://user:pass@example.com"])("rejects non-public callback configuration %s", value => {
    expect(() => stripeWebhookUrl(value)).toThrow("public HTTPS");
  });
});
