import { z } from "zod";
import { AppError } from "./errors";
export const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}, "Invalid calendar date.");
const cents = z.number().int().min(0).max(99_999_999);
export const orderInput = z.object({
  id: z.string().uuid(), customerId: z.string().min(1).max(128), platform: z.enum(["1688", "Taobao", "Weidian"]),
  shippingCents: cents,
  items: z.array(z.object({ name: z.string().trim().min(1).max(120), sku: z.string().trim().min(1).max(120), quantity: z.number().int().min(1).max(999), unitPriceCents: cents.min(1) }).strict()).min(1).max(20),
}).strict();
export const noteInput = z.object({ id: z.string().uuid(), text: z.string().trim().min(1).max(1000), kind: z.enum(["internal", "resolution"]) }).strict();
export const versionInput = z.object({ version: z.number().int().positive() }).strict();
const decimal = z.number().min(0).max(999999).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.000001, "Use at most two decimal places.");
export const marketingInput = z.object({
  id: z.string().uuid(), group: z.enum(["coupons", "campaigns"]), name: z.string().trim().min(1).max(60),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,32}$/), from: dateInput, to: dateInput,
  kind: z.enum(["percent", "fixed"]), amount: decimal, minimum: decimal, limit: z.number().int().min(1).max(999999),
  channel: z.enum(["Community", "Social media", "Email", "Partners"]),
  version: z.number().int().positive().optional(),
}).strict().refine(v => v.to >= v.from, "End date must be on or after the start date.")
  .refine(v => v.group !== "coupons" || (v.amount > 0 && (v.kind !== "percent" || v.amount <= 100)), "Invalid discount.");
export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError("VALIDATION_ERROR", result.error.issues[0]?.message ?? "Invalid request.", 400);
  return result.data;
}
export function orderTotals(items: { quantity: number; unitPriceCents: number }[], shippingCents: number) {
  const goodsCents = items.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0);
  const totalCents = goodsCents + shippingCents;
  if (!Number.isSafeInteger(totalCents) || totalCents > 999_999_999) throw new AppError("VALIDATION_ERROR", "Order total is too large.");
  return { goodsCents, shippingCents, totalCents };
}
export function marketingStatus(record: { enabled: boolean; from: string; to: string }, today = new Date().toISOString().slice(0, 10)) {
  return !record.enabled ? "Disabled" : record.from > today ? "Scheduled" : record.to < today ? "Expired" : "Enabled";
}
export const listInput = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), q: z.string().trim().max(120).default("") });
