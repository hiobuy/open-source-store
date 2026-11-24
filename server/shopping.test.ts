vi.mock("cloudflare:workers", () => ({env:{}}));
vi.mock("cloudflare:sockets", () => ({connect:vi.fn()}));
import { listCart } from "./cart-view";
import { cartItems } from "./db/schema";
import { eq } from "drizzle-orm";
import { saveExchangeRate } from "./exchange-rates";
import { Hono } from "hono";
import type { AppEnv } from "./index";
import { shoppingClient } from "./shopping-http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { createDb, type Database } from "./db/client";
import { user, warehouseLocations } from "./db/schema";
import { countCart, addCartItem, addFavorite, listShopping, previewCart, removeShopping, updateCartItem } from "./shopping";
import { queryProducts } from "./purchase-products";
import { imageSearchInput, sellerSearchInput } from "../src/domain/shopping";
import { saveProductPolicy } from "./product-billing";
import { customerPurchase } from "./purchase";
import { checkoutCart } from "./cart-checkout";
let mf: Miniflare, db: Database;
const token = "isolated-test-token", actor = { id: "shop-a", email: "shop-a@example.invalid" };
const input = { channel: "1688", productId: "product-a", skuId: "sku-a", quantity: 2 };
const money = (amount: number) => ({ currency: "CNY", amount });
function remote(stock = 10) {
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")), path = new URL(String(url)).pathname;
    const product = { id: body.id ?? "product-a", channel: body.channel, title: { original: "Real product" }, images: ["https://cdn.example.com/main.jpg"], variants: [{ sku_id: "sku-a", stock, image: "https://cdn.example.com/sku.jpg", attributes: [{ value: "White" }] }], cost: 300, seller_secret: "private" };
    const quantity = body.lines?.[0]?.quantity ?? 2;
    const data = path.endsWith("/preview") ? { success: true, channel: body.channel, preview_id: "test-preview", monetary_unit: "CNY_minor", unavailable_lines: [], total: { merchandise: money(quantity * 100), shipping: money(0), payment: money(quantity * 100) }, sellers: [{ seller_id: "shop", lines: [{ offer_id: "product-a", spec_id: "sku-a", quantity, unit_price: money(100), line_total: money(quantity * 100) }] }] }
      : path.endsWith("/detail") ? { product } : { items: [product], page: 1, page_size: 20, total: 1 };
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn); return fn;
}
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "shopping-test", modules: true, script: "export default {fetch(){return new Response('test')}}", d1Databases: ["DB"] }] }));
  const binding = await mf.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) {
    const statements = readFileSync(`drizzle/${file}`, "utf8").split(";").map(s => s.replaceAll("--> statement-breakpoint", "").trim()).filter(Boolean);
    await binding.batch(statements.map(s => binding.prepare(s)));
  }
  db = createDb(binding as unknown as D1Database);
  for (const id of ["shop-a", "shop-b"]) await db.insert(user).values({ id, name: id, email: `${id}@example.invalid`, memberCode: id, createdAt: new Date(), updatedAt: new Date() });
  await db.insert(warehouseLocations).values({ id: "current", name: "Test", country: "CN", province: "Test", city: "Test", district: "Test", street: "Street", postalCode: "000000", phone: "00000000000", recipient: "Test", hours: "", syncedAt: Date.now() });
  await saveExchangeRate(db, actor.id, "USD", { cnyPerUnitE4: 10000, enabled: true, version: 0 });
  await saveProductPolicy(db, actor, { currency: "USD", markupBps: 0, fixedCnyCents: 0, serviceBps: 0, serviceCnyCents: 0, cnyPerCurrencyE4: 10000, version: 0 });
}, 30000);
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => { await mf?.dispose(); });
describe("shopping persistence and checkout", () => {
  it("deduplicates concurrent adds, protects ownership, and rejects stale updates", async () => {
    remote();
    const rows = await Promise.all([addCartItem(db, token, actor.id, input), addCartItem(db, token, actor.id, input)]);
    expect(rows[0].id).toBe(rows[1].id);
    expect((await listShopping(db, actor.id, "cart", {})).total).toBe(1);
    expect((await listShopping(db, "shop-b", "cart", {})).total).toBe(0);
    await removeShopping(db, "shop-b", "cart", rows[0].id);
    const results = await Promise.allSettled([3, 4].map(quantity => updateCartItem(db, token, actor.id, rows[0].id, { quantity, version: 1 })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    await expect(updateCartItem(db, token, "shop-b", rows[0].id, { quantity: 1, version: 2 })).rejects.toMatchObject({ status: 404 });
    const again = await addCartItem(db, token, actor.id, input);
    expect(again.version).toBe(2);
    expect(again.quantity).not.toBe(2);
    expect(JSON.stringify(again)).not.toMatch(/customerId|seller_secret|"cost"/);
  });
  it("validates stock and rejects client prices before persistence", async () => {
    remote(0);
    await expect(addCartItem(db, token, actor.id, { ...input, productId: "out" })).rejects.toMatchObject({ status: 409 });
    await expect(addCartItem(db, token, actor.id, { ...input, price: 1 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(addCartItem(db, token, actor.id, { ...input, skuId: "missing" })).rejects.toMatchObject({ status: 409 });
  });
  it("deduplicates favorites, paginates, and removes only owned records", async () => {
    remote();
    const raw = { channel: "1688", productId: "product-a" };
    const [a, b] = await Promise.all([addFavorite(db, token, actor.id, raw), addFavorite(db, token, actor.id, raw)]);
    expect(a.id).toBe(b.id);
    await addFavorite(db, token, actor.id, { ...raw, productId: "product-b" });
    const page = await listShopping(db, actor.id, "favorites", { page: "2", pageSize: "1" });
    expect(page.total).toBe(2); expect(page.items).toHaveLength(1);
    await removeShopping(db, "shop-b", "favorites", a.id);
    expect((await listShopping(db, actor.id, "favorites", {})).total).toBe(2);
    await removeShopping(db, actor.id, "favorites", a.id);
    await removeShopping(db, actor.id, "favorites", a.id);
    expect((await listShopping(db, actor.id, "favorites", {})).total).toBe(1);
  });
  it("reuses authoritative quotes, creates unpaid orders and removes only checked out cart items", async () => {
    remote();
    const cart = await addCartItem(db, token, actor.id, input);
    const selection = { items: [{ id: cart.id, version: cart.version }] };
    await expect(previewCart(db, token, "shop-b", selection)).rejects.toMatchObject({ status: 404 });
    await expect(previewCart(db, token, actor.id, { items: [{ id: cart.id, version: 1 }] })).rejects.toMatchObject({ status: 409 });
    const quote = await previewCart(db, token, actor.id, selection);
    expect(quote.totalCents).toBe(cart.quantity * 100);
    remote(0);
    await expect(previewCart(db, token, actor.id, selection)).rejects.toMatchObject({ status: 409 });
    remote();
    const result = await checkoutCart(db, actor, { id: crypto.randomUUID(), previewId: quote.id, confirm: true });
    const order = result.orders[0];
    expect((await customerPurchase(db, actor.id, order.id)).bills[0].status).toBe("issued");
    expect((await listShopping(db, actor.id, "cart", {})).total).toBe(0);
  });
  it("splits mixed channels and rejects duplicate cart selections", async () => {
    remote();
    const a = await addCartItem(db, token, actor.id, input), b = await addCartItem(db, token, actor.id, { ...input, channel: "weidian" });
    expect((await previewCart(db, token, actor.id, { items: [a, b].map(r => ({ id: r.id, version: r.version })) })).groups).toHaveLength(2);
    await expect(previewCart(db, token, actor.id, { items: [a, a].map(r => ({ id: r.id, version: r.version })) })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
describe("marketplace search contracts", () => {
  it("validates channel-specific seller and image inputs", () => {
    expect(imageSearchInput.safeParse({ channel: "1688", image_url: "bad" }).success).toBe(false);
    expect(sellerSearchInput.safeParse({ channel: "taobao", shop_id: "1" }).success).toBe(false);
    expect(sellerSearchInput.safeParse({ channel: "1688", shop_id: "1" }).success).toBe(false);
    expect(sellerSearchInput.safeParse({ channel: "1688", seller_open_id: "1" }).success).toBe(true);
    expect(imageSearchInput.safeParse({ channel: "weidian", image_base64: "AAAA" }).success).toBe(false);
    expect(imageSearchInput.safeParse({ channel: "1688", image_url: "https://127.0.0.1/a" }).success).toBe(false);
    expect(imageSearchInput.safeParse({ channel: "1688", image_id: "id", image_base64: "AAAA" }).success).toBe(false);
    expect(imageSearchInput.safeParse({ channel: "1688", image_base64: "A".repeat(4_194_308) }).success).toBe(false);
  });
  it("uses official endpoints and customer-safe result DTOs", async () => {
    const fn = remote();
    for (const [operation, path, input] of [
      ["sellerSearch", "/v1/products/seller/search", { channel: "1688", seller_open_id: "shop" }],
      ["imageSearch", "/v1/products/search-by-image", { channel: "taobao", image_id: "image" }],
    ] as const) {
      const result = await queryProducts(token, operation, { ...input, page: 1, page_size: 20 });
      expect(fn.mock.lastCall?.[0]).toBe(`https://api.hiobuy.com${path}`);
      expect(JSON.parse(String(fn.mock.lastCall?.[1]?.body))).toMatchObject({ ...input, response_format: "standard" });
      expect(JSON.stringify(result)).not.toMatch(/seller_secret|"cost"/);
      expect("items" in result && result.items?.[0].images).toEqual(["https://cdn.example.com/main.jpg"]);
    }
  });
});

describe("shopping HTTP mounting", () => {
  it("returns the standard envelope and keeps body limits scoped to new endpoints", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("db", db);
      c.set("user", { ...actor, name: "Test", memberCode: "shop-a", phone: null, country: null });
      c.set("requestId", "shopping-http-test");
      await next();
    });
    app.onError((error, c) => c.json({ error: { message: error.message } }, (error as { status?: number }).status as 400 || 500));
    app.route("/api", shoppingClient);
    app.post("/api/unrelated", async c => c.text(await c.req.text()));
    const response = await app.request("/api/cart?page=1&pageSize=1");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ requestId: "shopping-http-test", data: { currency: "CNY", displayOnly: true, total: 2 } });
    expect((await app.request("/api/cart/items", { method: "POST", body: "x".repeat(20_000) })).status).toBe(413);
    expect((await app.request("/api/unrelated", { method: "POST", body: "x".repeat(20_000) })).status).toBe(200);
  });
});


describe("grouped CNY cart", () => {
  async function customer() {
    const id=crypto.randomUUID();await db.insert(user).values({id,name:id,email:`${id}@example.invalid`,memberCode:id,createdAt:new Date(),updatedAt:new Date()});return id;
  }
  it("counts owned SKU rows and quantities without fetching or reading legacy snapshots",async()=>{
    const id=await customer(),other=await customer(),fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    expect(await countCart(db,id)).toEqual({total:0,totalQuantity:0});
    const rowId=crypto.randomUUID(),now=Date.now();
    await db.insert(cartItems).values([
      {id:rowId,customerId:id,channel:"1688",productId:"p",skuId:"a",quantity:2,product:"{}",createdAt:now,updatedAt:now},
      {id:crypto.randomUUID(),customerId:id,channel:"1688",productId:"p",skuId:"b",quantity:3,product:"{}",createdAt:now,updatedAt:now},
      {id:crypto.randomUUID(),customerId:other,channel:"1688",productId:"p",skuId:"a",quantity:99,product:"{}",createdAt:now,updatedAt:now}
    ]);
    expect(await countCart(db,id)).toEqual({total:2,totalQuantity:5});
    const app=new Hono<AppEnv>();app.use("*",async(c,next)=>{c.set("db",db);c.set("user",{id} as never);c.set("requestId","count-test");await next();});app.route("/api",shoppingClient);
    const response=await app.request(`/api/cart/count?customerId=${other}`);
    expect(response.status).toBe(200);expect(await response.json()).toEqual({data:{total:2,totalQuantity:5},requestId:"count-test"});
    await db.update(cartItems).set({quantity:4}).where(eq(cartItems.id,rowId));
    expect(await countCart(db,id)).toEqual({total:2,totalQuantity:7});
    await removeShopping(db,id,"cart",rowId);
    expect(await countCart(db,id)).toEqual({total:1,totalQuantity:3});
    expect(fetcher).not.toHaveBeenCalled();
  });
  function products() {
    const fn=vi.fn(async (_url:RequestInfo|URL,init?:RequestInit)=>{
      const body=JSON.parse(String(init?.body));
      return Response.json({product:{id:body.id,channel:body.channel,title:{original:"Shirt"},
        seller:{id:body.id.startsWith("unknown")?null:body.id.startsWith("other")?"seller-2":"seller-1",name:"Same name",shop_url:"https://example.com/shop",secret:"hidden"},
        variants:[{sku_id:"sku-a",stock:999,price:{original_currency:"CNY",original_amount:12.34,promotion_amount:1,display_amount:0.01,display_currency:"USD"},attributes:[]}],
        price:{original_currency:"CNY",original_amount:1},secret:"hidden"}});
    });vi.stubGlobal("fetch",fn);return fn;
  }
  it("groups by platform and seller, separates unknown sellers, returns every item without pagination",async()=>{
    const id=await customer(),fetcher=products();
    for(const [productId,channel] of [["a","1688"],["b","1688"],["other","1688"],["c","weidian"],["unknown1","1688"],["unknown2","1688"]])
      await addCartItem(db,token,id,{...input,productId,channel});
    fetcher.mockClear();const result=await listCart(db,id,async()=>token);
    expect(result).toMatchObject({currency:"CNY",displayOnly:true,total:6,totalQuantity:12,subtotalCents:14808,priceComplete:true});
    expect(result.groups).toHaveLength(5);
    expect(result.groups.find(g=>g.channel==="1688"&&g.shop.id==="seller-1")).toMatchObject({totalQuantity:4,subtotalCents:4936});
    expect(result.groups.every(g=>g.items.every(i=>i.unitPriceCents===1234&&i.subtotalCents===2468))).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/skuPrices|_cartDisplay|original_amount|secret|customerId/);
    const app=new Hono<AppEnv>();app.use("*",async(c,next)=>{c.set("db",db);c.set("user",{id} as never);c.set("requestId","test");await next();});app.route("/api",shoppingClient);
    expect((await app.request("/api/cart/manual-items")).status).toBe(404);
    const response=await app.request("/api/cart?page=999&pageSize=1");
    const body=await response.json() as {data:typeof result};expect(response.status).toBe(200);expect(body.data.total).toBe(6);expect(body.data.groups).toHaveLength(5);expect(body.data).not.toHaveProperty("page");
    expect((await listCart(db,await customer(),async()=>token)).groups).toEqual([]);
  });
  it("backfills legacy snapshots once, scopes reads, and reports unavailable prices without zero totals",async()=>{
    const id=await customer(),fetcher=products();
    const item=await addCartItem(db,token,id,{...input,productId:"legacy"});
    await db.update(cartItems).set({product:JSON.stringify(item.product)}).where(eq(cartItems.id,item.id));
    fetcher.mockClear();
    const refreshed=await listCart(db,id,async()=>token);
    expect(refreshed.groups[0].items[0]).toMatchObject({id:item.id,version:1,unitPriceCents:1234});
    expect(fetcher).toHaveBeenCalledTimes(1);
    await listCart(db,id,async()=>token);expect(fetcher).toHaveBeenCalledTimes(1);
    await db.update(cartItems).set({product:JSON.stringify(item.product)}).where(eq(cartItems.id,item.id));
    vi.stubGlobal("fetch",vi.fn(async()=>Response.json({error:{message:"Unavailable"}},{status:503})));
    const unavailable=await listCart(db,id,async()=>token);
    expect(unavailable).toMatchObject({total:1,subtotalCents:null,priceComplete:false});
    expect(unavailable.groups[0]).toMatchObject({shop:{id:null},subtotalCents:null,priceComplete:false});
    expect(unavailable.groups[0].items[0].unitPriceCents).toBeNull();
  });
  it("does not overwrite a concurrent quantity change during legacy hydration",async()=>{
    const id=await customer();products();const item=await addCartItem(db,token,id,{...input,productId:"race"});
    await db.update(cartItems).set({product:JSON.stringify(item.product)}).where(eq(cartItems.id,item.id));
    const original=globalThis.fetch;
    vi.stubGlobal("fetch",vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
      await db.update(cartItems).set({quantity:5,version:2}).where(eq(cartItems.id,item.id));return original(url,init);
    }));
    const result=await listCart(db,id,async()=>token);
    expect(result.groups[0].items[0]).toMatchObject({quantity:5,version:2,unitPriceCents:null});
  });
});
