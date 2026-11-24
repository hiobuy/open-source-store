import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  LOCALES,
  parseLocale,
  localeDirection,
  localeApiCode,
} from "@/lib/locale";

describe("parseLocale", () => {
  it.each(LOCALES)("preserves the supported locale %s", (locale) => {
    expect(parseLocale(locale)).toBe(locale);
  });

  it.each([undefined, "", "unsupported"])(
    "falls back for the unsupported value %s",
    (value) => {
      expect(parseLocale(value)).toBe(DEFAULT_LOCALE);
    },
  );
  it("normalizes regional and legacy locale codes", () => {
    expect(parseLocale("zh-CN")).toBe("cn");
    expect(parseLocale("ar_SA")).toBe("ar");
    expect(parseLocale("pt-BR")).toBe("pt");
  });
  it("uses RTL for Arabic and preserves the backend locale contract", () => {
    expect(localeDirection("ar")).toBe("rtl");
    expect(localeDirection("en")).toBe("ltr");
    expect(localeApiCode("ar")).toBe("ar");
    expect(localeApiCode("pt")).toBe("pt_BR");
  });
});
