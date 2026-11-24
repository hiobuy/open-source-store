import { and, asc, eq, inArray, isNotNull, lte, or, isNull, sql } from "drizzle-orm";
import type { Database } from "./db/client";
import { procurementRemote } from "./db/schema";
import { AppError } from "./errors";
import { performPurchaseAction } from "./purchase";
import { procurementOverviews } from "./procurement-overview";

const INTERVAL = 5 * 60_000;
const LEASE = 2 * 60_000;
const actor = { id: "system:purchase-poll", email: "system:purchase-poll" };

/** Bounded, persisted, read-only-upstream polling. A failed order cannot block the queue. */
export async function pollPurchases(db: Database, token: string, limit = 5) {
  if (!token.trim()) return { processed: 0, failed: 0 };
  const started = Date.now();
  const eligible = and(
    isNotNull(procurementRemote.remoteId),
    inArray(procurementRemote.state, ["created", "unknown", "review_required", "cancel_pending"]),
    lte(procurementRemote.syncNextAt, started),
    or(isNull(procurementRemote.syncLockedUntil), lte(procurementRemote.syncLockedUntil, started)),
    sql`EXISTS (SELECT 1 FROM procurement_orders WHERE id=${procurementRemote.orderId} AND status='draft')`,
  );
  const rows = await db.select().from(procurementRemote).where(eligible).orderBy(asc(procurementRemote.syncNextAt), asc(procurementRemote.orderId)).limit(Math.min(5, Math.max(1, limit)));
  let processed = 0, failed = 0;
  for (const row of rows) {
    if (Date.now() - started >= 50_000) break;
    const lockToken = crypto.randomUUID(), now = Date.now();
    const claimed = await db.update(procurementRemote).set({ syncLockToken: lockToken, syncLockedUntil: now + LEASE })
      .where(and(eq(procurementRemote.orderId, row.orderId), eligible)).returning({ id: procurementRemote.orderId });
    if (!claimed.length) continue;
    try {
      await performPurchaseAction(db, token, actor, row.orderId, "sync", undefined, undefined, now + 45_000);
      const [overview] = await procurementOverviews(db, [row.orderId]);
      const finished = overview && ["cancelled", "stocked", "packed", "shipped"].includes(overview.stage);
      await db.update(procurementRemote).set({ syncNextAt: finished ? null : Date.now() + INTERVAL, syncFailures: 0, syncErrorCode: null, syncLockToken: null, syncLockedUntil: null })
        .where(and(eq(procurementRemote.orderId, row.orderId), eq(procurementRemote.syncLockToken, lockToken)));
    } catch (error) {
      failed++;
      const failures = row.syncFailures + 1;
      const delay = Math.min(60 * 60_000, INTERVAL * 2 ** Math.min(failures - 1, 4));
      // Persist only a stable error code, never upstream payloads or credentials.
      await db.update(procurementRemote).set({ syncNextAt: Date.now() + delay, syncFailures: failures,
        syncErrorCode: error instanceof AppError ? error.code : "INTERNAL", syncLockToken: null, syncLockedUntil: null })
        .where(and(eq(procurementRemote.orderId, row.orderId), eq(procurementRemote.syncLockToken, lockToken)));
    }
    processed++;
  }
  return { processed, failed };
}

export async function processDuePurchases(db: Database, env: { HIOBUY_API_TOKEN?: string }) {
  const { resolveHioBuyToken } = await import("./freight");
  const token = await resolveHioBuyToken(db, env.HIOBUY_API_TOKEN);
  if (!token) return { processed: 0, failed: 0 };
  return pollPurchases(db, token);
}

