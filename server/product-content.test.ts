import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ env: {} }));
import { publicProductContent } from "./product-content";
import { queryProducts } from "./purchase-products";
import { verifiedProduct } from "./shopping";
import { clientEndpoints } from "./client-api/catalog";

afterEach(() => vi.unstubAllGlobals());
describe("public product rich content", () => {
  it("preserves upstream HTML exactly, including styles, embeds and entities", () => {
    const html = '  <p style="color:red" onclick="test()">棉 &amp; 麻</p><iframe src="https://example.com"></iframe>  ';
    const result = publicProductContent({ description: { original: html, translated: "<p>Cotton</p>", language: "en", secret: "private" }, seller: { id: 123, name: "Store", shop_url: "https://example.com/shop" }, videos: { main: "https://example.com/main.mp4" } });
    expect(result.description).toEqual({ original: html, translated: "<p>Cotton</p>", language: "en" });
    expect(result).not.toHaveProperty("descriptionHtml");
    expect(result).not.toHaveProperty("descriptionTruncated");
    expect(result.shop.id).toBe("123");
    expect(result.videos.main).toBe("https://example.com/main.mp4");
  });
  it("handles missing values and string descriptions without truncation or extraction", () => {
    expect(publicProductContent({}).description).toEqual({ original: null, translated: null, language: null });
    const html = '<img src="//example.com/detail.jpg">' + "a".repeat(500_010);
    expect(publicProductContent({ description: html }).description.original).toBe(html);
    expect(publicProductContent({ description: { original: "", translated: 123 } }).description).toEqual({ original: "", translated: null, language: null });
  });
  it("returns only product display attributes and handles missing or malformed values", () => {
    expect(publicProductContent({}).attributes).toEqual([]);
    expect(publicProductContent({ attributes: {} }).attributes).toEqual([]);
    expect(publicProductContent({ attributes: [null, "bad", [], { attribute_id: 123, name: "Material", value: "Cotton", original_name: "材质", original_value: "棉", internal: "secret" }, { name: 5 }] }).attributes).toEqual([
      { attribute_id: "123", name: "Material", value: "Cotton", original_name: "材质", original_value: "棉" },
      { attribute_id: null, name: null, value: null, original_name: null, original_value: null },
    ]);
  });
  it("enriches detail/parse but keeps shopping snapshots lean and documents both endpoints", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ product: { id: "p", channel: "1688", attributes: [{ name: "Material", value: "Cotton", original_name: "材质", original_value: "棉" }], description: { original: "<p>Detail</p>" }, seller: { id: "s" }, videos: { main: "https://example.com/main.mp4" }, variants: [] } })));
    for (const operation of ["detail", "parse"] as const) {
      const result = await queryProducts("test-only", operation, { channel: "1688", id: "p" });
      expect(result).toMatchObject({ product: { attributes: [{ name: "Material", value: "Cotton" }], description: { original: "<p>Detail</p>" }, shop: { id: "s" }, videos: { main: "https://example.com/main.mp4" } } });
    }
    const snapshot = await verifiedProduct("test-only", "1688", "p");
    expect(snapshot).not.toHaveProperty("attributes"); expect(snapshot).not.toHaveProperty("description"); expect(snapshot).not.toHaveProperty("videos");
    for (const path of ["/api/products/detail", "/api/products/parse"]) {
      const schema = JSON.stringify(clientEndpoints.find(endpoint => endpoint.path === path)?.response);
      for (const field of ["description", "shop", "videos", "attribute_id", "original_name", "original_value"]) expect(schema).toContain(field);
      expect(schema).not.toContain("descriptionHtml");
      expect(schema).not.toContain("descriptionTruncated");
    }
  });
});
