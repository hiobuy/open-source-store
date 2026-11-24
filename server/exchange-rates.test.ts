vi.mock("cloudflare:workers", () => ({ env: {} }));
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { createDb, type Database } from "./db/client";
import { exchangeHistory, getExchangeRate, publicExchangeRates, requireExchangeRate, saveExchangeRate } from "./exchange-rates";
import { readProductPolicy, saveProductPolicy } from "./product-billing";
import { sellingPolicy } from "./freight";
import { cnyToDisplayMinor, unitsPerCnyE8, cnyPerUnitFromE8, exchangeRateInput } from "../src/domain/exchange-rates";
import { permissionFor } from "../src/domain/staff";
import { customerPurchaseQuote, pricePurchase } from "../src/domain/purchase";
let mf: Miniflare, db: Database;
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "exchange-test", modules: true, script: "export default {fetch(){return new Response('test')}}", d1Databases: ["DB", "LEGACY"] }] }));
  const binding = await mf.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) {
    const statements = readFileSync(`drizzle/${file}`, "utf8").split(";").map(s => s.replaceAll("--> statement-breakpoint", "").trim()).filter(Boolean);
    await binding.batch(statements.map(s => binding.prepare(s)));
  }
  db = createDb(binding as unknown as D1Database);
}, 30000);
afterAll(async () => { await mf?.dispose(); });
describe("unified exchange rates", () => {
  it("migrates conflicting legacy rates without silently choosing a new selling rate", async () => {
    const binding = await mf.getD1Database("LEGACY");
    const files = readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort();
    const apply = async (file: string) => binding.batch(readFileSync(`drizzle/${file}`, "utf8").split(";").map(s => s.replaceAll("--> statement-breakpoint", "").trim()).filter(Boolean).map(s => binding.prepare(s)));
    for (const file of files.filter(f => !f.startsWith("0015_"))) await apply(file);
    await binding.prepare("INSERT INTO freight_policy (id,markup_bps,markup_cny_fen,cny_per_usd_e4,sync_source,updated_at) VALUES ('default',0,0,72000,'catalog',1)").run();
    await binding.prepare("INSERT INTO product_pricing VALUES ('current','USD',0,0,0,0,70000,1,'legacy',1,'staff')").run();
    await apply(files.find(f => f.startsWith("0015_"))!);
    const legacyDb = createDb(binding as unknown as D1Database);
    expect(await getExchangeRate(legacyDb, "USD")).toMatchObject({ cnyPerUnitE4: 70000, enabled: false, source: "legacy_conflict" });
    await expect(requireExchangeRate(legacyDb, "USD")).rejects.toMatchObject({ code: "EXCHANGE_RATE_REQUIRED" });
    await saveExchangeRate(legacyDb, "staff", "USD", { cnyPerUnitE4: 72000, enabled: true, version: 1 });
    expect((await exchangeHistory(legacyDb, "USD", {})).items).toHaveLength(2);
    expect((await readProductPolicy(legacyDb))?.version).toBe(2);
  });
  it("never fabricates missing rates and protects CNY and settlement currencies", async () => {
    expect(await requireExchangeRate(db, "CNY")).toMatchObject({ cnyPerUnitE4: 10000, enabled: true });
    await expect(requireExchangeRate(db, "USD")).rejects.toMatchObject({ code: "EXCHANGE_RATE_REQUIRED" });
    await expect(saveExchangeRate(db, "staff", "CNY", { cnyPerUnitE4: 20000, enabled: true, version: 1 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(saveExchangeRate(db, "staff", "USD", { cnyPerUnitE4: 70000, enabled: false, version: 0 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(saveExchangeRate(db, "staff", "EUR", { cnyPerUnitE4: 0, enabled: true, version: 0 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("serializes creation and updates with exactly one history row per committed version", async () => {
    const input = { cnyPerUnitE4: 72000, enabled: true, version: 0 };
    const created = await Promise.allSettled([saveExchangeRate(db, "staff", "USD", input), saveExchangeRate(db, "staff", "USD", input)]);
    expect(created.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const changed = await Promise.allSettled([saveExchangeRate(db, "staff", "USD", { ...input, version: 1, cnyPerUnitE4: 70000 }), saveExchangeRate(db, "staff", "USD", { ...input, version: 1, cnyPerUnitE4: 71000 })]);
    expect(changed.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await exchangeHistory(db, "USD", {})).items.map(r => r.version)).toEqual([2, 1]);
    await expect(saveExchangeRate(db, "staff", "EUR", { ...input, version: 9 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await getExchangeRate(db, "EUR")).toBeNull();
    expect((await exchangeHistory(db, "EUR", {})).items).toHaveLength(0);
  });
  it("shares rates between product and freight, invalidates admin pricing versions and preserves saved quotes", async () => {
    const rate = (await getExchangeRate(db, "USD"))!;
    await saveProductPolicy(db, { id: "staff", email: "staff@example.invalid" }, { currency: "USD", markupBps: 0, fixedCnyCents: 0, serviceBps: 0, serviceCnyCents: 0, version: 0 });
    const original = (await readProductPolicy(db))!;
    expect((await sellingPolicy(db)).cnyPerUsdE4).toBe(original.cnyPerCurrencyE4);
    await saveExchangeRate(db, "staff", "USD", { cnyPerUnitE4: 80000, enabled: true, version: rate.version });
    const next = (await readProductPolicy(db))!;
    expect(next.version).toBe(original.version + 1);
    expect(next.cnyPerCurrencyE4).toBe(80000);
    expect((await sellingPolicy(db)).cnyPerUsdE4).toBe(80000);
    expect(original.cnyPerCurrencyE4).toBe(rate.cnyPerUnitE4);
    await expect(saveProductPolicy(db, { id: "staff", email: "staff@example.invalid" }, { currency: "USD", markupBps: 0, fixedCnyCents: 0, serviceBps: 0, serviceCnyCents: 0, version: original.version })).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("publishes enabled display rates only and enforces settings permissions", async () => {
    await saveExchangeRate(db, "staff", "EUR", { cnyPerUnitE4: 80000, enabled: false, version: 0 });
    await expect(requireExchangeRate(db, "EUR")).rejects.toMatchObject({ code: "EXCHANGE_RATE_REQUIRED" });
    const dto = await publicExchangeRates(db);
    expect(dto.items.map(r => r.currency)).toEqual(["CNY", "USD"]);
    expect(JSON.stringify(dto)).not.toMatch(/updatedBy|mutationId|source|staff/);
    expect(permissionFor("GET", "/api/admin/settings/exchange-rates")).toBe("settings.read");
    expect(permissionFor("GET", "/api/admin/settings/exchange-rates/USD/history")).toBe("settings.read");
    expect(permissionFor("PUT", "/api/admin/settings/exchange-rates/USD")).toBe("settings.write");
  });
  it("converts display amounts with integer rounding and rejects invalid values", () => {
    expect(cnyToDisplayMinor(1800, 72000)).toBe(250);
    expect(cnyToDisplayMinor(1, 20000)).toBe(1);
    expect(() => cnyToDisplayMinor(1, 0)).toThrow();
    expect(() => cnyToDisplayMinor(-1, 10000)).toThrow();
  });
  it("accepts CNY-based input and shares the effective rate without rewriting old snapshots", async () => {
    const previous = (await readProductPolicy(db))!;
    const rate = (await getExchangeRate(db, "USD"))!;
    const saved = await saveExchangeRate(db, "staff", "USD", { unitsPerCnyE8: 13888889, enabled: true, version: rate.version });
    expect(saved).toMatchObject({ cnyPerUnitE4: 72000, unitsPerCnyE8: 13888889 });
    expect((await readProductPolicy(db))!.cnyPerCurrencyE4).toBe(72000);
    expect((await sellingPolicy(db)).cnyPerUsdE4).toBe(72000);
    expect(previous.cnyPerCurrencyE4).toBe(80000);
    expect((await publicExchangeRates(db)).items.find(r => r.currency === "USD")?.unitsPerCnyE8).toBe(13888889);
    await expect(saveExchangeRate(db, "staff", "USD", { unitsPerCnyE8: 12500000, enabled: true, version: rate.version })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(saveExchangeRate(db, "staff", "CNY", { unitsPerCnyE8: 100000001, enabled: true, version: 1 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const euro = (await getExchangeRate(db, "EUR"))!;
    const large = await saveExchangeRate(db, "staff", "EUR", { cnyPerUnitE4: 999000000, enabled: false, version: euro.version });
    const same = await saveExchangeRate(db, "staff", "EUR", { unitsPerCnyE8: large.unitsPerCnyE8, enabled: false, version: large.version });
    expect(same.cnyPerUnitE4).toBe(large.cnyPerUnitE4);
  });
  it("validates forward precision and does not accept ambiguous direction", () => {
    expect(unitsPerCnyE8(72000)).toBe(13888889);
    expect(cnyPerUnitFromE8(13888889)).toBe(72000);
    for (const value of [0, -1, 1.5, Infinity, 1]) expect(exchangeRateInput.safeParse({ unitsPerCnyE8: value, enabled: true, version: 0 }).success).toBe(false);
    expect(exchangeRateInput.safeParse({ unitsPerCnyE8: 100000000, cnyPerUnitE4: 10000, enabled: true, version: 0 }).success).toBe(false);
  });
  it("adds selling CNY reference fees without exposing purchase costs or altering settlement", () => {
    const money = (amount: number) => ({ currency: "CNY", amount });
    const result = pricePurchase({ channel: "1688", lines: [{ id: "1", spec_id: "sku", quantity: 2 }] }, { success: true, channel: "1688", monetary_unit: "CNY_minor", unavailable_lines: [], sellers: [{ seller_id: "s", lines: [{ offer_id: "1", spec_id: "sku", quantity: 2, unit_price: money(1000), line_total: money(2000) }] }], total: { merchandise: money(2000), shipping: money(100), payment: money(2200) } }, { currency: "USD", markupBps: 1000, fixedCnyCents: 0, serviceBps: 500, serviceCnyCents: 0, cnyPerCurrencyE4: 72000, version: 1 });
    const dto = customerPurchaseQuote(result.quote);
    expect(dto.referencePrice).toEqual({ currency: "CNY", displayOnly: true, goodsCents: 2200, serviceCents: 210, shippingCents: 100, discountCents: 0, totalCents: 2510 });
    expect(dto.totalCents).toBe(result.quote.totalCents);
    expect(JSON.stringify(dto)).not.toMatch(/costCny|markup|policy/);
  });
});
