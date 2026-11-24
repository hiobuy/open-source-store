import { and, desc, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { z } from "zod";
import type { Database } from "./db/client";
import { payments, procurementBills, procurementOrders, purchaseCouponRedemptions, purchaseStripePayments as attempts } from "./db/schema";
import { AppError } from "./errors";
import { purchaseReturnUrls } from "../src/domain/site";
import { stripeRedirects } from "../src/domain/stripe-redirects";
import { stripeRedirectInput } from "./stripe-redirects";

export const purchaseStripeInput = stripeRedirectInput.extend({ id: z.uuid(), confirm: z.literal(true), billVersion: z.number().int().positive(), amountCents: z.number().int().positive().max(999999999) }).strict();
const conflict = (message: string): never => { throw new AppError("PURCHASE_PAYMENT_CONFLICT", message, 409); };
type Attempt = typeof attempts.$inferSelect;
type StripeClient = Pick<Stripe, "checkout">;

function present(a: Attempt) {
  return { paymentId: a.id, orderId: a.orderId, sessionId: a.sessionId, url: a.state === "pending" ? a.url : null, status: a.state, amountCents: a.amountCents, currency: a.currency };
}

async function ownedOrder(db: Database, userId: string, orderId: string) {
  const order = (await db.select().from(procurementOrders).where(and(eq(procurementOrders.id, orderId), eq(procurementOrders.customerId, userId))))[0];
  if (!order) throw new AppError("NOT_FOUND", "Purchase order not found.", 404);
  return order;
}

export async function createPurchaseStripe(db: Database, stripe: StripeClient, userId: string, orderId: string, raw: unknown, origin: string) {
  const input = purchaseStripeInput.parse(raw);
  const order = await ownedOrder(db, userId, orderId);
  let a = (await db.select().from(attempts).where(eq(attempts.id, input.id)))[0];
  if (a && (a.userId !== userId || a.orderId !== orderId || a.billVersion !== input.billVersion || a.amountCents !== input.amountCents)) conflict("Payment id already belongs to a different request.");
  if (!a) {
    const held = (await db.select({ id: attempts.id }).from(attempts).innerJoin(payments, eq(payments.id, attempts.id)).where(and(eq(attempts.orderId, orderId), eq(attempts.userId, userId), sql`${payments.riskStatus} IS NOT NULL`)).limit(1))[0];
    if (held) throw new AppError("PAYMENT_REVIEW", "This card payment needs staff review. Contact support before paying again.", 409, { paymentId: held.id, status: "review" });
    const bill = (await db.select().from(procurementBills).where(and(eq(procurementBills.orderId, orderId), eq(procurementBills.customerId, userId), eq(procurementBills.status, "issued"))))[0];
    if (order.status !== "draft" || !bill || bill.version !== input.billVersion || bill.totalCents - bill.paidCents !== input.amountCents) conflict("Refresh the bill and confirm its current unpaid amount.");
    const now = Date.now();
    const redirects = stripeRedirects(input, {
      success_url: purchaseReturnUrls(origin, orderId).success,
      cancel_url: purchaseReturnUrls(origin, orderId).cancel,
    }, { purpose: "purchase", orderId, billId: bill.id, paymentId: input.id });
    try {
      await db.batch([
        db.insert(attempts).select(sql`SELECT ${input.id},b.order_id,b.id,b.customer_id,b.version,b.paid_cents,${input.amountCents},b.currency,'pending',NULL,NULL,${origin},${now},${redirects.success_url},${redirects.cancel_url}
          FROM procurement_bills b JOIN procurement_orders o ON o.id=b.order_id
          WHERE b.id=${bill.id} AND b.customer_id=${userId} AND b.status='issued' AND b.version=${input.billVersion}
          AND b.total_cents-b.paid_cents=${input.amountCents} AND o.status='draft'
          AND NOT EXISTS (SELECT 1 FROM purchase_stripe_payments s JOIN payments p ON p.id=s.id WHERE s.order_id=o.id AND p.risk_status IS NOT NULL)`),
        db.insert(payments).select(sql`SELECT id,user_id,'purchase','stripe',amount_cents,currency,'pending',NULL,NULL,NULL,NULL,NULL,NULL,NULL,${`purchase-stripe:${input.id}`},created_at,NULL FROM purchase_stripe_payments WHERE id=${input.id}`),
      ]);
    } catch (error) {
      // The unique active-bill constraint is the concurrency guard. Recover its
      // winner even when a restarted client submits a different request id.
      const existing = (await db.select().from(attempts).where(and(eq(attempts.billId, bill.id), sql`${attempts.state} IN ('pending','review')`)))[0];
      if (!existing) throw error;
      if (existing.userId !== userId || existing.orderId !== orderId || existing.billVersion !== input.billVersion || existing.amountCents !== input.amountCents || existing.paidBefore !== bill.paidCents || existing.currency !== bill.currency) conflict("Refresh the bill and confirm its current unpaid amount.");
      a = existing;
    }
    a ??= (await db.select().from(attempts).where(eq(attempts.id, input.id)))[0];
    if (!a) conflict("The bill changed before payment could be started.");
  }
  const current = await purchaseStripeStatus(db, userId, orderId, a.id);
  if (current.status === "review") throw new AppError("PAYMENT_REVIEW", "This card payment needs staff review. Contact support before paying again.", 409, { paymentId: a.id, status: "review" });
  if (current.status !== "pending" || current.sessionId) return current;
  // Stripe can prune idempotency keys after 24h. Never recreate an unknown old charge.
  if (Date.now() - a.createdAt > 23 * 60 * 60_000) conflict("Payment creation needs operator reconciliation; do not create another payment.");
  let session: Stripe.Checkout.Session;
  try { session = await stripe.checkout.sessions.create({
    mode: "payment", allowed_payment_method_types: ["card"], client_reference_id: a.id,
    success_url: a.successUrl ?? purchaseReturnUrls(a.origin, a.orderId).success,
    cancel_url: a.cancelUrl ?? purchaseReturnUrls(a.origin, a.orderId).cancel,
    line_items: [{ quantity: 1, price_data: { currency: a.currency.toLowerCase(), unit_amount: a.amountCents, product_data: { name: "Purchase order payment" } } }],
    metadata: { purpose: "purchase", paymentId: a.id, orderId: a.orderId, billId: a.billId, userId: a.userId },
  }, { idempotencyKey: `purchase-stripe:${a.id}` });
  } catch (error) {
    // A definitive validation rejection created no session. Network/5xx/unknown
    // outcomes must remain locked and retry using the original idempotency key.
    const failure = error as { type?: string; statusCode?: number };
    if (failure.type === "StripeInvalidRequestError" && failure.statusCode === 400) {
      await db.batch([
        db.update(attempts).set({ state: "expired" }).where(and(eq(attempts.id, a.id), eq(attempts.state, "pending"), sql`${attempts.sessionId} IS NULL`)),
        db.update(payments).set({ status: "failed" }).where(and(eq(payments.id, a.id), eq(payments.status, "pending"), sql`EXISTS (SELECT 1 FROM purchase_stripe_payments WHERE id=${a.id} AND state='expired')`)),
      ]);
      throw new AppError("PAYMENT_REJECTED", "Stripe rejected this payment request. Check the supported currency and minimum charge amount before retrying.", 409);
    }
    throw new AppError("PAYMENT_PENDING", "Stripe creation could not be confirmed. Retry with the same payment id to recover the session.", 503, { paymentId: a.id, status: "pending" });
  }
  // An early webhook may already have settled the attempt; never reset its state.
  await db.batch([
    db.update(attempts).set({ sessionId: session.id, url: session.url }).where(and(eq(attempts.id, a.id), sql`(${attempts.sessionId} IS NULL OR ${attempts.sessionId}=${session.id})`)),
    db.update(payments).set({ stripeSessionId: session.id }).where(and(eq(payments.id, a.id), sql`(${payments.stripeSessionId} IS NULL OR ${payments.stripeSessionId}=${session.id})`)),
  ]);
  return purchaseStripeStatus(db, userId, orderId, a.id);
}

export async function latestPurchaseStripe(db: Database, userId: string, orderId: string) {
  await ownedOrder(db, userId, orderId);
  const a = (await db.select({ id: attempts.id }).from(attempts).where(and(eq(attempts.orderId, orderId), eq(attempts.userId, userId))).orderBy(desc(attempts.createdAt), desc(attempts.id)).limit(1))[0];
  return a ? purchaseStripeStatus(db, userId, orderId, a.id) : null;
}

export async function purchaseStripeStatus(db: Database, userId: string, orderId: string, paymentId: string) {
  const a = (await db.select().from(attempts).where(and(eq(attempts.id, paymentId), eq(attempts.orderId, orderId), eq(attempts.userId, userId))))[0];
  if (!a) throw new AppError("NOT_FOUND", "Payment not found.", 404);
  const payment = (await db.select({ risk: payments.riskStatus }).from(payments).where(eq(payments.id, paymentId)))[0];
  return { ...present(a), ...(payment?.risk ? { status: "review", url: null } : {}) };
}

export async function cancelPurchaseStripe(db: Database, stripe: StripeClient, userId: string, orderId: string, paymentId: string) {
  let state = await purchaseStripeStatus(db, userId, orderId, paymentId);
  if (state.status !== "pending") return state;
  if (!state.sessionId) conflict("Retry the original payment creation request to recover its session before cancelling.");
  let session = await stripe.checkout.sessions.retrieve(state.sessionId!);
  if (session.status === "open") {
    try { session = await stripe.checkout.sessions.expire(session.id); }
    catch { session = await stripe.checkout.sessions.retrieve(session.id); }
  }
  await reconcilePurchaseStripe(db, session);
  state = await purchaseStripeStatus(db, userId, orderId, paymentId);
  if (state.status === "pending") conflict("Stripe is still processing this payment. Wait for confirmation.");
  return state;
}

/** Called only with a verified webhook or a server-to-Stripe retrieval response. */
export async function reconcilePurchaseStripe(db: Database, session: Stripe.Checkout.Session) {
  const id = session.metadata?.paymentId;
  if (!id) throw new AppError("PAYMENT_REVIEW", "Purchase payment metadata is missing.", 409);
  const a = (await db.select().from(attempts).where(eq(attempts.id, id)))[0];
  if (!a) throw new AppError("PAYMENT_REVIEW", "Purchase payment is not linked yet.", 409);
  if (a.state === "paid" || a.state === "review") return;
  const identityMatches = session.metadata?.purpose === "purchase" && session.metadata.userId === a.userId && session.metadata.orderId === a.orderId && session.metadata.billId === a.billId && session.client_reference_id === a.id && (!a.sessionId || a.sessionId === session.id);
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  if (!identityMatches) throw new AppError("PAYMENT_REVIEW", "Stripe purchase identity mismatch.", 409);
  if (session.payment_status !== "paid") {
    // A redirect, timeout or failed card attempt is not proof the session cannot be paid.
    if (session.status === "expired") await db.batch([
      db.update(attempts).set({ state: "expired", sessionId: session.id }).where(and(eq(attempts.id, id), eq(attempts.state, "pending"))),
      db.update(payments).set({ status: "failed", stripeSessionId: session.id }).where(and(eq(payments.id, id), eq(payments.status, "pending"), sql`EXISTS (SELECT 1 FROM purchase_stripe_payments WHERE id=${id} AND state='expired')`)),
    ]);
    return;
  }
  const now = Date.now();
  const valid = session.amount_total === a.amountCents && session.currency?.toUpperCase() === a.currency && session.mode === "payment";
  // D1 batch is atomic: bill credit, payment record and coupon redemption succeed together.
  const claim = sql`EXISTS (SELECT 1 FROM purchase_stripe_payments s JOIN payments p ON p.id=s.id WHERE s.id=${id} AND s.state='pending' AND p.status='pending' AND p.risk_status IS NULL)`;
  const credited = sql`EXISTS (SELECT 1 FROM procurement_bills WHERE id=${a.billId} AND status='paid' AND version=${a.billVersion + 1} AND paid_cents=${a.paidBefore + a.amountCents})`;
  await db.batch([
    db.update(procurementBills).set({ status: "paid", paidCents: a.paidBefore + a.amountCents, paidAt: now, version: a.billVersion + 1 }).where(and(
      eq(procurementBills.id, a.billId), eq(procurementBills.customerId, a.userId), eq(procurementBills.status, "issued"), eq(procurementBills.version, a.billVersion), eq(procurementBills.paidCents, a.paidBefore), eq(procurementBills.totalCents, a.paidBefore + a.amountCents),
      sql`${valid ? 1 : 0}=1 AND ${claim} AND EXISTS (SELECT 1 FROM procurement_orders WHERE id=${a.orderId} AND status='draft')`,
    )),
    db.update(payments).set({ status: sql`CASE WHEN ${valid ? 1 : 0}=1 AND ${claim} AND ${credited} THEN 'paid' ELSE 'held' END`, riskStatus: sql`CASE WHEN ${valid ? 1 : 0}=1 AND ${claim} AND ${credited} THEN NULL ELSE 'review' END`, stripeSessionId: session.id, stripePaymentIntentId: intent, paidAt: now }).where(and(eq(payments.id, id), sql`${payments.status} IN ('pending','failed')`)),
    db.update(attempts).set({ state: sql`CASE WHEN EXISTS (SELECT 1 FROM payments WHERE id=${id} AND status='paid') THEN 'paid' ELSE 'review' END`, sessionId: session.id }).where(and(eq(attempts.id, id), sql`${attempts.state} IN ('pending','expired')`)),
    db.update(purchaseCouponRedemptions).set({ state: "redeemed", updatedAt: now }).where(and(eq(purchaseCouponRedemptions.billId, a.billId), eq(purchaseCouponRedemptions.state, "reserved"), sql`EXISTS (SELECT 1 FROM purchase_stripe_payments WHERE id=${id} AND state='paid')`)),
  ]);
}

export async function applyPurchaseStripeEvent(db: Database, event: Stripe.Event) {
  if (event.type === "charge.refunded" || event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") {
    const object = event.data.object as Stripe.Charge | Stripe.Dispute;
    const intent = typeof object.payment_intent === "string" ? object.payment_intent : object.payment_intent?.id;
    if (!intent) return false;
    const payment = (await db.select().from(payments).where(eq(payments.stripePaymentIntentId, intent)))[0];
    // Refund/dispute webhooks may precede checkout completion. Let Stripe retry
    // instead of acknowledging and losing an event before the receipt is linked.
    if (!payment) throw new AppError("PAYMENT_REVIEW", "The refunded or disputed payment is not linked yet.", 409);
    if (payment.purpose !== "purchase") return false;
    // Refunds/disputes require order-level reconciliation; never deduct the customer wallet.
    // Preserve the receipt history and prevent new procurement until staff resolves it.
    await db.update(payments).set({ status: "held", riskStatus: "review", hiobuyError: "Stripe refund or dispute: reconcile the purchase order before fulfillment." }).where(eq(payments.id, payment.id));
    return true;
  }
  if (!event.type.startsWith("checkout.session.")) return false;
  const session = event.data.object as Stripe.Checkout.Session;
  const linked = (await db.select({ id: attempts.id }).from(attempts).where(eq(attempts.sessionId, session.id)))[0];
  if (session.metadata?.purpose !== "purchase" && !linked) return false;
  await reconcilePurchaseStripe(db, session);
  return true;
}
