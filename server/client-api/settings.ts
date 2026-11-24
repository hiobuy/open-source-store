import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client";
import { platformSettings } from "../db/schema";
import { SINGLETON_ID, singletonRow } from "../db/singleton";
import { parseInput } from "../operations-input";
import { clientOrigins } from "./access";

export const originsInput = z.object({ origins: z.array(z.string().trim().max(2000).refine(value => !value.includes(",") && clientOrigins(value).length === 1, "Use an HTTPS origin, or HTTP localhost, without paths or credentials.")).max(100) }).strict();
export async function readClientOrigins(db: Database, fallback?: string) {
  const [row] = await db.select({ value: platformSettings.clientApiOrigins }).from(platformSettings).where(eq(platformSettings.id, SINGLETON_ID));
  return { origins: clientOrigins(row?.value ?? fallback), source: row?.value == null ? "environment" : "database" };
}
export async function saveClientOrigins(db: Database, raw: unknown) {
  const input = parseInput(originsInput, raw);
  const origins = clientOrigins(input.origins.join(","));
  await singletonRow(db, platformSettings);
  await db.update(platformSettings).set({ clientApiOrigins: origins.join(","), updatedAt: Date.now() }).where(eq(platformSettings.id, SINGLETON_ID));
  return { origins, source: "database" };
}
