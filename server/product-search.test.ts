import { afterEach, expect, it, vi } from "vitest";
import { productSearchInput } from "../src/domain/purchase";
import { queryProducts } from "./purchase-products";
import { clientEndpoints } from "./client-api/catalog";

afterEach(() => vi.unstubAllGlobals());
it("keeps old search requests compatible without injecting new filters", () => {
  expect(productSearchInput.parse({ channel: "1688", keyword: " shirt " })).toEqual({ channel: "1688", keyword: "shirt", page: 1, page_size: 20, language: "en" });
  for (const sort of ["PRICE_ASC", "PRICE_DESC", "SALE_QTY_ASC", "SALE_QTY_DESC"])
    expect(productSearchInput.parse({ channel: "taobao", keyword: "shirt", sort }).sort).toBe(sort);
  for (const sort_field of ["price", "sales", "credit", "bid", "sale", "monthSold", "rePurchaseRate", "PRICE_DESC"])
    expect(productSearchInput.parse({ channel: "1688", keyword: "shirt", sort_field, sort_order: "desc" }).sort_field).toBe(sort_field);
});
it("forwards every supported filter without converting yuan or dropping false and zero", async () => {
  const input = productSearchInput.parse({ channel: "1688", keyword: "shirt", page: 2, page_size: 10, language: "zh-CN",
    user_id: "search-user", sort_field: "sales", sort_order: "desc", price_start: 0, price_end: 12.34,
    ship_within_hours: 0, experience_score_level: 4, product_attrs: "isOnePsale,new30", filter: "totalEpScoreLv4",
    category_ids: "123,456", category_id: 123, category_id_list: "123,456", product_collection_id: "pool-1",
    sale_filters: [{ sale_type: "sales7", sale_start: "10", sale_end: "100" }, { sale_type: "totalSales" }], keyword_translate: false });
  const fetcher = vi.fn(async () => Response.json({ items: [{ id: "product", title: "Shirt", cost: 1234, seller_secret: "hidden" }], page: 2, page_size: 10, total: 1 }));
  vi.stubGlobal("fetch", fetcher);
  const result = await queryProducts("test-only-token", "search", input);
  expect(fetcher).toHaveBeenCalledOnce();
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://api.hiobuy.com/v1/products/search");
  expect(JSON.parse(String(init.body))).toEqual({ ...input, response_format: "standard" });
  expect(JSON.stringify(result)).not.toMatch(/seller_secret|hidden|"cost"/);
  expect(result).toMatchObject({ page: 2, pageSize: 10, total: 1 });
});
it("rejects invalid enums, reversed price ranges, wrong types and raw response requests", () => {
  for (const invalid of [{ sort: "random" }, { sort_order: "down" }, { price_start: -1 }, { price_end: "12.34" },
    { price_start: 20, price_end: 10 }, { ship_within_hours: 12 }, { experience_score_level: 5 },
    { keyword_translate: "false" }, { sale_filters: [{ sale_type: "sales90" }] },
    { sale_filters: [{ sale_type: "sales7", sale_start: 10 }] }, { response_format: "upstream" }]) {
    expect(productSearchInput.safeParse({ channel: "1688", keyword: "shirt", ...invalid }).success).toBe(false);
  }
});
it("publishes the same filter validation schema in the client API catalog", () => {
  const endpoint = clientEndpoints.find(e => e.path === "/api/products/search" && e.method === "POST")!;
  expect(endpoint.public).toBe(true);
  expect(endpoint.body).toBe(productSearchInput);
  const parsed = productSearchInput.parse({ channel: "weidian", keyword: "shirt", user_id: "user-1", sort: "PRICE_ASC" });
  expect(parsed.user_id).toBe("user-1");
});
