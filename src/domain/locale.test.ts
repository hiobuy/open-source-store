import { describe, expect, it } from "vitest";
import { currencySymbol, enabledLocaleCodes, formatMoney, matchNavigatorLocale, resolveActiveLocale, translate } from "./locale";
import { ru } from "../admin/locales/ru";
import { zhHans } from "../admin/locales/zh-Hans";
import { zhHant } from "../admin/locales/zh-Hant";

describe("locale settings", () => {
  it("keeps catalog order and drops unknown codes", () => {
    expect(enabledLocaleCodes("ru, xx, zh-Hant")).toEqual(["zh-Hant", "ru"]);
    expect(enabledLocaleCodes("")).toEqual(["en"]);
  });

  it("prefers a saved choice, then the browser, then the operator default", () => {
    const enabled = ["en", "zh-Hant", "ru"];
    expect(resolveActiveLocale({ stored: "ru", navigatorLanguage: "zh-TW", enabled, fallback: "en" })).toBe("ru");
    expect(resolveActiveLocale({ stored: "fr", navigatorLanguage: "zh-HK", enabled, fallback: "en" })).toBe("zh-Hant");
    expect(resolveActiveLocale({ stored: null, navigatorLanguage: "ru-RU", enabled, fallback: "en" })).toBe("ru");
    expect(resolveActiveLocale({ stored: null, navigatorLanguage: "zh-CN", enabled, fallback: "en" })).toBe("en");
    expect(resolveActiveLocale({ stored: null, navigatorLanguage: "de", enabled: ["zh-Hant"], fallback: "en" })).toBe("zh-Hant");
  });

  it("matches Chinese scripts only when enabled", () => {
    expect(matchNavigatorLocale("zh-TW", ["en", "zh-Hant"])).toBe("zh-Hant");
    expect(matchNavigatorLocale("zh-CN", ["en", "zh-Hant"])).toBeNull();
  });

  it("matches Simplified Chinese browser locales and keeps saved preferences", () => {
    for (const language of ["zh", "zh-CN", "zh_SG", "zh-Hans-CN"]) {
      expect(matchNavigatorLocale(language, ["en", "zh-Hans", "zh-Hant"])).toBe("zh-Hans");
    }
    expect(matchNavigatorLocale("zh-Hant-TW", ["en", "zh-Hans", "zh-Hant"])).toBe("zh-Hant");
    expect(matchNavigatorLocale("zh-TW", ["en", "zh-Hans"])).toBeNull();
    expect(resolveActiveLocale({ stored: "en", navigatorLanguage: "zh-CN", enabled: ["en", "zh-Hans"], fallback: "zh-Hans" })).toBe("en");
    expect(enabledLocaleCodes("zh-Hans,en")).toEqual(["en", "zh-Hans"]);
  });

  it("includes every customer translation and substitutes admin variables", () => {
    for (const key of Object.keys(zhHant)) expect(zhHans[key], key).toBeTruthy();
    expect(translate(zhHans, "Shopping orders")).toBe("代购订单");
    expect(translate(zhHans, "{count} sample parcels", { count: 2 })).toBe("2 个示例包裹");
    expect(formatMoney(100, "USD", "zh-Hans")).toContain("1.00");
  });

  it("falls back to English and fills variables", () => {
    expect(translate(zhHant, "Sign in")).toBe("登入");
    expect(translate(zhHant, "Missing sentence")).toBe("Missing sentence");
    expect(translate(zhHant, "Est. total ({currency})", { currency: "EUR" })).toBe("預估總價（EUR）");
    expect(translate(undefined, " Sign in ")).toBe(" Sign in ");
  });

  it("formats minor units in the selected currency", () => {
    expect(formatMoney(18000, "USD", "en")).toBe("$180.00");
    expect(formatMoney(-2000, "USD", "en")).toBe("-$20.00");
    expect(formatMoney(5000, "EUR", "en", true)).toBe("+€50.00");
    expect(currencySymbol("USD", "en")).toBe("$");
  });

  it("gives Traditional Chinese and Russian the same message keys", () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(zhHant).sort());
  });
});
