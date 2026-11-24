import Stripe from "stripe";
import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import type { Database } from "./db/client";
import { stripeWebhookRegistrations as registrations } from "./db/schema";
import { decryptSecret, encryptSecret } from "./email/crypto";
import { AppError } from "./errors";

export const webhookEvents: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed", "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed", "checkout.session.expired",
  "charge.refunded", "charge.dispute.created", "charge.dispute.closed",
];
export const webhookGraceMs = 3 * 24 * 60 * 60 * 1000;
export type StripeWebhookClient = Pick<Stripe, "webhookEndpoints">;
export type StripeWebhookFactory = (key: string) => StripeWebhookClient;
export const webhookClient: StripeWebhookFactory = key => new Stripe(key, {
  httpClient: Stripe.createFetchHttpClient(), timeout: 20_000, maxNetworkRetries: 1,
});

export function stripeWebhookUrl(appUrl?: string) {
  let url: URL;
  try { url = new URL(appUrl ?? ""); } catch { throw new AppError("VALIDATION_ERROR", "Set APP_URL to the public HTTPS website address before saving Stripe."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hostname === "localhost" || !url.hostname.includes(".") || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) {
    throw new AppError("VALIDATION_ERROR", "Set APP_URL to the public HTTPS website address before saving Stripe.");
  }
  return new URL("/api/payments/stripe/webhook", url.origin).href;
}

export async function registerStripeWebhook(db: Database, authSecret: string, input: {
  revision: number; key: string; url: string; mode: "test" | "live";
}, factory: StripeWebhookFactory = webhookClient) {
  // No raw key is exposed in the operation ID, metadata, logs, or client response.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(input)));
  const id = `settings-${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")}`;
  await db.insert(registrations).values({ id, keyCiphertext: await encryptSecret(authSecret, input.key), url: input.url,
    mode: input.mode, apiVersion: Stripe.API_VERSION, createdAt: Date.now() }).onConflictDoNothing();
  const row = (await db.select().from(registrations).where(eq(registrations.id, id)))[0];
  if (row.secretCiphertext && row.endpointId) return row;
  // Stripe only guarantees retention of idempotency results for 24h. Fail closed
  // after that window instead of creating an untracked duplicate endpoint.
  if (Date.now() - row.createdAt > 23 * 60 * 60 * 1000) {
    throw new AppError("STRIPE_WEBHOOK_REVIEW", "An earlier Webhook registration is unresolved. Check its settings_operation metadata in Stripe before retrying with updated settings.", 409);
  }
  try {
    const endpoint = await factory(input.key).webhookEndpoints.create({
      url: row.url, enabled_events: webhookEvents, api_version: row.apiVersion as Stripe.WebhookEndpointCreateParams.ApiVersion,
      metadata: { settings_operation: id },
    }, { idempotencyKey: id });
    if (!endpoint.secret || endpoint.livemode !== (input.mode === "live")) throw new Error("Invalid endpoint response");
    const secretCiphertext = await encryptSecret(authSecret, endpoint.secret);
    await db.update(registrations).set({ endpointId: endpoint.id, secretCiphertext }).where(eq(registrations.id, id));
    return { ...row, endpointId: endpoint.id, secretCiphertext };
  } catch {
    // Do not leak SDK errors, credentials, or signing secrets to the browser/log.
    throw new AppError("STRIPE_WEBHOOK_FAILED", "Could not register the Stripe Webhook. Check the secret key and its Webhook permissions, then retry. Existing payment settings were kept.", 502);
  }
}

export async function cleanupStripeWebhooks(db: Database, authSecret: string, factory: StripeWebhookFactory = webhookClient) {
  const rows = await db.select().from(registrations).where(and(lte(registrations.retiredAt, Date.now() - webhookGraceMs), isNull(registrations.deletedAt), isNotNull(registrations.endpointId))).limit(10);
  for (const row of rows) {
    if (!row.endpointId || !row.keyCiphertext) continue; // Legacy manually managed endpoint.
    try {
      const key = await decryptSecret(authSecret, row.keyCiphertext);
      try { await factory(key).webhookEndpoints.del(row.endpointId); }
      catch (error) { if (!(error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing")) throw error; }
      await db.update(registrations).set({ deletedAt: Date.now(), keyCiphertext: null }).where(eq(registrations.id, row.id));
    } catch { /* Keep credentials encrypted for cleanup retry on the next save. */ }
  }
}
