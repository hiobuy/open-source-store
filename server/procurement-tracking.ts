import { and, asc, count, desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { Hono } from "hono";
import type { AdminEnv } from "./admin";
import type { Database } from "./db/client";
import { auditLogs, packages, procurementOrders, procurementRemote, procurementItems, procurementItemPackages as links, procurementAftersales as cases, procurementTrackingEvents as events, user } from "./db/schema";
import { AppError } from "./errors";
import { domesticPurchaseTracking } from "./purchase-logistics";
import { listInput, parseInput } from "./operations-input";
import { AFTERSALE_KINDS, AFTERSALE_STATUSES, canTransitionAftersale, receivingProgress } from "../src/domain/procurement-tracking";

const base = { id: z.string().uuid(), orderVersion: z.number().int().positive(), note: z.string().trim().min(2).max(1000) };
const ref = z.string().min(1).max(128), quantity = z.number().int().min(1).max(999);
export const trackingInput = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("link"), itemId: ref, packageId: ref, quantity }).strict(),
  z.object({ ...base, action: z.literal("arrival"), linkId: ref, receivedQuantity: z.number().int().min(0).max(999) }).strict(),
  z.object({ ...base, action: z.literal("unlink"), linkId: ref }).strict(),
  z.object({ ...base, action: z.literal("case_create"), itemId: ref, linkId: ref.nullable(), kind: z.enum(AFTERSALE_KINDS), quantity }).strict(),
  z.object({ ...base, action: z.literal("case_update"), caseId: ref, status: z.enum(AFTERSALE_STATUSES) }).strict(),
]);
function invalid(message: string): never { throw new AppError("VALIDATION_ERROR", message); }
function conflict(): never { throw new AppError("CONFLICT", "This record changed. Refresh and try again.", 409); }
async function requireOrder(db: Database, orderId: string) {
  const row = (await db.select().from(procurementOrders).where(eq(procurementOrders.id, orderId)))[0];
  if (!row) throw new AppError("NOT_FOUND", "Record not found.", 404);
  return row;
}
async function requestHash(value: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, "0")).join("");
}

export async function receivingSummary(db: Database, orderId: string) {
  const rows = await db.select({ itemId: procurementItems.id, ordered: procurementItems.quantity,
    allocated: sql<number>`COALESCE(SUM(CASE WHEN ${links.active} = 1 THEN ${links.allocatedQuantity} ELSE 0 END), 0)`.mapWith(Number),
    received: sql<number>`COALESCE(SUM(CASE WHEN ${links.active} = 1 THEN ${links.receivedQuantity} ELSE 0 END), 0)`.mapWith(Number),
  }).from(procurementItems).leftJoin(links, eq(links.itemId, procurementItems.id)).where(eq(procurementItems.orderId, orderId)).groupBy(procurementItems.id).orderBy(asc(procurementItems.position));
  const open = (await db.select({ n: count() }).from(cases).where(and(eq(cases.orderId, orderId), sql`${cases.status} IN ('open', 'in_progress')`)))[0].n;
  return { items: rows.map(r => ({ itemId: r.itemId, ...receivingProgress(r.ordered, r.allocated, r.received) })), openCases: open };
}

