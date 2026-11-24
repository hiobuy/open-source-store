import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { manualPurchaseInput, manualCartVersion, manualCartUpdate, type ManualPurchaseInput } from "../src/domain/manual-purchase";
import type { Database } from "./db/client";
import { cartItems } from "./db/schema";
import { AppError } from "./errors";
import { parseInput } from "./operations-input";
import { createManualPurchase } from "./manual-purchase";

const conflict = () => { throw new AppError("CART_CHANGED", "This cart entry changed or is being submitted. Reload before continuing.", 409); };
const owned = (customerId: string, id: string) => and(eq(cartItems.type,"manual"), eq(cartItems.customerId, customerId), eq(cartItems.id, id));
export function manualCartView(row: typeof cartItems.$inferSelect) {
  return { type:"manual" as const, id: row.id, form: JSON.parse(row.payload) as ManualPurchaseInput, version: row.version, state: row.state, createdAt: row.createdAt, updatedAt: row.updatedAt };
}
async function read(db: Database, customerId: string, id: string) {
  parseInput(z.string().uuid(), id);
  const [row] = await db.select().from(cartItems).where(owned(customerId, id));
  if (!row) throw new AppError("NOT_FOUND", "Cart item not found.", 404);
  return row;
}
export async function addManualCart(db: Database, customerId: string, raw: unknown) {
  const input = parseInput(manualPurchaseInput, raw), payload = JSON.stringify(input), now = Date.now();
  await db.insert(cartItems).values({ id: input.id, type:"manual", channel:input.sourcePlatform, quantity:input.items.reduce((n,i)=>n+i.quantity,0), customerId, payload, initialPayload: payload, orderId: crypto.randomUUID(), createdAt: now, updatedAt: now }).onConflictDoNothing();
  const row = await read(db, customerId, input.id);
  if (row.initialPayload !== payload || row.state !== "draft") conflict();
  return manualCartView(row);
}
export async function updateManualCart(db: Database, customerId: string, id: string, raw: unknown) {
  const { version, form } = parseInput(manualCartUpdate, raw);
  await read(db, customerId, id);
  if (form.id !== id) conflict();
  const [row] = await db.update(cartItems).set({ payload: JSON.stringify(form), channel:form.sourcePlatform, quantity:form.items.reduce((n,i)=>n+i.quantity,0), version: sql`${cartItems.version}+1`, updatedAt: Date.now() })
    .where(and(owned(customerId, id), eq(cartItems.state, "draft"), eq(cartItems.version, version))).returning();
  if (!row) conflict();
  return manualCartView(row);
}
export async function removeManualCart(db: Database, customerId: string, id: string, raw: unknown) {
  const { version } = parseInput(manualCartVersion, raw), before = await read(db, customerId, id);
  if (before.state === "removed" && before.version === version) return { ok: true };
  const [row] = await db.update(cartItems).set({ state: "removed", updatedAt: Date.now() })
    .where(and(owned(customerId, id), eq(cartItems.state, "draft"), eq(cartItems.version, version))).returning();
  if (!row) conflict();
  return { ok: true };
}
/** Durable checkout intent: freeze edits first, then create one idempotent local order. */
export async function checkoutManualCart(db: Database, actor: { id: string; email: string }, id: string, raw: unknown) {
  const { version } = parseInput(manualCartVersion, raw);
  const before = await read(db, actor.id, id);
  if (before.version !== version || before.state === "removed") conflict();
  if (before.state === "submitted") return { id: before.orderId! };
  await db.update(cartItems).set({ state: "submitting", updatedAt: Date.now() })
    .where(and(owned(actor.id, id), eq(cartItems.state, "draft"), eq(cartItems.version, version)));
  const frozen = await read(db, actor.id, id);
  if (frozen.version !== version || !["submitting", "submitted"].includes(frozen.state)) conflict();
  const result = await createManualPurchase(db, actor, { ...JSON.parse(frozen.payload), id: frozen.orderId });
  await db.update(cartItems).set({ state: "submitted", updatedAt: Date.now() }).where(and(owned(actor.id, id), eq(cartItems.state, "submitting"), eq(cartItems.version, version)));
  return result;
}
