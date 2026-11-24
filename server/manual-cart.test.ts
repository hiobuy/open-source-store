import { listCart } from "./cart-view";
import { countCart, previewCart, removeShopping } from "./shopping";
vi.mock("cloudflare:workers", () => ({env:{}}));
vi.mock("cloudflare:sockets", () => ({connect:vi.fn()}));
import { saveExchangeRate } from "./exchange-rates";
import { saveProductPolicy } from "./product-billing";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { createDb, type Database } from "./db/client";
import { cartItems, procurementBills, procurementOrders, user } from "./db/schema";
import { addManualCart, checkoutManualCart, removeManualCart, updateManualCart } from "./manual-cart";

let mf:Miniflare,db:Database;
const actor={id:"cart-customer",email:"cart@example.invalid"};
const input=()=>({id:crypto.randomUUID(),sourcePlatform:"jd",sellerName:"Test seller",domesticShippingCents:120,remark:"Order note",items:[{productUrl:"https://item.jd.com/123.html",name:"Shirt",specification:"Blue M",unitPriceCents:1234,quantity:2,imageUrl:"https://cdn.example.com/shirt.jpg",remark:"Item note"}]});
beforeAll(async()=>{
  mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:"manual-cart-test",modules:true,script:"export default {fetch(){return new Response('test')}}",d1Databases:["DB"]}]}));
  const binding=await mf.getD1Database("DB");
  for(const file of readdirSync("drizzle").filter(f=>f.endsWith(".sql")).sort()){
    const statements=readFileSync(`drizzle/${file}`,"utf8").split(";").map(s=>s.replaceAll("--> statement-breakpoint","").trim()).filter(Boolean);
    await binding.batch(statements.map(s=>binding.prepare(s)));
  }
  db=createDb(binding as unknown as D1Database);
  await db.insert(user).values({id:actor.id,name:"Test",email:actor.email,memberCode:"CART",createdAt:new Date(),updatedAt:new Date()});
  await saveExchangeRate(db,actor.id,"USD",{cnyPerUnitE4:70000,enabled:true,version:0});
  await saveProductPolicy(db,actor,{currency:"USD",markupBps:1000,fixedCnyCents:0,serviceBps:500,serviceCnyCents:0,version:0});
},30000);
afterEach(()=>vi.unstubAllGlobals());
afterAll(async()=>{await mf?.dispose();});
it("persists every field without remote requests, orders or bills and deduplicates adds",async()=>{
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  const form=input();const results=await Promise.all([addManualCart(db,actor.id,form),addManualCart(db,actor.id,form)]);
  expect(results[0]).toEqual(results[1]);expect(results[0].form).toEqual(form);
  expect(await db.select().from(procurementOrders)).toHaveLength(0);
  expect(await db.select().from(procurementBills)).toHaveLength(0);expect(fetcher).not.toHaveBeenCalled();
  expect((await listCart(db,"other",async()=>"unused")).total).toBe(0);
  await expect(checkoutManualCart(db,{id:"other",email:"other@example.invalid"},form.id,{version:1})).rejects.toMatchObject({status:404});
});
it("protects versions, preserves edits on add retries and never resurrects removed entries",async()=>{
  const form=input();await addManualCart(db,actor.id,form);
  const updated={...form,sellerName:"Updated",items:[{...form.items[0],quantity:3}]};
  const edits=await Promise.allSettled([1,2].map(()=>updateManualCart(db,actor.id,form.id,{form:updated,version:1})));
  expect(edits.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  expect((await addManualCart(db,actor.id,form)).form).toEqual(updated);
  await expect(checkoutManualCart(db,actor,form.id,{version:1})).rejects.toMatchObject({status:409});
  await expect(removeManualCart(db,actor.id,form.id,{version:1})).rejects.toMatchObject({status:409});
  await removeManualCart(db,actor.id,form.id,{version:2});await removeManualCart(db,actor.id,form.id,{version:2});
  await expect(addManualCart(db,actor.id,form)).rejects.toMatchObject({status:409});
});
it("creates exactly one manual order for concurrent checkout and replays the result",async()=>{
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  const form=input();await addManualCart(db,actor.id,form);
  const results=await Promise.all([checkoutManualCart(db,actor,form.id,{version:1}),checkoutManualCart(db,actor,form.id,{version:1})]);
  expect(results[0]).toEqual(results[1]);
  expect(await checkoutManualCart(db,actor,form.id,{version:1})).toEqual(results[0]);
  const [order]=await db.select().from(procurementOrders).where(eq(procurementOrders.id,results[0].id));
  expect(order).toMatchObject({orderType:"manual",customerId:actor.id,platform:"jd"});
  expect((await listCart(db,actor.id,async()=>"unused")).groups.some(g=>g.type==="manual"&&g.items.some(r=>r.id===form.id))).toBe(false);
  expect(await db.select().from(procurementBills).where(eq(procurementBills.orderId,order.id))).toHaveLength(1);
  expect(fetcher).not.toHaveBeenCalled();
  await expect(updateManualCart(db,actor.id,form.id,{form,version:1})).rejects.toMatchObject({status:409});
});
it("freezes edits on interrupted checkout and recovers from the persisted intent",async()=>{
  const form=input();await addManualCart(db,actor.id,form);
  await db.run(sql.raw("CREATE TRIGGER cart_order_failure BEFORE INSERT ON procurement_orders BEGIN SELECT RAISE(ABORT, 'test interruption'); END"));
  try{await expect(checkoutManualCart(db,actor,form.id,{version:1})).rejects.toThrow();}
  finally{await db.run(sql.raw("DROP TRIGGER cart_order_failure"));}
  const [pending]=await db.select().from(cartItems).where(eq(cartItems.id,form.id));
  expect(pending.state).toBe("submitting");
  await expect(updateManualCart(db,actor.id,form.id,{form,version:1})).rejects.toMatchObject({status:409});
  await expect(removeManualCart(db,actor.id,form.id,{version:1})).rejects.toMatchObject({status:409});
  expect(await checkoutManualCart(db,actor,form.id,{version:1})).toEqual({id:pending.orderId});
});

it("unifies reads and counts while keeping colliding IDs and checkout types isolated",async()=>{
  const before=await countCart(db,actor.id);
  const form=input();form.items.push({...form.items[0],quantity:3});
  await addManualCart(db,actor.id,form);
  await db.insert(cartItems).values({id:form.id,customerId:actor.id,channel:"1688",productId:"product",skuId:"sku",quantity:2,product:"{}",createdAt:Date.now(),updatedAt:Date.now()});
  const total=await countCart(db,actor.id);
  expect(total).toEqual({total:before.total+2,totalQuantity:before.totalQuantity+7});
  const cart=await listCart(db,actor.id,async()=>{throw new Error("not configured")});
  expect(cart.total).toBe(total.total);expect(cart.totalQuantity).toBe(total.totalQuantity);
  expect(cart).not.toHaveProperty("manualItems");
  expect(cart.groups.find(g=>g.type==="manual"&&g.items.some(i=>i.id===form.id))).toMatchObject({shop:{id:null,name:form.sellerName},totalQuantity:5,items:[{id:form.id,type:"manual",form,quantity:5}]});
  expect(cart.groups.some(g=>g.type==="standard"&&g.items.some(i=>i.id===form.id))).toBe(true);
  expect(cart.subtotalCents).toBeNull();expect(cart.priceComplete).toBe(false);
  expect(JSON.stringify(cart)).not.toContain("initialPayload");
  await removeShopping(db,actor.id,"cart",form.id);
  expect((await listCart(db,actor.id,async()=>"unused")).groups.some(g=>g.type==="manual"&&g.items.some(i=>i.id===form.id))).toBe(true);
  await expect(previewCart(db,"unused",actor.id,{items:[{id:form.id,version:1}]})).rejects.toMatchObject({status:404});
  await updateManualCart(db,actor.id,form.id,{version:1,form:{...form,items:[{...form.items[0],quantity:9}]}});
  expect(await countCart(db,actor.id)).toEqual({total:before.total+1,totalQuantity:before.totalQuantity+9});
  await removeManualCart(db,actor.id,form.id,{version:2});
  expect(await countCart(db,actor.id)).toEqual(before);
  expect((await listCart(db,"other",async()=>"unused")).total).toBe(0);
});

it("keeps same-name manual sellers separate inside the unified groups array",async()=>{
  const first=input(),second=input();
  await addManualCart(db,actor.id,first);await addManualCart(db,actor.id,second);
  const cart=await listCart(db,actor.id,async()=>{throw new Error("not configured")});
  const groups=cart.groups.filter(g=>g.type==="manual"&&g.items.some(i=>i.id===first.id||i.id===second.id));
  expect(groups).toHaveLength(2);expect(new Set(groups.map(g=>g.key)).size).toBe(2);
  expect(groups.every(g=>g.shop.id===null&&g.shop.name===first.sellerName)).toBe(true);
});
