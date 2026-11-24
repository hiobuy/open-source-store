import { describe, expect, it } from "vitest";
import { localizedText } from "./localized-text";

describe("localizedText", () => {
  it("uses translated when the echoed language matches", () => {
    const map = { original: "纯棉", translated: "Cotton", language: "en" };
    expect(localizedText(map, "en")).toBe("Cotton");
  });

  it("matches on base language (en-US / zh-CN)", () => {
    expect(
      localizedText({ original: "纯棉", translated: "Cotton", language: "en" }, "en-US"),
    ).toBe("Cotton");
    expect(
      localizedText({ original: "纯棉", translated: "纯棉T", language: "zh-CN" }, "zh"),
    ).toBe("纯棉T");
  });

  it("uses translated when no language is echoed", () => {
    expect(localizedText({ original: "纯棉", translated: "Cotton" }, "en")).toBe("Cotton");
  });

  it("prefers original over a translation in a different language", () => {
    const map = { original: "纯棉", translated: "Coton", language: "fr" };
    expect(localizedText(map, "en")).toBe("纯棉");
  });

  it("returns original when it is the only text", () => {
    expect(localizedText({ original: "纯棉" }, "en")).toBe("纯棉");
  });

  it("supports the legacy per-locale shape", () => {
    const map = { "en-US": "Shirt", zh: "衬衫", en: "Shirt EN" };
    expect(localizedText(map, "en-US")).toBe("Shirt");
    expect(localizedText({ zh: "衬衫", en: "Shirt EN" }, "zh-CN")).toBe("衬衫");
    expect(localizedText({ zh: "衬衫", en: "Shirt EN" }, "de-DE")).toBe("Shirt EN");
    expect(localizedText({ ja: "シャツ" }, "de")).toBe("シャツ");
  });

  it("never returns the language metadata", () => {
    expect(localizedText({ language: "en" }, "en")).toBe("");
    expect(localizedText({ language: "en", original: "" }, "en")).toBe("");
    expect(localizedText({ language: "en", translated: "  " }, "en")).toBe("");
    expect(localizedText({ original: "纯棉", language: "en" }, "language")).toBe("纯棉");
    expect(localizedText(undefined, "en")).toBe("");
  });
});