export async function trackProcurement(db: Database, actor: { id: string; email: string }, orderId: string, raw: unknown) {
  try { return await trackAttempt(db, actor, orderId, raw); }
  catch (error) {
    // A concurrent identical command may commit between initial replay check and validation.
    const input = parseInput(trackingInput, raw);
    const previous = (await db.select().from(events).where(eq(events.id, input.id)))[0];
    if (previous) {
      if (previous.orderId !== orderId || previous.createdBy !== actor.id || previous.requestHash !== await requestHash({ orderId, ...input })) conflict();
      return { ok: true };
    }
    throw error;
  }
}
async function trackAttempt(db: Database, actor: { id: string; email: string }, orderId: string, raw: unknown) {
  const input = parseInput(trackingInput, raw), hash = await requestHash({ orderId, ...input });
  const replay = async () => {
    const previous = (await db.select().from(events).where(eq(events.id, input.id)))[0];
    if (!previous) return false;
    if (previous.orderId !== orderId || previous.createdBy !== actor.id || previous.requestHash !== hash) conflict();
    return true;
  };
  if (await replay()) return { ok: true };
  const order = await requireOrder(db, orderId);
  if (order.status !== "draft" || order.version !== input.orderVersion) conflict();
  const now = Date.now(), mutationId = crypto.randomUUID();
  const guard = sql`EXISTS (SELECT 1 FROM procurement_orders WHERE id = ${orderId} AND mutation_id = ${mutationId})`;
  let itemId: string, linkId: string | null = null, caseId: string | null = null;
  let beforeQuantity: number | null = null, afterQuantity: number | null = null, fromStatus: string | null = null, toStatus: string | null = null;
  let ownerGuard = sql`1 = 1`;
  const itemFor = async (id: string) => {
    const item = (await db.select().from(procurementItems).where(and(eq(procurementItems.id, id), eq(procurementItems.orderId, orderId))))[0];
    if (!item) invalid("Select an item from this order.");
    return item;
  };
  const linkFor = async (id: string) => {
    const link = (await db.select().from(links).where(and(eq(links.id, id), eq(links.orderId, orderId), eq(links.active, true))))[0];
    if (!link) invalid("Select an active package link from this order.");
    if (!(await db.select({ id: packages.id }).from(packages).where(and(eq(packages.id, link.packageId), eq(packages.userId, order.customerId))))[0]) invalid("Select a package belonging to this customer.");
    ownerGuard = sql`EXISTS (SELECT 1 FROM packages WHERE id = ${link.packageId} AND user_id = ${order.customerId})`;
    return link;
  };
  const change = await (async () => {
    if (input.action === "link") {
      const item = await itemFor(input.itemId); itemId = item.id; linkId = input.id;
      const pkg = (await db.select({ id: packages.id }).from(packages).where(and(eq(packages.id, input.packageId), eq(packages.userId, order.customerId))))[0];
      if (!pkg) invalid("Select a package belonging to this customer.");
      ownerGuard = sql`EXISTS (SELECT 1 FROM packages WHERE id = ${input.packageId} AND user_id = ${order.customerId})`;
      const allocated = (await db.select({ n: sql<number>`COALESCE(SUM(${links.allocatedQuantity}), 0)`.mapWith(Number) }).from(links).where(and(eq(links.itemId, item.id), eq(links.active, true))))[0].n;
      if (allocated + input.quantity > item.quantity) invalid("Linked quantities exceed the ordered quantity.");
      if ((await db.select({ id: links.id }).from(links).where(and(eq(links.itemId, item.id), eq(links.packageId, input.packageId), eq(links.active, true))))[0]) invalid("This item is already linked to that package.");
      beforeQuantity = 0; afterQuantity = input.quantity;
      return { query: db.insert(links).select(sql`SELECT ${input.id}, ${orderId}, ${item.id}, ${input.packageId}, ${input.quantity}, 0, 1, ${now}, ${now}, 'manual' WHERE ${guard}`) };
    }
    if (input.action === "arrival" || input.action === "unlink") {
      const link = await linkFor(input.linkId); itemId = link.itemId; linkId = link.id;
      if (input.action === "arrival") {
        if (input.receivedQuantity > link.allocatedQuantity) invalid("Received quantity exceeds the linked quantity.");
        if (input.receivedQuantity === link.receivedQuantity) invalid("Received quantity has not changed.");
        beforeQuantity = link.receivedQuantity; afterQuantity = input.receivedQuantity;
        return { query: db.update(links).set({ receivedQuantity: input.receivedQuantity, receiptSource: "manual", updatedAt: now }).where(and(eq(links.id, link.id), guard)) };
      }
      if (link.receivedQuantity !== 0) invalid("Correct the received quantity to zero before unlinking.");
      if ((await db.select({ id: cases.id }).from(cases).where(and(eq(cases.linkId, link.id), sql`${cases.status} IN ('open', 'in_progress')`)).limit(1))[0]) invalid("Close the linked aftersales case before unlinking.");
      beforeQuantity = link.allocatedQuantity; afterQuantity = 0;
      return { query: db.update(links).set({ active: false, updatedAt: now }).where(and(eq(links.id, link.id), guard)) };
    }
    if (input.action === "case_create") {
      const item = await itemFor(input.itemId); itemId = item.id; caseId = input.id; linkId = input.linkId;
      if (input.quantity > item.quantity) invalid("Aftersales quantity exceeds the ordered quantity.");
      if (input.linkId) {
        const link = await linkFor(input.linkId);
        if (link.itemId !== item.id) invalid("The package link belongs to another item.");
        if (input.quantity > link.allocatedQuantity) invalid("Aftersales quantity exceeds the linked quantity.");
        const linkedOpen = (await db.select({ n: sql<number>`COALESCE(SUM(${cases.quantity}), 0)`.mapWith(Number) }).from(cases).where(and(eq(cases.linkId, link.id), sql`${cases.status} IN ('open', 'in_progress')`)))[0].n;
        if (linkedOpen + input.quantity > link.allocatedQuantity) invalid("Open aftersales quantities exceed the linked quantity.");
      }
      // Avoid counting the same ordered units in more than one active case.
      const openQty = (await db.select({ n: sql<number>`COALESCE(SUM(${cases.quantity}), 0)`.mapWith(Number) }).from(cases).where(and(eq(cases.itemId, item.id), sql`${cases.status} IN ('open', 'in_progress')`)))[0].n;
      if (openQty + input.quantity > item.quantity) invalid("Open aftersales quantities exceed the ordered quantity.");
      toStatus = "open"; afterQuantity = input.quantity;
      return { query: db.insert(cases).select(sql`SELECT ${input.id}, ${orderId}, ${item.id}, ${input.linkId}, ${input.kind}, ${input.quantity}, 'open', ${input.note}, NULL, ${actor.id}, ${now}, ${now} WHERE ${guard}`) };
    }
    const record = (await db.select().from(cases).where(and(eq(cases.id, input.caseId), eq(cases.orderId, orderId))))[0];
    if (!record) invalid("Select an aftersales case from this order.");
    if (!canTransitionAftersale(record.status, input.status)) invalid("Invalid aftersales status transition.");
    itemId = record.itemId; caseId = record.id; linkId = record.linkId; fromStatus = record.status; toStatus = input.status;
    return { query: db.update(cases).set({ status: input.status, resolution: input.status === "resolved" || input.status === "cancelled" ? input.note : null, updatedAt: now }).where(and(eq(cases.id, record.id), guard)) };
  })();
  try {
    const [changed] = await db.batch([
      db.update(procurementOrders).set({ version: order.version + 1, mutationId, updatedAt: now }).where(and(eq(procurementOrders.id, orderId), eq(procurementOrders.version, input.orderVersion), eq(procurementOrders.status, "draft"), ownerGuard)).returning({ id: procurementOrders.id }),
      change.query,
      db.insert(events).select(sql`SELECT ${input.id}, ${orderId}, ${itemId!}, ${linkId}, ${caseId}, ${input.action}, ${input.note}, ${beforeQuantity}, ${afterQuantity}, ${fromStatus}, ${toStatus}, ${hash}, ${actor.id}, ${now} WHERE ${guard}`),
      db.insert(auditLogs).select(sql`SELECT ${crypto.randomUUID()}, ${actor.id}, ${actor.email}, ${`procurement.tracking.${input.action}`}, ${orderId}, ${JSON.stringify({ eventId: input.id })}, ${now} WHERE ${guard}`),
    ]);
    if (!changed.length) { if (await replay()) return { ok: true }; conflict(); }
  } catch (error) { if (await replay()) return { ok: true }; throw error; }
  // An operator correction may reopen a previously completed warehouse workflow.
  await db.update(procurementRemote).set({ syncNextAt: Date.now() + 5 * 60_000 })
    .where(and(eq(procurementRemote.orderId, orderId), sql`${procurementRemote.syncNextAt} IS NULL`, sql`${procurementRemote.remoteId} IS NOT NULL`, sql`${procurementRemote.state} != 'cancelled'`));
  return { ok: true };
}

export const procurementTrackingAdmin = new Hono<AdminEnv>();
procurementTrackingAdmin.get("/procurement/:id/logistics", async c => {
  const db = c.get("db");
  const order = await requireOrder(db, c.req.param("id"));
  const data = await domesticPurchaseTracking(db, order.customerId, order.id, c.env);
  return c.json({ data, requestId: c.get("requestId") });
});
procurementTrackingAdmin.post("/procurement/:id/tracking", async c => c.json({ data: await trackProcurement(c.get("db"), c.get("user"), c.req.param("id"), await c.req.json()), requestId: c.get("requestId") }));
procurementTrackingAdmin.get("/procurement/:id/package-options", async c => {
  const db = c.get("db"), order = await requireOrder(db, c.req.param("id")), input = parseInput(listInput, c.req.query());
  const where = and(eq(packages.userId, order.customerId), input.q ? or(like(packages.publicId, `%${input.q}%`), like(packages.domesticTrackingNumber, `%${input.q}%`), like(packages.productName, `%${input.q}%`)) : undefined);
  const total = (await db.select({ n: count() }).from(packages).where(where))[0].n;
  const items = await db.select({ id: packages.id, publicId: packages.publicId, tracking: packages.domesticTrackingNumber, name: packages.productName, status: packages.packageStatus }).from(packages).where(where).orderBy(desc(packages.createdAt), desc(packages.id)).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
  return c.json({ data: { items, total, page: input.page, pageSize: input.pageSize }, requestId: c.get("requestId") });
});
procurementTrackingAdmin.get("/procurement/:id/tracking", async c => {
  const db = c.get("db"), order = await requireOrder(db, c.req.param("id"));
  const input = parseInput(listInput.extend({ group: z.enum(["links", "cases", "events"]), itemId: ref.optional() }), c.req.query());
  const table = input.group === "links" ? links : input.group === "cases" ? cases : events;
  const where = and(eq(table.orderId, order.id), input.itemId ? eq(table.itemId, input.itemId) : undefined);
  const total = (await db.select({ n: count() }).from(table).where(where))[0].n;
  const page = Math.min(input.page, Math.max(1, Math.ceil(total / input.pageSize))), offset = (page - 1) * input.pageSize;
  const items = input.group === "links"
    ? await db.select({ id: links.id, itemId: links.itemId, packageId: links.packageId, publicId: packages.publicId, tracking: packages.domesticTrackingNumber, packageStatus: packages.packageStatus, allocatedQuantity: links.allocatedQuantity, receivedQuantity: links.receivedQuantity, active: links.active, createdAt: links.createdAt }).from(links).innerJoin(packages, eq(packages.id, links.packageId)).where(where).orderBy(desc(links.createdAt), desc(links.id)).limit(input.pageSize).offset(offset)
    : input.group === "cases"
      ? await db.select({ id: cases.id, itemId: cases.itemId, linkId: cases.linkId, kind: cases.kind, quantity: cases.quantity, status: cases.status, reason: cases.reason, resolution: cases.resolution, createdAt: cases.createdAt, publicId: packages.publicId }).from(cases).leftJoin(links, eq(links.id, cases.linkId)).leftJoin(packages, eq(packages.id, links.packageId)).where(where).orderBy(desc(cases.createdAt), desc(cases.id)).limit(input.pageSize).offset(offset)
      : await db.select({ id: events.id, itemId: events.itemId, linkId: events.linkId, caseId: events.caseId, action: events.action, note: events.note, beforeQuantity: events.beforeQuantity, afterQuantity: events.afterQuantity, fromStatus: events.fromStatus, toStatus: events.toStatus, createdAt: events.createdAt, author: user.name, publicId: packages.publicId }).from(events).leftJoin(user, eq(user.id, events.createdBy)).leftJoin(links, eq(links.id, events.linkId)).leftJoin(packages, eq(packages.id, links.packageId)).where(where).orderBy(desc(events.createdAt), desc(events.id)).limit(input.pageSize).offset(offset);
  return c.json({ data: { items, total, page, pageSize: input.pageSize }, requestId: c.get("requestId") });
});
