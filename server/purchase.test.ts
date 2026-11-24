import { domesticPurchaseTracking, parseDomesticTracking } from "./purchase-logistics";
import { packagePhotos, shipmentPackages, shipments } from "./db/schema";
import { purchaseItemDetails, purchaseCouponRedemptions, marketingCoupons, purchaseOrderAttachments } from "./db/schema";
import { uploadClientImage, imageKey } from "./client-images";
import { readOrderAttachment } from "./purchase-attachments";
import { voidBill } from "./product-billing";
import { cancelCustomerPurchase } from "./purchase-customer-cancel";
import { customerPurchaseCounts } from "./purchase-customer-query";
import { auditLogs } from "./db/schema";
import { saveExchangeRate } from "./exchange-rates";
import { createManualPurchase } from "./manual-purchase";
import { manualPurchaseInput, priceManualPurchase } from "../src/domain/manual-purchase";
import { packages, procurementItemPackages, procurementOrders, procurementTrackingEvents } from "./db/schema";
import { trackProcurement } from "./procurement-tracking";
import { applyPurchasePackageSnapshot } from "./fulfillment-sync";
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("cloudflare:sockets", () => ({ connect: vi.fn() }));
import { procurementOverviews } from "./procurement-overview";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { createDb, type Database } from "./db/client";
import { procurementBills, procurementItems, procurementRemote, purchaseAttempts, purchaseQuotes, user, wallets, walletTransactions, warehouseLocations } from "./db/schema";
import { fillPurchaseMedia, productMedia, readProductMedia } from "./purchase-media";
import { orderDetail } from "./operations";
import { createPurchase, customerPurchase, listCustomerPurchases, payPurchaseBill, performPurchaseAction, previewPurchase, reconcilePurchase } from "./purchase";
import { readProductPolicy, saveProductPolicy } from "./product-billing";
import { pricePurchase, purchasePreviewInput } from "../src/domain/purchase";
import { publicProduct, queryProducts } from "./purchase-products";
import { can, permissionFor } from "../src/domain/staff";
let mf:Miniflare,db:Database;
const actor={id:"purchase-test",email:"purchase@example.invalid"},token="test-token-never-live";
const input={channel:"1688" as const,lines:[{id:"product-1",spec_id:"sku-1",quantity:2}]};
const money=(amount:number)=>({currency:"CNY",amount});
const preview=(channel="1688")=>({channel,success:true,preview_id:"test-preview",monetary_unit:"CNY_minor",unavailable_lines:[],total:{merchandise:money(2000),shipping:money(100),payment:money(2200)},sellers:[{seller_id:"seller-1",lines:[{offer_id:"product-1",spec_id:"sku-1",quantity:2,unit_price:money(1000),line_total:money(2000)}]}]});
const policy={currency:"USD",markupBps:1000,fixedCnyCents:0,serviceBps:0,serviceCnyCents:0,cnyPerCurrencyE4:10000,version:1};
function fakeRemote(overrides:Record<string,unknown>={}){
  const fetcher=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
    const path=new URL(String(url)).pathname,body=JSON.parse(String(init?.body??"{}"));
    const value=overrides[path]??(path==="/v1/products/detail"?{product:{id:body.id,channel:body.channel,title:{original:"Test product"},variants:[{sku_id:"sku-1",stock:999}]}}:path.endsWith("/preview")?preview(body.channel):path.endsWith("/create")?{success:true,order_id:crypto.randomUUID(),currency:"CNY",payment:2200,shipping:0}:path.endsWith("/detail")?{order:{order_id:body.order_id,status:"WAIT_BUYER_PAY",total:money(2200)}}:path.endsWith("/pay")?{success:true,payment_status:"success",order_id:body.order_id}:{success:true,pending:true});
    if(value instanceof Error)throw value;
    return new Response(JSON.stringify(value),{status:path.endsWith("/create")?201:200,headers:{"Content-Type":"application/json"}});
  });vi.stubGlobal("fetch",fetcher);return fetcher;
}
async function makeOrder(channel:"1688"|"weidian"="1688"){
  const q=await previewPurchase(db,token,actor.id,{...input,channel});
  return createPurchase(db,actor,actor.id,{id:crypto.randomUUID(),quoteId:q.id});
}
beforeAll(async()=>{
  mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:"purchase-test",modules:true,script:"export default {fetch(){return new Response('test')}}",d1Databases:["DB"],r2Buckets:["PHOTOS"]}]}));
  const binding=await mf.getD1Database("DB");
  for(const file of readdirSync("drizzle").filter(f=>f.endsWith(".sql")).sort()){
    const statements=readFileSync(`drizzle/${file}`,"utf8").split(";").map(s=>s.replaceAll("--> statement-breakpoint","").trim()).filter(Boolean);
    await binding.batch(statements.map(s=>binding.prepare(s)));
  }
  db=createDb(binding as unknown as D1Database);
  await db.insert(user).values({id:actor.id,name:"Purchase test",email:actor.email,memberCode:"TEST-P",createdAt:new Date(),updatedAt:new Date()});
  await db.insert(wallets).values({userId:actor.id,balanceFen:100000});
  await db.insert(warehouseLocations).values({id:"current",name:"Test",country:"CN",province:"Test",city:"Test",district:"Test",street:"Test street",postalCode:"000000",phone:"00000000000",recipient:"Test receiver",hours:"",syncedAt:Date.now()});
  await saveExchangeRate(db, actor.id, "USD", { cnyPerUnitE4: 10000, enabled: true, version: 0 });
  await saveProductPolicy(db,actor,{...policy,version:0});
},30000);
afterEach(()=>vi.unstubAllGlobals());afterAll(async()=>{await mf?.dispose();});
describe("HioBuy purchase contracts",()=>{
  async function parcelOrder() {
    fakeRemote(); const order = await makeOrder();
    await payPurchaseBill(db, actor, order.id);
    const remote = await performPurchaseAction(db, token, actor, order.id, "create");
    return {order, remote};
  }
  function parcelApi(remoteId: string, parcels: {tracking_number:string;lines:{sku:string;quantity:number}[]}[], rows: Record<string, unknown>[], detailStatus=200, product?:unknown) {
    const procurement = fakeRemote({"/v1/orders/detail":{order:{order_id:remoteId,status:"wait_receive",total:money(2200),domestic_parcels:parcels}},...(product?{"/v1/products/detail":{product}}:{})});
    const fetcher = vi.fn(async (url: RequestInfo|URL, init?:RequestInit) => {
      const u = new URL(String(url));
      if(u.pathname === "/v1/fulfillment/packages") {
        expect(init?.method).toBe("GET");
        expect(u.searchParams.get("tracking_number")).toBeTruthy();
        const matched = rows.filter(r=>r.tracking_number===u.searchParams.get("tracking_number"));
        return Response.json({data:matched,pagination:{page:1,total_pages:1}});
      }
      if(u.pathname.startsWith("/v1/fulfillment/packages/")) return Response.json(rows.find(r=>r.id===u.pathname.split("/").at(-1))??{}, {status:detailStatus});
      return procurement(url,init);
    });
    vi.stubGlobal("fetch",fetcher); return fetcher;
  }
  it("links fulfillment identities once and follows partial/full warehouse receipt without submitting notices",async()=>{
    const {order,remote}=await parcelOrder(), prefix=crypto.randomUUID();
    const parcels=[1,2].map(n=>({tracking_number:`${prefix}-${n}`,lines:[{sku:"sku-1",quantity:1}]}));
    const rows=parcels.map((p,n)=>({id:`${prefix}-remote-${n}`,tracking_number:p.tracking_number,status:"PENDING"}));
    const fetcher=parcelApi(remote!.remoteId!,parcels,rows);
    await performPurchaseAction(db,token,actor,order.id,"sync");
    await performPurchaseAction(db,token,actor,order.id,"sync");
    const linked=await db.select().from(procurementItemPackages).where(eq(procurementItemPackages.orderId,order.id));
    expect(linked).toHaveLength(2);expect(linked.every(l=>l.receiptSource==="fulfillment"&&l.receivedQuantity===0)).toBe(true);
    expect((await procurementOverviews(db,[order.id]))[0].stage).toBe("transit");
    const pkg=(await db.select().from(packages).where(eq(packages.id,linked[0].packageId)))[0];
    const received={...rows.find(r=>r.id===pkg.hiobuyPackageId),status:"RECEIVED",warehouse:{weight:{value:0.5,unit:"kg"}},received_at:"2026-11-12T04:00:00Z"};
    await applyPurchasePackageSnapshot(db,pkg,{status:200,timedOut:false,payload:received});
    expect((await procurementOverviews(db,[order.id]))[0]).toMatchObject({stage:"partial",received:1});
    for(const row of rows)row.status="RECEIVED";
    await performPurchaseAction(db,token,actor,order.id,"sync");
    expect((await procurementOverviews(db,[order.id]))[0]).toMatchObject({stage:"stocked",received:2});
    const before=(await db.select().from(procurementTrackingEvents).where(eq(procurementTrackingEvents.orderId,order.id))).length;
    await performPurchaseAction(db,token,actor,order.id,"sync");
    expect((await db.select().from(procurementTrackingEvents).where(eq(procurementTrackingEvents.orderId,order.id)))).toHaveLength(before);
    expect(fetcher.mock.calls.some(([url])=>/inbounds|\/pay$/.test(String(url)))).toBe(false);
    // Manual receipt correction is never overwritten on the next warehouse pull.
    const fresh=(await db.select().from(procurementOrders).where(eq(procurementOrders.id,order.id)))[0];
    await trackProcurement(db,actor,order.id,{id:crypto.randomUUID(),orderVersion:fresh.version,action:"arrival",linkId:linked[0].id,receivedQuantity:0,note:"Correct warehouse count"});
    await performPurchaseAction(db,token,actor,order.id,"sync");
    expect((await procurementOverviews(db,[order.id]))[0]).toMatchObject({stage:"partial",received:1});
  });
  it.each(["missing","duplicate","wrong-detail","foreign-customer","unknown-sku"])("refuses unsafe parcel association: %s",async(reason)=>{
    const {order,remote}=await parcelOrder(), tracking=crypto.randomUUID();
    const parcels=[{tracking_number:tracking,lines:[{sku:reason==="unknown-sku"?"unknown":"sku-1",quantity:2}]}];
    const rows=reason==="missing"?[]:[{id:crypto.randomUUID(),tracking_number:tracking,status:"PENDING"}];
    if(reason==="duplicate")rows.push({...rows[0],id:crypto.randomUUID()});
    if(reason==="foreign-customer")await db.insert(packages).values({id:crypto.randomUUID(),userId:"other-customer",publicId:tracking,domesticTrackingNumber:tracking,courier:"",packageStatus:"PENDING",exceptionStatus:"NONE",vasStatus:"NONE",lockStatus:"AVAILABLE",disposition:"NONE",createdAt:Date.now(),updatedAt:Date.now()});
    parcelApi(remote!.remoteId!,parcels,rows,reason==="wrong-detail"?404:200);
    await expect(performPurchaseAction(db,token,actor,order.id,"sync")).rejects.toMatchObject({code:"PURCHASE_PACKAGE_REVIEW"});
    expect(await db.select().from(procurementItemPackages).where(eq(procurementItemPackages.orderId,order.id))).toHaveLength(0);
  });
  it("resumes a partially linked order after a detail failure and tolerates concurrent sync retries",async()=>{
    const {order,remote}=await parcelOrder(), prefix=crypto.randomUUID();
    const parcels=[1,2].map(n=>({tracking_number:`${prefix}-${n}`,lines:[{sku:"sku-1",quantity:1}]}));
    const rows=parcels.map((p,n)=>({id:`${prefix}-${n}`,tracking_number:p.tracking_number,status:"PENDING"}));
    parcelApi(remote!.remoteId!,parcels,rows.slice(0,1));
    await expect(performPurchaseAction(db,token,actor,order.id,"sync")).rejects.toMatchObject({code:"PURCHASE_PACKAGE_REVIEW"});
    expect(await db.select().from(procurementItemPackages).where(eq(procurementItemPackages.orderId,order.id))).toHaveLength(1);
    parcelApi(remote!.remoteId!,parcels,rows);
    await Promise.allSettled([performPurchaseAction(db,token,actor,order.id,"sync"),performPurchaseAction(db,token,actor,order.id,"sync")]);
    await performPurchaseAction(db,token,actor,order.id,"sync");
    const linked=await db.select().from(procurementItemPackages).where(eq(procurementItemPackages.orderId,order.id));
    expect(linked).toHaveLength(2);
    expect(linked.reduce((n,l)=>n+l.allocatedQuantity,0)).toBe(2);
    expect((await db.select().from(packages)).filter(p=>p.domesticTrackingNumber.startsWith(prefix))).toHaveLength(2);
  });
  it("resolves parcel upstream SKU through the verified original product and persists the mapping",async()=>{
    const {order,remote}=await parcelOrder(), tracking=crypto.randomUUID();
    const parcels=[{tracking_number:tracking,lines:[{sku:"5170933807723",quantity:2}]}];
    const rows=[{id:crypto.randomUUID(),tracking_number:tracking,status:"PENDING"}];
    const fetcher=parcelApi(remote!.remoteId!,parcels,rows,200,{id:"product-1",channel:"1688",variants:[{sku_id:"sku-1",upstream_sku_id:"5170933807723"}]});
    await performPurchaseAction(db,token,actor,order.id,"sync");
    const item=(await db.select().from(procurementItems).where(eq(procurementItems.orderId,order.id)))[0];
    expect(JSON.parse(item.productSnapshot!)).toMatchObject({upstreamSkuId:"5170933807723"});
    await performPurchaseAction(db,token,actor,order.id,"sync");
    expect(fetcher.mock.calls.filter(([url])=>String(url).endsWith("/v1/products/detail"))).toHaveLength(1);
    expect(await db.select().from(procurementItemPackages).where(eq(procurementItemPackages.orderId,order.id))).toHaveLength(1);
  });
  it("rejects a foreign product when resolving parcel upstream SKUs",async()=>{
    const {order,remote}=await parcelOrder(), tracking=crypto.randomUUID();
    parcelApi(remote!.remoteId!,[{tracking_number:tracking,lines:[{sku:"upstream",quantity:2}]}],[],200,{id:"other-product",channel:"1688",variants:[{sku_id:"sku-1",upstream_sku_id:"upstream"}]});
    await expect(performPurchaseAction(db,token,actor,order.id,"sync")).rejects.toMatchObject({code:"PURCHASE_PACKAGE_REVIEW"});
    expect(await db.select().from(procurementItemPackages).where(eq(procurementItemPackages.orderId,order.id))).toHaveLength(0);
  });
  it("fills parcel goods even when lifecycle is unchanged and retains them when later responses omit items",async()=>{
    const {order,remote}=await parcelOrder(),tracking=crypto.randomUUID();
    const parcels=[{tracking_number:tracking,lines:[{sku:"sku-1",quantity:2}]}];
    const row={id:crypto.randomUUID(),tracking_number:tracking,status:"PENDING"};
    parcelApi(remote!.remoteId!,parcels,[row]);
    await performPurchaseAction(db,token,actor,order.id,"sync");
    parcelApi(remote!.remoteId!,parcels,[{...row,items:[{name:"Cotton shirt",quantity:2,image_url:"https://example.com/shirt.jpg"}],total_value:15,currency:"CNY"}]);
    await performPurchaseAction(db,token,actor,order.id,"sync");
    const pkg=(await db.select().from(packages).where(eq(packages.hiobuyPackageId,row.id)))[0];
    expect(pkg).toMatchObject({packageStatus:"PENDING",productName:"Cotton shirt",quantity:2,declaredValueFen:1500,declaredCurrency:"CNY"});
    expect(JSON.parse(pkg.fulfillmentItems!)).toEqual([{name:"Cotton shirt",quantity:2,imageUrl:"https://example.com/shirt.jpg"}]);
    parcelApi(remote!.remoteId!,parcels,[row]);
    await performPurchaseAction(db,token,actor,order.id,"sync");
    expect((await db.select().from(packages).where(eq(packages.id,pkg.id)))[0].fulfillmentItems).toBe(pkg.fulfillmentItems);
  });
  const picturedProduct={id:"product-1",channel:"1688",title:{original:"Test product"},source_url:"https://example.com/product-1",images:["https://example.com/main.jpg"],variants:[{sku_id:"sku-1",stock:999,image:"https://example.com/sku.jpg",attributes:[{value:"White"},{value:"M"}]}]};
  it("exposes saved media and bill fees to the owner without exposing procurement costs",async()=>{
    fakeRemote({"/v1/products/detail":{product:picturedProduct}});
    const order=await makeOrder();
    const detail=await customerPurchase(db,actor.id,order.id);
    const listed=(await listCustomerPurchases(db,actor.id,{page:1,pageSize:100})).items.find(o=>o.id===order.id);
    expect(listed).toEqual(detail);
    expect(detail.items[0]).toMatchObject({imageUrl:"https://example.com/sku.jpg",sourceUrl:"https://example.com/product-1",variantLabel:"White / M",quantity:2});
    expect(detail.bills[0]).toMatchObject({goodsCents:2200,shippingCents:100,serviceCents:100,discountCents:0,totalCents:2400,currency:"USD"});
    expect(JSON.stringify(detail)).not.toMatch(/productSnapshot|costCny|markup|receiver|seller_id/);
    await expect(customerPurchase(db,"other-user",order.id)).rejects.toMatchObject({status:404});
    await db.update(procurementItems).set({productSnapshot:null}).where(eq(procurementItems.orderId,order.id));
    expect((await customerPurchase(db,actor.id,order.id)).items[0]).toMatchObject({imageUrl:null,variantLabel:null,sku:"sku-1"});
  });
  it("saves selected SKU media and exposes historical selling amounts in admin details",async()=>{
    fakeRemote({"/v1/products/detail":{product:picturedProduct}});
    const order=await makeOrder(),detail=await orderDetail(db,order.id);
    expect(detail.items[0]).toMatchObject({imageUrl:"https://example.com/sku.jpg",sourceUrl:"https://example.com/product-1",variantLabel:"White / M",sellingLineCents:2200,sellingCurrency:"USD"});
    expect(detail.items[0]).not.toHaveProperty("productSnapshot");
    expect(detail.overview).toMatchObject({billGoodsCents:2200,billShippingCents:100,billServiceCents:100});
    expect(detail.overview?.amountMetadata).toMatchObject({exchangeRate:10000,serviceBps:0,upstreamFeeCnyCents:100,cnyTotalCents:2400,cnyBasis:"original"});
    expect(detail.overview).not.toHaveProperty("billSnapshot");
  });
  it("backfills only media, preserves billing and remote state, and skips already saved images",async()=>{
    fakeRemote();const order=await makeOrder();
    const before=await orderDetail(db,order.id);
    const fetcher=fakeRemote({"/v1/products/detail":{product:picturedProduct}});
    expect(await fillPurchaseMedia(db,token,actor,order.id)).toEqual({updated:1});
    expect(await fillPurchaseMedia(db,token,actor,order.id)).toEqual({updated:0});
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain("/v1/products/detail");
    const after=await orderDetail(db,order.id);
    expect(after.bills).toEqual(before.bills);expect(after.remote).toEqual(before.remote);
    expect(after.items[0]).toMatchObject({name:before.items[0].name,quantity:before.items[0].quantity,unitPriceCents:before.items[0].unitPriceCents,imageUrl:"https://example.com/sku.jpg"});
    expect(after.totalCents).toBe(before.totalCents);
  });
  it("never backfills another product or a mismatched historical SKU",async()=>{
    fakeRemote();const order=await makeOrder();
    fakeRemote({"/v1/products/detail":{product:{...picturedProduct,id:"wrong-product"}}});
    await expect(fillPurchaseMedia(db,token,actor,order.id)).rejects.toMatchObject({code:"INVALID_PRODUCT"});
    await db.update(procurementItems).set({sku:"different-sku"}).where(eq(procurementItems.orderId,order.id));
    const fetcher=fakeRemote();expect(await fillPurchaseMedia(db,token,actor,order.id)).toEqual({updated:0});expect(fetcher).not.toHaveBeenCalled();
  });
  it("falls back to a real main image, strips unsafe URLs, and protects the backfill endpoint",()=>{
    expect(productMedia(publicProduct({...picturedProduct,variants:[{sku_id:"sku-1"}]}),"sku-1").imageUrl).toBe("https://example.com/main.jpg");
    expect(readProductMedia('{"imageUrl":"javascript:alert(1)","sourceUrl":"data:text/html,test"}')).toMatchObject({imageUrl:null,sourceUrl:null});
    expect(readProductMedia("invalid").imageUrl).toBeNull();
    expect(permissionFor("POST","/procurement/123/media")).toBe("procurement.write");
    expect(can("support","procurement.write")).toBe(false);expect(can("manager","procurement.write")).toBe(true);
  });
  it("separates customer payment, operator queue and remote exceptions in the order overview",async()=>{
    fakeRemote();const order=await makeOrder();
    expect((await procurementOverviews(db,[order.id]))[0]).toMatchObject({stage:"awaiting_payment",payment:"issued",billCurrency:"USD"});
    await payPurchaseBill(db,actor,order.id);
    expect((await procurementOverviews(db,[order.id]))[0]).toMatchObject({stage:"pending",payment:"paid"});
    await performPurchaseAction(db,token,actor,order.id,"create");
    expect((await procurementOverviews(db,[order.id]))[0].stage).toBe("buying");
    await db.update(procurementRemote).set({state:"creating",updatedAt:Date.now()-120000}).where(eq(procurementRemote.orderId,order.id));
    expect((await procurementOverviews(db,[order.id]))[0].stage).toBe("exception");
    await db.update(procurementRemote).set({state:"review_required",updatedAt:Date.now()}).where(eq(procurementRemote.orderId,order.id));
    expect((await procurementOverviews(db,[order.id]))[0].stage).toBe("exception");
  });
  it.each(["wait_receive", "WAIT_RECEIVE"])("projects synced %s as awaiting warehouse arrival while preserving review priority",async(status)=>{
    fakeRemote();const order=await makeOrder();
    await payPurchaseBill(db,actor,order.id);
    const remote=await performPurchaseAction(db,token,actor,order.id,"create");
    expect((await procurementOverviews(db,[order.id]))[0].stage).toBe("buying");
    fakeRemote({"/v1/orders/detail":{order:{order_id:remote!.remoteId,status,total:money(2200)}}});
    await performPurchaseAction(db,token,actor,order.id,"sync");
    expect((await procurementOverviews(db,[order.id]))[0]).toMatchObject({stage:"transit",remoteStatus:status});
    await db.update(procurementRemote).set({state:"review_required"}).where(eq(procurementRemote.orderId,order.id));
    expect((await procurementOverviews(db,[order.id]))[0].stage).toBe("exception");
  });
  it("accepts a single product with an omitted seller ID but never combines unknown sellers",()=>{
    const raw=preview();(raw.sellers[0] as {seller_id:string|null}).seller_id=null;
    expect(pricePurchase(input,raw,policy).sellerId).toBeNull();
    expect(()=>pricePurchase({...input,lines:[...input.lines,{id:"another",spec_id:"sku-2",quantity:1}]},raw,policy)).toThrow();
  });
  it("persists product names and rejects unavailable variants before issuing a quote",async()=>{
    fakeRemote();const order=await makeOrder();expect(order.items[0].name).toBe("Test product");
    fakeRemote({"/v1/products/detail":{product:{id:"product-1",channel:"1688",variants:[{sku_id:"sku-1",stock:1}]}}});
    await expect(previewPurchase(db,token,actor.id,input)).rejects.toMatchObject({code:"OUT_OF_STOCK"});
  });
  it("supports warehouse order_sn and blocks costs exceeding customer receipts",async()=>{
    fakeRemote();const order=await makeOrder();await payPurchaseBill(db,actor,order.id);
    const fetcher=fakeRemote({"/v1/orders/create":{success:true,order_sn:"DG-TEST",external_order_id:order.id,currency:"CNY",payment:3000,shipping:0}});
    expect(await performPurchaseAction(db,token,actor,order.id,"create")).toMatchObject({remoteId:"DG-TEST",state:"review_required",remoteCostCnyCents:3000});
    await expect(performPurchaseAction(db,token,actor,order.id,"pay")).rejects.toMatchObject({status:409});
    expect(fetcher.mock.calls.filter(([u])=>String(u).endsWith("/pay"))).toHaveLength(0);
    expect((await customerPurchase(db,actor.id,order.id)).bills[0].status).toBe("paid");
  });
  it("counts 1688 domestic freight once from submission through payment", async () => {
    const quote = preview();
    quote.total = { merchandise: money(444), shipping: money(200), payment: money(644) };
    const line = quote.sellers[0].lines[0];
    line.unit_price = money(222);
    line.line_total = money(444);
    const remoteId = "DG-FREIGHT-INCLUDED";
    const fetcher = fakeRemote({
      "/v1/orders/preview": quote,
      "/v1/orders/create": { success: true, order_id: remoteId, currency: "CNY", monetary_unit: "CNY_minor", payment: 644, shipping: 200 },
      "/v1/orders/detail": { order: { order_id: remoteId, total: money(644), purchase_amount: money(444), shipping_fee: money(200) } },
    });
    const order = await makeOrder();
    await payPurchaseBill(db, actor, order.id);
    for (const action of ["create", "sync"] as const) {
      expect(await performPurchaseAction(db, token, actor, order.id, action)).toMatchObject({
        state: "created", paymentStatus: "unpaid", remoteId, remoteCostCnyCents: 644,
      });
    }
    await performPurchaseAction(db, token, actor, order.id, "pay", undefined, 644);
    const pays = fetcher.mock.calls.filter(([url]) => String(url).endsWith("/pay"));
    expect(pays).toHaveLength(1);
    expect(JSON.parse(String(pays[0][1]?.body)).pay_amount).toBe(644);
  });
  it("accepts higher or equal customer receipts, clears only amount review and pays the actual cost once",async()=>{
    fakeRemote();const order=await makeOrder();await payPurchaseBill(db,actor,order.id);
    fakeRemote({"/v1/orders/create":{success:true,order_id:"COVERED",currency:"CNY",payment:2300,shipping:0}});
    expect(await performPurchaseAction(db,token,actor,order.id,"create")).toMatchObject({state:"created"});
    const before=(await db.select().from(wallets).where(eq(wallets.userId,actor.id)))[0].balanceFen;
    const billBefore=(await db.select().from(procurementBills).where(eq(procurementBills.orderId,order.id)))[0];
    for(const [amount,state] of [[2401,"review_required"],[2400,"created"],[1500,"created"]] as const){
      const fetcher=fakeRemote({"/v1/orders/detail":{order:{order_id:"COVERED",status:"WAIT_BUYER_PAY",total:money(amount)}}});
      expect(await performPurchaseAction(db,token,actor,order.id,"sync")).toMatchObject({state});
      expect(fetcher.mock.calls.every(([u])=>String(u).endsWith("/detail"))).toBe(true);
    }
    const fetcher=fakeRemote({"/v1/orders/detail":{order:{order_id:"COVERED",status:"WAIT_BUYER_PAY",total:money(1500)}}});
    await performPurchaseAction(db,token,actor,order.id,"pay");await performPurchaseAction(db,token,actor,order.id,"pay");
    const pays=fetcher.mock.calls.filter(([u])=>String(u).endsWith("/pay"));expect(pays).toHaveLength(1);
    expect(JSON.parse(String(pays[0][1]?.body)).pay_amount).toBe(1500);
    expect((await db.select().from(wallets).where(eq(wallets.userId,actor.id)))[0].balanceFen).toBe(before);
    expect((await db.select().from(procurementBills).where(eq(procurementBills.orderId,order.id)))[0]).toEqual(billBefore);
    expect((await db.select().from(procurementRemote).where(eq(procurementRemote.orderId,order.id)))[0].costCnyCents).toBe(2200);
    expect((await procurementOverviews(db,[order.id],true))[0]).toMatchObject({paidCostCnyCents:1500,profitCnyCents:900});
    expect((await procurementOverviews(db,[order.id]))[0]).not.toHaveProperty("profitCnyCents");
    fakeRemote({"/v1/orders/detail":{order:{order_id:"COVERED",payment_status:"paid",total:money(1600)}}});
    await performPurchaseAction(db,token,actor,order.id,"sync");
    expect((await procurementOverviews(db,[order.id],true))[0]).toMatchObject({paidCostCnyCents:1500,profitCnyCents:900});
  });
  it("keeps missing costs under review and rejects a foreign order before paying",async()=>{
    fakeRemote();const order=await makeOrder();await payPurchaseBill(db,actor,order.id);await performPurchaseAction(db,token,actor,order.id,"create");
    const r=(await db.select().from(procurementRemote).where(eq(procurementRemote.orderId,order.id)))[0];
    fakeRemote({"/v1/orders/detail":{order:{order_id:r.remoteId,status:"WAIT_BUYER_PAY"}}});
    expect(await performPurchaseAction(db,token,actor,order.id,"sync")).toMatchObject({state:"review_required"});
    fakeRemote({"/v1/orders/detail":{order:{order_id:r.remoteId,total:money(2200)}}});await performPurchaseAction(db,token,actor,order.id,"sync");
    const fetcher=fakeRemote({"/v1/orders/detail":{order:{order_id:"other-order",total:money(1000)}}});
    await expect(performPurchaseAction(db,token,actor,order.id,"pay")).rejects.toMatchObject({status:409});
    expect(fetcher.mock.calls.some(([u])=>String(u).endsWith("/pay"))).toBe(false);
  });
  it("enforces the operator amount limit before create and before payment without claiming an attempt",async()=>{
    fakeRemote();const order=await makeOrder();await payPurchaseBill(db,actor,order.id);
    await expect(performPurchaseAction(db,token,actor,order.id,"create",undefined,2199)).rejects.toMatchObject({status:409});
    expect(await db.select().from(purchaseAttempts).where(eq(purchaseAttempts.orderId,order.id))).toHaveLength(0);
    await performPurchaseAction(db,token,actor,order.id,"create",undefined,2200);
    const r=(await db.select().from(procurementRemote).where(eq(procurementRemote.orderId,order.id)))[0];
    const fetcher=fakeRemote({"/v1/orders/detail":{order:{order_id:r.remoteId,total:money(2300)}}});
    await expect(performPurchaseAction(db,token,actor,order.id,"pay",undefined,2200)).rejects.toMatchObject({status:409});
    expect(fetcher.mock.calls.some(([u])=>String(u).endsWith("/pay"))).toBe(false);
    expect(await db.select().from(purchaseAttempts).where(eq(purchaseAttempts.orderId,order.id))).toHaveLength(1);
    expect((await db.select().from(procurementRemote).where(eq(procurementRemote.orderId,order.id)))[0]).toMatchObject({state:"created",paymentStatus:"unpaid"});
    await performPurchaseAction(db,token,actor,order.id,"pay",undefined,2300);
    await performPurchaseAction(db,token,actor,order.id,"pay",undefined,2300);
    expect(fetcher.mock.calls.filter(([u])=>String(u).endsWith("/pay"))).toHaveLength(1);
  });
  it("recovers a persisted warehouse identity with detail only, without a second create",async()=>{
    fakeRemote();const order=await makeOrder();await payPurchaseBill(db,actor,order.id);
    fakeRemote({"/v1/orders/create":new Error("timeout")});await performPurchaseAction(db,token,actor,order.id,"create");
    await db.update(procurementRemote).set({lastResult:JSON.stringify({success:true,order_sn:"DG-RECOVER",external_order_id:order.id})}).where(eq(procurementRemote.orderId,order.id));
    const fetcher=fakeRemote();
    expect(await performPurchaseAction(db,token,actor,order.id,"sync")).toMatchObject({remoteId:"DG-RECOVER",state:"created"});
    expect(fetcher.mock.calls.every(([u])=>String(u).endsWith("/detail"))).toBe(true);
  });
  it("does not overwrite a concurrent reconciliation with a late creation response",async()=>{
    fakeRemote();const order=await makeOrder();await payPurchaseBill(db,actor,order.id);
    const original=globalThis.fetch;
    vi.stubGlobal("fetch",async(url:RequestInfo|URL,init?:RequestInit)=>{
      if(String(url).endsWith("/create")){
        await db.update(procurementRemote).set({remoteId:"reconciled-id",state:"review_required",updatedAt:Date.now()+1000}).where(eq(procurementRemote.orderId,order.id));
        return new Response(JSON.stringify({success:true,order_id:"late-id"}),{status:201});
      }
      return original(url,init);
    });
    expect(await performPurchaseAction(db,token,actor,order.id,"create")).toMatchObject({remoteId:"reconciled-id",state:"review_required"});
  });
  it("validates CNY minor units, seller ownership, quantities and fees",()=>{
    const result=pricePurchase(input,preview(),policy);
    expect(result.upstreamFeeCnyCents).toBe(100);expect(result.quote.shippingCents).toBe(100);expect(result.quote.serviceCents).toBe(100);expect(result.quote.totalCents).toBe(2400);
    expect(()=>pricePurchase(input,{...preview(),sellers:[]},policy)).toThrow();
    expect(()=>pricePurchase({...input,lines:[{...input.lines[0],quantity:3}]},preview(),policy)).toThrow();
    expect(()=>pricePurchase(input,{...preview(),total:{...preview().total,payment:{currency:"USD",amount:2200}}},policy)).toThrow();
    expect(purchasePreviewInput.safeParse({...input,price:1}).success).toBe(false);
  });
  it("never returns marketplace costs or internal payloads to customers",()=>{
    const p=publicProduct({id:"1",channel:"1688",price:{amount:1},metadata:{apiKey:"secret"},seller:{account:"private"},variants:[{sku_id:"sku",price:{amount:1},stock:3}]});
    expect(JSON.stringify(p)).not.toMatch(/secret|private|amount|apiKey/);expect(p.variants[0].skuId).toBe("sku");
  });
  it("keeps real search thumbnails and detail gallery images in the customer DTO",()=>{
    expect(publicProduct({id:"1",image:"https://example.com/search.jpg"}).images).toEqual(["https://example.com/search.jpg"]);
    expect(publicProduct({id:"1",images:[{url:"https://example.com/detail.jpg"}],image:"https://example.com/detail.jpg"}).images).toEqual(["https://example.com/detail.jpg"]);
    expect(publicProduct({id:"1",image:"javascript:alert(1)"}).images).toEqual([]);
  });
  it("preserves upstream pagination when a channel adjusts the requested page size",async()=>{
    fakeRemote({"/v1/products/search":{items:[{id:"1",image:"https://example.com/product.jpg"}],page:2,page_size:20,total:100}});
    const result=await queryProducts(token,"search",{channel:"weidian",keyword:"test",page:2,page_size:3});
    expect(result).toMatchObject({page:2,pageSize:20,total:100,items:[{images:["https://example.com/product.jpg"]}]});
  });
  it("atomically creates one local order per quote and rejects ownership and stale quotes",async()=>{
    fakeRemote();const q=await previewPurchase(db,token,actor.id,input),id=crypto.randomUUID();
    const [a,b]=await Promise.all([createPurchase(db,actor,actor.id,{id,quoteId:q.id}),createPurchase(db,actor,actor.id,{id,quoteId:q.id})]);
    expect(a.number).toMatch(/^SP\d{10}$/);expect(a.number).toBe(b.number);expect(a.id).toBe(b.id);expect(a.bills).toHaveLength(1);expect(JSON.stringify(a)).not.toMatch(/costCny|markup|seller|receiver/);
    await expect(createPurchase(db,actor,actor.id,{id:crypto.randomUUID(),quoteId:q.id})).rejects.toMatchObject({status:409});
    await expect(customerPurchase(db,"other-user",id)).rejects.toMatchObject({status:404});
    const stale=await previewPurchase(db,token,actor.id,input);await db.update(purchaseQuotes).set({expiresAt:0}).where(eq(purchaseQuotes.id,stale.id));
    await expect(createPurchase(db,actor,actor.id,{id:crypto.randomUUID(),quoteId:stale.id})).rejects.toMatchObject({status:409});
  });
  it("deduplicates concurrent customer payment with one balance change and ledger entry",async()=>{
    fakeRemote();const order=await makeOrder();
    const before=(await db.select().from(wallets).where(eq(wallets.userId,actor.id)))[0].balanceFen;
    await Promise.all([payPurchaseBill(db,actor,order.id),payPurchaseBill(db,actor,order.id)]);
    expect((await db.select().from(wallets).where(eq(wallets.userId,actor.id)))[0].balanceFen).toBe(before-order.bills[0].totalCents);
    expect(await db.select().from(walletTransactions).where(eq(walletTransactions.referenceId,order.id))).toHaveLength(1);
    await expect(payPurchaseBill(db,{id:"other-user",email:"other@example.invalid"},order.id)).rejects.toMatchObject({status:404});
  });
  it("rolls back the ledger and bill if balance writing fails",async()=>{
    fakeRemote();const order=await makeOrder();
    await db.run(sql.raw("CREATE TRIGGER purchase_test_fail BEFORE UPDATE ON wallets BEGIN SELECT RAISE(ABORT, 'test-only'); END"));
    try {await expect(payPurchaseBill(db,actor,order.id)).rejects.toThrow();}finally{await db.run(sql.raw("DROP TRIGGER purchase_test_fail"));}
    expect(await db.select().from(walletTransactions).where(eq(walletTransactions.referenceId,order.id))).toHaveLength(0);
    expect((await customerPurchase(db,actor.id,order.id)).bills[0].status).toBe("issued");
  });
  it("does not overdraw the wallet when different bills race for the same balance",async()=>{
    fakeRemote();const a=await makeOrder(),b=await makeOrder();
    await db.update(wallets).set({balanceFen:a.bills[0].totalCents}).where(eq(wallets.userId,actor.id));
    const results=await Promise.allSettled([payPurchaseBill(db,actor,a.id),payPurchaseBill(db,actor,b.id)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect((await db.select().from(wallets).where(eq(wallets.userId,actor.id)))[0].balanceFen).toBe(0);
    await db.update(wallets).set({balanceFen:100000}).where(eq(wallets.userId,actor.id));
  });
  it("creates Weidian without direct payment and sends only one real write under concurrency",async()=>{
    const fetcher=fakeRemote();const order=await makeOrder("weidian");await payPurchaseBill(db,actor,order.id);
    await Promise.allSettled([performPurchaseAction(db,token,actor,order.id,"create"),performPurchaseAction(db,token,actor,order.id,"create")]);
    const writes=fetcher.mock.calls.filter(([u])=>String(u).endsWith("/create"));expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({direct_pay:false,preview_id:"test-preview"});
    expect(new Headers(writes[0][1]?.headers).get("Idempotency-Key")).toBeTruthy();
    expect((await db.select().from(procurementRemote).where(eq(procurementRemote.orderId,order.id)))[0].state).toBe("created");
  });
  it("blocks uncovered costs and unpaid orders before remote creation",async()=>{
    fakeRemote();const order=await makeOrder();
    await expect(performPurchaseAction(db,token,actor,order.id,"create")).rejects.toMatchObject({status:409});
    await payPurchaseBill(db,actor,order.id);
    const changed=preview();changed.total.payment.amount+=1000;
    const fetcher=fakeRemote({"/v1/orders/preview":changed});
    await expect(performPurchaseAction(db,token,actor,order.id,"create")).rejects.toMatchObject({status:409});
    expect(fetcher.mock.calls.filter(([u])=>String(u).endsWith("/create"))).toHaveLength(0);
  });
  it("persists uncertain submissions and never silently retries a real create",async()=>{
    fakeRemote();const order=await makeOrder();await payPurchaseBill(db,actor,order.id);
    const fetcher=fakeRemote({"/v1/orders/create":new Error("timeout")});
    expect((await performPurchaseAction(db,token,actor,order.id,"create"))?.state).toBe("unknown");
    await performPurchaseAction(db,token,actor,order.id,"create");
    expect(fetcher.mock.calls.filter(([u])=>String(u).endsWith("/create"))).toHaveLength(1);
    expect((await db.select().from(purchaseAttempts).where(eq(purchaseAttempts.orderId,order.id)))[0].state).toBe("unknown");
  });
  it("does not treat pending payment as settled or debit the customer during remote operations",async()=>{
    fakeRemote();const order=await makeOrder();await payPurchaseBill(db,actor,order.id);await performPurchaseAction(db,token,actor,order.id,"create");
    const before=(await db.select().from(wallets).where(eq(wallets.userId,actor.id)))[0].balanceFen;
    const fetcher=fakeRemote({"/v1/orders/pay":{success:true,pending:true,payment_status:"pending"}});
    expect((await performPurchaseAction(db,token,actor,order.id,"pay"))?.paymentStatus).toBe("unknown");
    expect((await procurementOverviews(db,[order.id],true))[0]).toMatchObject({paidCostCnyCents:null,profitCnyCents:null});
    await performPurchaseAction(db,token,actor,order.id,"pay");await performPurchaseAction(db,token,actor,order.id,"sync");
    expect(fetcher.mock.calls.filter(([u])=>String(u).endsWith("/pay"))).toHaveLength(1);
    expect((await db.select().from(wallets).where(eq(wallets.userId,actor.id)))[0].balanceFen).toBe(before);
    expect((await db.select().from(procurementBills).where(eq(procurementBills.orderId,order.id)))[0].status).toBe("paid");
    const r=(await db.select().from(procurementRemote).where(eq(procurementRemote.orderId,order.id)))[0];
    fakeRemote({"/v1/orders/detail":{order:{order_id:r.remoteId,status:"WAIT_SELLER_SEND_GOODS",payment_status:"paid",total:money(2200)}}});
    expect((await performPurchaseAction(db,token,actor,order.id,"sync"))?.paymentStatus).toBe("paid");
    expect((await procurementOverviews(db,[order.id],true))[0]).toMatchObject({paidCostCnyCents:2200,profitCnyCents:200});
  });
  it("reconciles an uncertain create only after checking the remote identity and amount",async()=>{
    fakeRemote();const order=await makeOrder();await payPurchaseBill(db,actor,order.id);
    fakeRemote({"/v1/orders/create":new Error("timeout")});await performPurchaseAction(db,token,actor,order.id,"create");
    await db.update(purchaseAttempts).set({updatedAt:Date.now()-120000}).where(eq(purchaseAttempts.orderId,order.id));
    fakeRemote({"/v1/orders/detail":{order:{order_id:"remote-reconcile",out_order_id:"another-customer",total:money(2200)}}});
    await expect(reconcilePurchase(db,token,actor,order.id,"remote-reconcile","Confirmed with operator")).rejects.toMatchObject({status:409});
    const fetcher=fakeRemote({"/v1/orders/detail":{order:{order_id:"remote-reconcile",out_order_id:order.id,total:money(2200)}}});
    expect((await reconcilePurchase(db,token,actor,order.id,"remote-reconcile","Confirmed with operator"))?.state).toBe("created");
    expect(fetcher.mock.calls.every(([u])=>String(u).endsWith("/detail"))).toBe(true);
  });
  it("keeps remote money and writes behind staff permissions",()=>{
    expect(permissionFor("POST","/procurement/123/remote/pay")).toBe("payments.money");
    expect(permissionFor("POST","/procurement/123/remote/create")).toBe("procurement.write");
    expect(can("support","procurement.write")).toBe(false);expect(can("support","payments.money")).toBe(false);
  });
});


describe("manual purchase lifecycle", () => {
  const manualInput = () => ({ id: crypto.randomUUID(), sourcePlatform: "jd", sellerName: "Test seller", domesticShippingCents: 100, remark: "Review before buying", items: [{ productUrl: "https://item.jd.com/123.html", name: "Manual shirt", specification: "Blue M", unitPriceCents: 900, quantity: 2, imageUrl: null, remark: "" }] });
  const manualResult = (id: string) => ({ channel: "manual", success: true, order_id: `manual-${id}`, order_sn: "DG-test", external_order_id: id, source_platform: "jd", seller_name: "Test seller", status: "wait_payment", currency: "CNY", monetary_unit: "CNY_minor", total: { merchandise: money(2000), shipping: money(100), procurement_fee: money(100), payment: money(2200) }, order_list: [{ order_id: `manual-${id}`, shipping: money(100), lines: [{ item_ref: "0", sub_order_id: "sub-1", title: "Manual shirt", spec_title: "Blue M", quantity: 2, unit_price: money(1000), line_total: money(2000) }] }], failed_offers: [] });
  it("creates estimated bills idempotently without paying or exposing other customers", async () => {
    const fetcher = fakeRemote(), input = manualInput();
    await Promise.all([createManualPurchase(db, actor, input), createManualPurchase(db, actor, input)]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await customerPurchase(db, actor.id, input.id)).toMatchObject({ orderType: "manual", platform: "jd", stage:"awaiting_payment", bills: [{status:"issued",estimated:true,paidCents:0}] });
    await expect(createManualPurchase(db, actor, { ...input, sellerName: "Changed" })).rejects.toMatchObject({ status: 409 });
    await expect(createManualPurchase(db, { id: "other", email: "other@example.invalid" }, input)).rejects.toMatchObject({ status: 409 });
    await expect(customerPurchase(db, "other", input.id)).rejects.toMatchObject({ status: 404 });
  });
  it("uses warehouse amounts, creates one bill concurrently and preserves separate payment confirmation", async () => {
    const input = manualInput(); await createManualPurchase(db, actor, input); await payPurchaseBill(db,actor,input.id);
    const fetcher = fakeRemote({ "/v1/orders/manual": manualResult(input.id) });
    const submitted = await Promise.allSettled([1, 2].map(() => performPurchaseAction(db, token, actor, input.id, "create")));
    expect(submitted.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/manual"))).toHaveLength(1);
    let order = await customerPurchase(db, actor.id, input.id);
    expect(order.bills).toHaveLength(1); expect(order.bills[0]).toMatchObject({ status: "issued", goodsCents: 2200, serviceCents: 100, shippingCents: 100, totalCents: 2400 });
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/pay"))).toBe(false);
    await performPurchaseAction(db, token, actor, input.id, "sync");
    expect((await db.select().from(procurementRemote).where(eq(procurementRemote.orderId, input.id)))[0].state).toBe("created");
    await expect(performPurchaseAction(db, token, actor, input.id, "pay")).rejects.toMatchObject({ status: 409 });
    await payPurchaseBill(db, actor, input.id,{billVersion:order.bills[0].version,amountCents:order.bills[0].dueCents});
    await performPurchaseAction(db, token, actor, input.id, "pay", undefined, 2200);
    const paidRequest = fetcher.mock.calls.find(([url]) => String(url).endsWith("/pay"))!;
    expect(JSON.parse(String(paidRequest[1]?.body))).toEqual({ channel: "manual", order_id: `manual-${input.id}`, response_format: "standard" });
    expect(new Headers(paidRequest[1]?.headers).get("Idempotency-Key")).toBeTruthy();
    await performPurchaseAction(db, token, actor, input.id, "pay");
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/pay"))).toHaveLength(1);
    order = await customerPurchase(db, actor.id, input.id); expect(order.bills[0].status).toBe("paid");
  });
  it("requires explicit supplement confirmation, rolls back failures and charges the remainder exactly once", async () => {
    const input=manualInput();await createManualPurchase(db,actor,input);
    fakeRemote({"/v1/orders/manual":manualResult(input.id)});
    await expect(performPurchaseAction(db,token,actor,input.id,"create")).rejects.toMatchObject({status:409});
    const initial=await payPurchaseBill(db,actor,input.id);
    const firstPaid=initial.bills[0].paidCents;
    await performPurchaseAction(db,token,actor,input.id,"create");
    const bill=(await customerPurchase(db,actor.id,input.id)).bills[0];
    expect(bill).toMatchObject({status:"issued",estimated:false,paidCents:firstPaid,dueCents:bill.totalCents-firstPaid});
    expect(bill.dueCents).toBeGreaterThan(0);
    await expect(payPurchaseBill(db,actor,input.id)).rejects.toMatchObject({status:409});
    await expect(payPurchaseBill(db,actor,input.id,{billVersion:bill.version-1,amountCents:bill.dueCents})).rejects.toMatchObject({status:409});
    await expect(payPurchaseBill(db,actor,input.id,{billVersion:bill.version,amountCents:bill.totalCents})).rejects.toMatchObject({status:409});
    await expect(voidBill(db,actor,input.id,bill.id,{version:bill.version,reason:"Cannot void collected payment"})).rejects.toMatchObject({status:409});
    const confirmation={billVersion:bill.version,amountCents:bill.dueCents};
    const balance=(await db.select().from(wallets).where(eq(wallets.userId,actor.id)))[0].balanceFen;
    await db.update(wallets).set({balanceFen:0}).where(eq(wallets.userId,actor.id));
    await expect(payPurchaseBill(db,actor,input.id,confirmation)).rejects.toMatchObject({status:409});
    await db.update(wallets).set({balanceFen:balance}).where(eq(wallets.userId,actor.id));
    await db.run(sql.raw("CREATE TRIGGER supplement_failure BEFORE UPDATE ON wallets BEGIN SELECT RAISE(ABORT, 'test'); END"));
    try {await expect(payPurchaseBill(db,actor,input.id,confirmation)).rejects.toThrow();} finally {await db.run(sql.raw("DROP TRIGGER supplement_failure"));}
    expect((await customerPurchase(db,actor.id,input.id)).bills[0].paidCents).toBe(firstPaid);
    await Promise.allSettled([payPurchaseBill(db,actor,input.id,confirmation),payPurchaseBill(db,actor,input.id,confirmation)]);
    const paid=await payPurchaseBill(db,actor,input.id,confirmation);
    expect(paid.bills[0]).toMatchObject({status:"paid",dueCents:0,paidCents:bill.totalCents});
    expect((await db.select().from(wallets).where(eq(wallets.userId,actor.id)))[0].balanceFen).toBe(balance-bill.dueCents);
    const ledger=await db.select().from(walletTransactions).where(eq(walletTransactions.referenceId,input.id));
    expect(ledger).toHaveLength(2);
  });
  it("confirms manual costs using the original pricing snapshot, not today's markup", async () => {
    const input=manualInput();await createManualPurchase(db,actor,input);await payPurchaseBill(db,actor,input.id);
    const saved=await readProductPolicy(db);if(!saved)throw Error("missing policy");
    await saveProductPolicy(db,actor,{currency:saved.currency,markupBps:9000,fixedCnyCents:saved.fixedCnyCents,serviceBps:saved.serviceBps,serviceCnyCents:saved.serviceCnyCents,cnyPerCurrencyE4:saved.cnyPerCurrencyE4,version:saved.version});
    try {
      fakeRemote({"/v1/orders/manual":manualResult(input.id)});
      await performPurchaseAction(db,token,actor,input.id,"create");
      expect((await customerPurchase(db,actor.id,input.id)).bills[0].totalCents).toBe(2400);
    } finally {
      await saveProductPolicy(db,actor,{currency:saved.currency,markupBps:saved.markupBps,fixedCnyCents:saved.fixedCnyCents,serviceBps:saved.serviceBps,serviceCnyCents:saved.serviceCnyCents,cnyPerCurrencyE4:saved.cnyPerCurrencyE4,version:saved.version+1});
    }
  });
  it("retains an overpayment for review without charging or refunding automatically", async () => {
    const input=manualInput();input.items[0].unitPriceCents=1500;
    await createManualPurchase(db,actor,input);await payPurchaseBill(db,actor,input.id);
    const before=(await db.select().from(wallets).where(eq(wallets.userId,actor.id)))[0].balanceFen;
    fakeRemote({"/v1/orders/manual":manualResult(input.id)});
    await performPurchaseAction(db,token,actor,input.id,"create");
    const order=await customerPurchase(db,actor.id,input.id),bill=order.bills[0];
    expect(bill.status).toBe("paid");expect(bill.dueCents).toBe(0);expect(bill.overpaidCents).toBe(bill.paidCents-bill.totalCents);expect(bill.overpaidCents).toBeGreaterThan(0);
    await payPurchaseBill(db,actor,input.id);
    expect((await db.select().from(wallets).where(eq(wallets.userId,actor.id)))[0].balanceFen).toBe(before);
  });
  it("recovers an uncertain creation with the original business id, body and header key", async () => {
    const input = manualInput(); await createManualPurchase(db, actor, input); await payPurchaseBill(db,actor,input.id);
    const failed = fakeRemote({ "/v1/orders/manual": new Error("timeout") });
    await expect(performPurchaseAction(db, token, actor, input.id, "create")).rejects.toMatchObject({ code: "MANUAL_ORDER_UNCONFIRMED" });
    expect((await customerPurchase(db, actor.id, input.id)).bills).toHaveLength(1);
    await expect(performPurchaseAction(db, token, actor, input.id, "create")).rejects.toMatchObject({ status: 409 });
    await db.update(purchaseAttempts).set({ updatedAt: Date.now() - 61000 }).where(eq(purchaseAttempts.orderId, input.id));
    const retry = fakeRemote({ "/v1/orders/manual": manualResult(input.id) });
    await performPurchaseAction(db, token, actor, input.id, "create");
    expect(retry.mock.calls[0][1]?.body).toBe(failed.mock.calls[0][1]?.body);
    expect(new Headers(retry.mock.calls[0][1]?.headers).get("Idempotency-Key")).toBe(new Headers(failed.mock.calls[0][1]?.headers).get("Idempotency-Key"));
    expect((await customerPurchase(db, actor.id, input.id)).bills).toHaveLength(1);
  });
  it("recovers after a local commit failure without partially issuing a bill", async () => {
    const input = manualInput(); await createManualPurchase(db, actor, input); await payPurchaseBill(db,actor,input.id);
    const fetcher = fakeRemote({ "/v1/orders/manual": manualResult(input.id) });
    await db.run(sql.raw("CREATE TRIGGER manual_bill_failure BEFORE UPDATE ON procurement_bills BEGIN SELECT RAISE(ABORT, 'test interruption'); END"));
    try { await expect(performPurchaseAction(db, token, actor, input.id, "create")).rejects.toThrow(); }
    finally { await db.run(sql.raw("DROP TRIGGER manual_bill_failure")); }
    expect((await customerPurchase(db, actor.id, input.id)).bills).toHaveLength(1);
    expect((await db.select().from(procurementItems).where(eq(procurementItems.orderId, input.id)))[0].unitPriceCents).toBe(900);
    await db.update(purchaseAttempts).set({ updatedAt: Date.now() - 61000 }).where(eq(purchaseAttempts.orderId, input.id));
    await performPurchaseAction(db, token, actor, input.id, "create");
    expect((await customerPurchase(db, actor.id, input.id)).bills).toHaveLength(1);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("Idempotency-Key")).toBe(new Headers(fetcher.mock.calls[1][1]?.headers).get("Idempotency-Key"));
  });
  it("rejects unsafe declarations and incomplete or inconsistent warehouse amounts/mappings", async () => {
    const input = manualInput(), valid = manualPurchaseInput.parse(input);
    expect(manualPurchaseInput.safeParse({ ...input, sourcePlatform: "taobao" }).success).toBe(false);
    expect(manualPurchaseInput.safeParse({ ...input, items: [{ ...input.items[0], productUrl: "javascript:alert(1)" }] }).success).toBe(false);
    const bad = manualResult(input.id); bad.total.payment = money(1);
    expect(() => priceManualPurchase(valid, bad, policy)).toThrow();
    const mapping = manualResult(input.id); mapping.order_list[0].lines[0].item_ref = "wrong";
    expect(() => priceManualPurchase(valid, mapping, policy)).toThrow();
    await createManualPurchase(db, actor, input); await payPurchaseBill(db,actor,input.id); fakeRemote({ "/v1/orders/manual": bad });
    await expect(performPurchaseAction(db, token, actor, input.id, "create")).rejects.toMatchObject({ code: "MANUAL_ORDER_UNCONFIRMED" });
    expect((await customerPurchase(db, actor.id, input.id)).bills).toHaveLength(1);
  });
});


describe("customer purchase filtering and cancellation", () => {
  const cancel = {confirm:true,reason:"Ordered by mistake"};
  it("filters literal keywords, paginates and counts business stages only for the owner", async () => {
    fakeRemote();
    const a=await makeOrder(), b=await makeOrder(), marker=crypto.randomUUID();
    await db.update(procurementItems).set({name:`${marker} 100% cotton`}).where(eq(procurementItems.orderId,a.id));
    await db.update(procurementItems).set({name:`${marker} 100x cotton`}).where(eq(procurementItems.orderId,b.id));
    await payPurchaseBill(db,actor,b.id);
    const rows=await listCustomerPurchases(db,actor.id,{q:marker,status:"awaiting_payment",pageSize:1});
    expect(rows.items.map(o=>o.id)).toEqual([a.id]);
    expect(rows.total).toBe(1);
    expect(rows.counts).toMatchObject({all:2,awaiting_payment:1,pending:1,cancelled:0});
    expect(rows.items[0]).toMatchObject({status:"draft",stage:"awaiting_payment",canCancel:true});
    expect((await listCustomerPurchases(db,actor.id,{q:`${marker} 100%`})).total).toBe(1);
    expect((await listCustomerPurchases(db,actor.id,{q:a.number})).items[0].id).toBe(a.id);
    expect((await customerPurchaseCounts(db,"not-owner",{q:marker})).all).toBe(0);
    expect((await listCustomerPurchases(db,"not-owner",{q:marker})).total).toBe(0);
    expect((await listCustomerPurchases(db,actor.id,{q:marker,pageSize:1,page:3})).items).toEqual([]);
    await expect(listCustomerPurchases(db,actor.id,{status:"invalid"})).rejects.toMatchObject({status:400});
  });
  it("atomically cancels and voids unpaid bills, with idempotent concurrent retries and no wallet movement", async () => {
    const upstream=fakeRemote(), order=await makeOrder();upstream.mockClear();
    const before=(await db.select().from(wallets).where(eq(wallets.userId,actor.id)))[0].balanceFen;
    const results=await Promise.all([cancelCustomerPurchase(db,actor,order.id,cancel),cancelCustomerPurchase(db,actor,order.id,cancel)]);
    expect(results.every(o=>o.status==="cancelled"&&o.stage==="cancelled"&&!o.canCancel)).toBe(true);
    expect(results[0].bills.every(b=>b.status==="void")).toBe(true);
    expect((await db.select().from(auditLogs).where(eq(auditLogs.target,order.id))).filter(a=>a.action==="procurement.customer.cancel")).toHaveLength(1);
    expect((await db.select().from(wallets).where(eq(wallets.userId,actor.id)))[0].balanceFen).toBe(before);
    await expect(payPurchaseBill(db,actor,order.id)).rejects.toMatchObject({status:404});
    expect(upstream).not.toHaveBeenCalled();
  });
  it("rejects ownership bypass, missing confirmation, paid and submitting purchases", async () => {
    fakeRemote();const order=await makeOrder();
    await expect(cancelCustomerPurchase(db,{id:"other",email:"other@example.invalid"},order.id,cancel)).rejects.toMatchObject({status:404});
    await expect(cancelCustomerPurchase(db,actor,order.id,{reason:"cancel"})).rejects.toMatchObject({status:400});
    await payPurchaseBill(db,actor,order.id);
    expect((await customerPurchase(db,actor.id,order.id)).canCancel).toBe(false);
    await expect(cancelCustomerPurchase(db,actor,order.id,cancel)).rejects.toMatchObject({status:409});
    const submitted=await makeOrder();
    await db.update(procurementRemote).set({state:"creating"}).where(eq(procurementRemote.orderId,submitted.id));
    await expect(cancelCustomerPurchase(db,actor,submitted.id,cancel)).rejects.toMatchObject({status:409});
    expect((await customerPurchase(db,actor.id,submitted.id)).bills[0].status).toBe("issued");
  });
  it("rolls back cancellation and bill changes on failure, then safely retries", async () => {
    fakeRemote();const order=await makeOrder();
    await db.run(sql.raw("CREATE TRIGGER customer_cancel_failure BEFORE INSERT ON audit_logs WHEN NEW.action='procurement.customer.cancel' BEGIN SELECT RAISE(ABORT, 'test-only'); END"));
    try {await expect(cancelCustomerPurchase(db,actor,order.id,cancel)).rejects.toThrow();}
    finally {await db.run(sql.raw("DROP TRIGGER customer_cancel_failure"));}
    const unchanged=await customerPurchase(db,actor.id,order.id);
    expect(unchanged).toMatchObject({status:"draft",canCancel:true});
    expect(unchanged.bills[0].status).toBe("issued");
    expect((await cancelCustomerPurchase(db,actor,order.id,cancel)).status).toBe("cancelled");
  });
  it("cancels an unsubmitted manual request without creating an upstream order or bill", async () => {
    const upstream=fakeRemote();
    const form={id:crypto.randomUUID(),sourcePlatform:"jd",sellerName:"Test seller",domesticShippingCents:100,remark:"",items:[{productUrl:"https://item.jd.com/123.html",name:"Manual shirt",specification:"Blue M",unitPriceCents:900,quantity:2,imageUrl:null,remark:""}]};
    await createManualPurchase(db,actor,form);
    const result=await cancelCustomerPurchase(db,actor,form.id,cancel);
    expect(result).toMatchObject({status:"cancelled",stage:"cancelled",canCancel:false,bills:[{status:"void"}]});
    await expect(performPurchaseAction(db,token,actor,form.id,"create")).rejects.toMatchObject({status:409});
    expect(upstream).not.toHaveBeenCalled();
  });
  it("serializes cancellation against wallet payment without leaving a cancelled paid order", async () => {
    fakeRemote();const order=await makeOrder();
    const before=(await db.select().from(wallets).where(eq(wallets.userId,actor.id)))[0].balanceFen;
    await Promise.allSettled([cancelCustomerPurchase(db,actor,order.id,cancel),payPurchaseBill(db,actor,order.id)]);
    const after=await customerPurchase(db,actor.id,order.id);
    const balance=(await db.select().from(wallets).where(eq(wallets.userId,actor.id)))[0].balanceFen;
    if(after.status==="cancelled") {expect(after.bills[0].status).toBe("void");expect(balance).toBe(before);}
    else {expect(after.bills[0].status).toBe("paid");expect(balance).toBe(before-after.bills[0].totalCents);}
  });
});


describe("purchase remarks attachments and coupons",()=>{
  async function coupon(values:Partial<typeof marketingCoupons.$inferInsert>={}) {
    const id=crypto.randomUUID();
    const row={id,name:"Test coupon",code:`TEST${id.replaceAll("-","").slice(0,20)}`.toUpperCase(),enabled:true,from:"2000-01-01",to:"2099-12-31",version:1,requestHash:id,mutationId:id,createdBy:actor.id,createdAt:Date.now(),updatedAt:Date.now(),currency:"USD",kind:"fixed" as const,discountValue:100,minimumCents:0,usageLimit:10,...values};
    await db.insert(marketingCoupons).values(row);return row;
  }
  it("previews discounts without reserving, applies at create, preserves immutable bill and redeems once on payment",async()=>{
    const fetcher=fakeRemote(),c=await coupon();
    const quote=await previewPurchase(db,token,actor.id,{...input,couponCode:c.code.toLowerCase()});
    expect(quote).toMatchObject({couponCode:c.code,discountCents:100,totalCents:2300});
    expect((await db.select().from(purchaseCouponRedemptions).where(eq(purchaseCouponRedemptions.couponId,c.id)))).toHaveLength(0);
    expect(fetcher.mock.calls.every(([,init])=>!String(init?.body).includes("couponCode"))).toBe(true);
    const payload={id:crypto.randomUUID(),quoteId:quote.id,remark:"Please check the size"};
    const order=await createPurchase(db,actor,actor.id,payload);
    expect(order).toMatchObject({remark:payload.remark,coupon:{code:c.code,state:"reserved",discountCents:100}});
    expect(order.bills[0]).toMatchObject({discountCents:100,totalCents:2300});
    await db.update(marketingCoupons).set({enabled:false,version:2}).where(eq(marketingCoupons.id,c.id));
    expect((await createPurchase(db,actor,actor.id,payload)).id).toBe(order.id);
    await expect(createPurchase(db,actor,actor.id,{...payload,remark:"different"})).rejects.toMatchObject({status:409});
    await payPurchaseBill(db,actor,order.id);await payPurchaseBill(db,actor,order.id);
    expect((await customerPurchase(db,actor.id,order.id)).coupon?.state).toBe("redeemed");
    const txs=await db.select().from(walletTransactions).where(eq(walletTransactions.id,`purchase:${order.bills[0].id}`));
    expect(txs).toHaveLength(1);expect(txs[0].amountFen).toBe(-2300);
  });
  it("atomically reserves the last coupon slot and releases it on unpaid cancellation",async()=>{
    fakeRemote();const c=await coupon({usageLimit:1});
    const quotes=await Promise.all([previewPurchase(db,token,actor.id,input),previewPurchase(db,token,actor.id,input)]);
    const requests=quotes.map(q=>({id:crypto.randomUUID(),quoteId:q.id,couponCode:c.code}));
    const results=await Promise.allSettled(requests.map(r=>createPurchase(db,actor,actor.id,r)));
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    const orders=await db.select().from(procurementOrders);expect(orders.filter(o=>requests.some(r=>r.id===o.id))).toHaveLength(1);
    const winner=results.find(r=>r.status==="fulfilled")!;if(winner.status!=="fulfilled")throw Error("missing winner");
    await cancelCustomerPurchase(db,actor,winner.value.id,{confirm:true,reason:"changed mind"});
    expect((await customerPurchase(db,actor.id,winner.value.id)).coupon?.state).toBe("released");
    const loser=requests.find(r=>r.id!==winner.value.id)!;
    expect((await createPurchase(db,actor,actor.id,loser)).coupon?.state).toBe("reserved");
  });
  it("rejects invalid coupons and changed quote rules, and releases a voided bill",async()=>{
    fakeRemote();
    for(const values of [{enabled:false},{from:"2099-01-01"},{to:"2000-01-01"},{currency:"CNY"},{minimumCents:999999}]) {
      const c=await coupon(values);await expect(previewPurchase(db,token,actor.id,{...input,couponCode:c.code})).rejects.toMatchObject({code:"COUPON_UNAVAILABLE"});
    }
    const c=await coupon(),q=await previewPurchase(db,token,actor.id,{...input,couponCode:c.code});
    await db.update(marketingCoupons).set({version:2,discountValue:200}).where(eq(marketingCoupons.id,c.id));
    await expect(createPurchase(db,actor,actor.id,{id:crypto.randomUUID(),quoteId:q.id})).rejects.toMatchObject({code:"COUPON_UNAVAILABLE"});
    const fresh=await previewPurchase(db,token,actor.id,{...input,couponCode:c.code});
    const o=await createPurchase(db,actor,actor.id,{id:crypto.randomUUID(),quoteId:fresh.id});
    await voidBill(db,actor,o.id,o.bills[0].id,{version:1,reason:"reissue bill"});
    expect((await customerPurchase(db,actor.id,o.id)).coupon?.state).toBe("released");
  });
  it("rolls back coupon reservation with order creation failure and succeeds on retry",async()=>{
    fakeRemote();const c=await coupon({usageLimit:1}),q=await previewPurchase(db,token,actor.id,input),payload={id:crypto.randomUUID(),quoteId:q.id,couponCode:c.code};
    await db.run(sql.raw("CREATE TRIGGER coupon_create_failure BEFORE INSERT ON audit_logs WHEN NEW.action='procurement.remote.request' BEGIN SELECT RAISE(ABORT, 'test-only'); END"));
    try {await expect(createPurchase(db,actor,actor.id,payload)).rejects.toThrow();}finally{await db.run(sql.raw("DROP TRIGGER coupon_create_failure"));}
    expect((await db.select().from(purchaseCouponRedemptions).where(eq(purchaseCouponRedemptions.couponId,c.id)))).toHaveLength(0);
    expect((await db.select().from(procurementOrders).where(eq(procurementOrders.id,payload.id)))).toHaveLength(0);
    expect((await createPurchase(db,actor,actor.id,payload)).coupon?.state).toBe("reserved");
  });
  it("rolls back coupon redemption on payment failure and supports a fully discounted bill",async()=>{
    fakeRemote();const c=await coupon({kind:"percent",discountValue:10000}),q=await previewPurchase(db,token,actor.id,{...input,couponCode:c.code});
    const order=await createPurchase(db,actor,actor.id,{id:crypto.randomUUID(),quoteId:q.id});
    expect(order.bills[0]).toMatchObject({discountCents:2400,totalCents:0});
    const before=(await db.select().from(wallets).where(eq(wallets.userId,actor.id)))[0].balanceFen;
    await db.run(sql.raw("CREATE TRIGGER coupon_payment_failure BEFORE UPDATE ON wallets BEGIN SELECT RAISE(ABORT, 'test-only'); END"));
    try {await expect(payPurchaseBill(db,actor,order.id)).rejects.toThrow();}finally{await db.run(sql.raw("DROP TRIGGER coupon_payment_failure"));}
    const unpaid=await customerPurchase(db,actor.id,order.id);expect(unpaid.bills[0].status).toBe("issued");expect(unpaid.coupon?.state).toBe("reserved");
    expect((await db.select().from(walletTransactions).where(eq(walletTransactions.id,`purchase:${order.bills[0].id}`)))).toHaveLength(0);
    const paid=await payPurchaseBill(db,actor,order.id);expect(paid.bills[0].status).toBe("paid");expect(paid.coupon?.state).toBe("redeemed");
    expect((await db.select().from(wallets).where(eq(wallets.userId,actor.id)))[0].balanceFen).toBe(before);
  });
  it("copies owned uploaded images for permanent private access and keeps idempotent retries safe",async()=>{
    fakeRemote();const bucket=await mf.getR2Bucket("PHOTOS") as unknown as R2Bucket;
    const bytes=new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6V0AAAAASUVORK5CYII=","base64"));
    const image=await uploadClientImage(bucket,actor.id,new File([bytes],"test.png",{type:"image/png"}),true);
    const q=await previewPurchase(db,token,actor.id,input),payload={id:crypto.randomUUID(),quoteId:q.id,remark:"See photo",attachmentUploadIds:[image.id]};
    const results=await Promise.all([createPurchase(db,actor,actor.id,payload,bucket),createPurchase(db,actor,actor.id,payload,bucket)]);
    expect(results[0].attachments).toHaveLength(1);expect(results[1].attachments[0].id).toBe(results[0].attachments[0].id);
    const objects=await bucket.list({prefix:`purchase-attachments/${payload.id}/`});expect(objects.objects).toHaveLength(1);
    await bucket.delete(imageKey(actor.id,image.id));
    expect((await createPurchase(db,actor,actor.id,payload,bucket)).attachments).toHaveLength(1);
    const response=await readOrderAttachment(db,bucket,payload.id,results[0].attachments[0].id,actor.id);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(readOrderAttachment(db,bucket,payload.id,results[0].attachments[0].id,"other")).rejects.toMatchObject({status:404});
    expect((await orderDetail(db,payload.id)).attachments[0].url).toContain("/api/admin/procurement/");
    expect(permissionFor("GET",`/api/admin/procurement/${payload.id}/attachments/${results[0].attachments[0].id}`)).toBe("procurement.read");
    expect(JSON.stringify(results[0])).not.toMatch(/objectKey|sourceUploadId|requestHash/);
  });
  it("rejects foreign images, limits attachment inputs, and cleans copies when the DB write fails",async()=>{
    fakeRemote();const bucket=await mf.getR2Bucket("PHOTOS") as unknown as R2Bucket;
    const bytes=new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6V0AAAAASUVORK5CYII=","base64"));
    const image=await uploadClientImage(bucket,"foreign",new File([bytes],"test.png",{type:"image/png"}));
    const q=await previewPurchase(db,token,actor.id,input),payload={id:crypto.randomUUID(),quoteId:q.id,attachmentUploadIds:[image.id]};
    await expect(createPurchase(db,actor,actor.id,payload,bucket)).rejects.toMatchObject({status:404});
    await expect(createPurchase(db,actor,actor.id,{...payload,attachmentUploadIds:[image.id,image.id]},bucket)).rejects.toMatchObject({status:400});
    const own=await uploadClientImage(bucket,actor.id,new File([bytes],"test.png",{type:"image/png"}));payload.attachmentUploadIds=[own.id];
    await db.run(sql.raw("CREATE TRIGGER attachment_create_failure BEFORE INSERT ON purchase_order_details BEGIN SELECT RAISE(ABORT, 'test-only'); END"));
    try {await expect(createPurchase(db,actor,actor.id,payload,bucket)).rejects.toThrow();}finally{await db.run(sql.raw("DROP TRIGGER attachment_create_failure"));}
    expect((await bucket.list({prefix:`purchase-attachments/${payload.id}/`})).objects).toHaveLength(0);
    expect((await db.select().from(purchaseOrderAttachments).where(eq(purchaseOrderAttachments.orderId,payload.id)))).toHaveLength(0);
  });
  it("stores instructions by product and SKU, survives concurrent retries, and returns private per-item images", async () => {
    const upstream = preview();
    upstream.sellers[0].lines.push({...upstream.sellers[0].lines[0],offer_id:"product-2"});
    upstream.total={merchandise:money(4000),shipping:money(100),payment:money(4200)};
    fakeRemote({"/v1/orders/preview":upstream});
    const bucket=await mf.getR2Bucket("PHOTOS") as unknown as R2Bucket;
    const bytes=new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6V0AAAAASUVORK5CYII=","base64"));
    const image=await uploadClientImage(bucket,actor.id,new File([bytes],"sku.png",{type:"image/png"}),true);
    const q=await previewPurchase(db,token,actor.id,{...input,lines:[...input.lines,{...input.lines[0],id:"product-2"}]});
    const payload={id:crypto.randomUUID(),quoteId:q.id,items:[
      {productId:"product-2",skuId:"sku-1",remark:"Second item",attachmentUploadIds:[]},
      {productId:"product-1",skuId:"sku-1",remark:"First item",attachmentUploadIds:[image.id]},
    ]};
    const results=await Promise.all([createPurchase(db,actor,actor.id,payload,bucket),createPurchase(db,actor,actor.id,payload,bucket)]);
    const order=results[0];
    expect(order.items.map(i=>i.remark)).toEqual(["First item","Second item"]);
    expect(order.items[0].attachments).toHaveLength(1);expect(order.items[1].attachments).toEqual([]);
    expect(order.remark).toBe("");expect(order.attachments).toEqual([]);
    expect(results[1].items).toEqual(order.items);
    expect((await db.select().from(purchaseItemDetails).where(eq(purchaseItemDetails.orderId,order.id)))).toHaveLength(2);
    expect((await bucket.list({prefix:`purchase-attachments/${order.id}/`})).objects).toHaveLength(1);
    await bucket.delete(imageKey(actor.id,image.id));
    expect((await readOrderAttachment(db,bucket,order.id,order.items[0].attachments[0].id,actor.id)).status).toBe(200);
    await expect(readOrderAttachment(db,bucket,order.id,order.items[0].attachments[0].id,"other")).rejects.toMatchObject({status:404});
    const admin=await orderDetail(db,order.id);
    expect(admin.items[0].remark).toBe("First item");expect(admin.items[0].attachments[0].url).toContain("/api/admin/procurement/");
    expect((await listCustomerPurchases(db,actor.id,{q:order.number})).items[0].items[0].remark).toBe("First item");
    await expect(createPurchase(db,actor,actor.id,{...payload,items:payload.items.map(i=>({...i,remark:"Changed"}))},bucket)).rejects.toMatchObject({status:409});
    expect(JSON.stringify(order)).not.toMatch(/objectKey|requestHash|itemOptions/);
  });
  it("rejects foreign or duplicate SKU options and limits per-item attachments before writes", async () => {
    fakeRemote();const q=await previewPurchase(db,token,actor.id,input);
    const payload={id:crypto.randomUUID(),quoteId:q.id};
    const item={productId:"product-1",skuId:"sku-1",remark:"note"};
    for(const items of [[{...item,productId:"unknown"}],[{...item,skuId:"unknown"}],[item,item]]) {
      await expect(createPurchase(db,actor,actor.id,{...payload,items})).rejects.toMatchObject({status:400});
    }
    const bucket=await mf.getR2Bucket("PHOTOS") as unknown as R2Bucket;
    const bytes=new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6V0AAAAASUVORK5CYII=","base64"));
    const image=await uploadClientImage(bucket,"foreign",new File([bytes],"foreign.png",{type:"image/png"}));
    await expect(createPurchase(db,actor,actor.id,{...payload,items:[{...item,attachmentUploadIds:[image.id]}]},bucket)).rejects.toMatchObject({status:404});
    await expect(createPurchase(db,actor,actor.id,{...payload,items:[{...item,attachmentUploadIds:Array(6).fill(image.id)}]},bucket)).rejects.toMatchObject({status:400});
    expect((await db.select().from(procurementOrders).where(eq(procurementOrders.id,payload.id)))).toHaveLength(0);
  });
  it("rolls back SKU details and image copies on failure and allows a clean retry", async () => {
    fakeRemote();const bucket=await mf.getR2Bucket("PHOTOS") as unknown as R2Bucket;
    const bytes=new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6V0AAAAASUVORK5CYII=","base64"));
    const image=await uploadClientImage(bucket,actor.id,new File([bytes],"sku.png",{type:"image/png"}));
    const q=await previewPurchase(db,token,actor.id,input);
    const payload={id:crypto.randomUUID(),quoteId:q.id,items:[{productId:"product-1",skuId:"sku-1",remark:"SKU note",attachmentUploadIds:[image.id]}]};
    const foreign=await uploadClientImage(bucket,"other",new File([bytes],"foreign.png",{type:"image/png"}));
    await expect(createPurchase(db,actor,actor.id,{...payload,attachmentUploadIds:[image.id],items:[{...payload.items[0],attachmentUploadIds:[foreign.id]}]},bucket)).rejects.toMatchObject({status:404});
    expect((await bucket.list({prefix:`purchase-attachments/${payload.id}/`})).objects).toHaveLength(0);
    await db.run(sql.raw("CREATE TRIGGER sku_details_failure BEFORE INSERT ON purchase_item_details BEGIN SELECT RAISE(ABORT, 'test-only'); END"));
    try { await expect(createPurchase(db,actor,actor.id,payload,bucket)).rejects.toThrow(); } finally { await db.run(sql.raw("DROP TRIGGER sku_details_failure")); }
    expect((await db.select().from(procurementOrders).where(eq(procurementOrders.id,payload.id)))).toHaveLength(0);
    expect((await db.select().from(purchaseItemDetails).where(eq(purchaseItemDetails.orderId,payload.id)))).toHaveLength(0);
    expect((await bucket.list({prefix:`purchase-attachments/${payload.id}/`})).objects).toHaveLength(0);
    const saved=await createPurchase(db,actor,actor.id,payload,bucket);
    expect(saved.items[0].remark).toBe("SKU note");expect(saved.items[0].attachments).toHaveLength(1);
  });

});


it("projects customer prices, wallet receipts and owned parcel/shipment tracking without exposing costs", async () => {
  fakeRemote();
  const order = await makeOrder();
  await db.update(wallets).set({balanceFen:100000}).where(eq(wallets.userId,actor.id));
  const unpaid = await customerPurchase(db,actor.id,order.id);
  expect(unpaid.items[0].unitPriceCents).not.toBeNull();
  expect(unpaid.items[0].referencePrice.currency).toBe("CNY");
  expect(unpaid.bills[0].paymentMethod).toBeNull();
  const paid = await payPurchaseBill(db,actor,order.id);
  expect(paid.bills[0]).toMatchObject({paymentMethod:"wallet",paymentMethods:["wallet"]});
  expect(paid.bills[0].paymentHistory[0]).toMatchObject({method:"wallet",amountCents:paid.bills[0].totalCents,status:"paid"});
  const now=Date.now(), packageId=crypto.randomUUID(), shipmentId=crypto.randomUUID(), foreignId=crypto.randomUUID();
  await db.insert(packages).values({id:packageId,userId:actor.id,publicId:packageId,domesticTrackingNumber:packageId,courier:"Test courier",packageStatus:"RECEIVED",exceptionStatus:"NONE",vasStatus:"NONE",lockStatus:"AVAILABLE",disposition:"NONE",receivedAt:now,createdAt:now,updatedAt:now});
  await db.insert(procurementItemPackages).values({id:crypto.randomUUID(),orderId:order.id,itemId:unpaid.items[0].id,packageId,allocatedQuantity:1,receivedQuantity:1,createdAt:now,updatedAt:now});
  await db.insert(shipments).values([{id:shipmentId,userId:actor.id,publicId:shipmentId,status:"IN_TRANSIT",trackingNumber:"INTERNATIONAL-TEST",createdAt:now,updatedAt:now},{id:foreignId,userId:"other-user",publicId:foreignId,status:"IN_TRANSIT",trackingNumber:"PRIVATE-TRACKING",createdAt:now,updatedAt:now}]);
  await db.insert(shipmentPackages).values([{shipmentId,packageId},{shipmentId:foreignId,packageId}]);
  const photoId = crypto.randomUUID(), url = "https://cdn.example.invalid/purchase-receipt.jpg";
  await db.insert(packagePhotos).values({ id: photoId, packageId, remoteUrl: url, type: "PACKAGE_RECEIPT_IMAGE", label: "Receipt", createdAt: now });
  const result=await customerPurchase(db,actor.id,order.id,{});
  expect(result.logistics.domesticParcels[0].photos).toEqual([{ id: photoId, type: "PACKAGE_RECEIPT_IMAGE", label: "Receipt", url, createdAt: new Date(now).toISOString() }]);
  expect(result.logistics.domesticParcels[0]).toMatchObject({trackingNumber:packageId,carrier:"Test courier",items:[{itemId:unpaid.items[0].id,quantity:1,receivedQuantity:1}]});
  expect(result.logistics.domesticParcels[0].warehouseEvents).toHaveLength(1);
  expect(result.logistics.internationalShipments).toHaveLength(1);
  expect(result.logistics.internationalShipments[0]).toMatchObject({trackingNumber:"INTERNATIONAL-TEST",trackingStatus:"unavailable",events:[]});
  expect(JSON.stringify(result)).not.toMatch(/costCnyCents|markupBps|requestHash|PRIVATE-TRACKING/);
  await expect(customerPurchase(db,"other-user",order.id,{})).rejects.toThrow();
  await db.update(procurementRemote).set({lastResult:JSON.stringify({order:{domestic_parcels:[{tracking_number:"BEFORE-WAREHOUSE-LINK"}]}})}).where(eq(procurementRemote.orderId,order.id));
  expect((await customerPurchase(db,actor.id,order.id,{})).logistics.domesticParcels.find(p=>p.trackingNumber==="BEFORE-WAREHOUSE-LINK")).toMatchObject({packageId:null, photos:[]});
});


it("queries only owned procurement logistics, matches parcel numbers and supports Weidian/manual inputs", async () => {
  fakeRemote(); const order=await makeOrder();
  const remoteId="domestic-test", number="DOMESTIC-ONE", second="DOMESTIC-TWO";
  await db.update(procurementRemote).set({remoteId,lastResult:JSON.stringify({order:{domestic_parcels:[{tracking_number:number},{tracking_number:second}]}})}).where(eq(procurementRemote.orderId,order.id));
  const response={tracking:{channel:"1688",order_id:remoteId,packages:[{tracking_number:number,status_label:"In transit",carrier:{name:"Carrier"},steps:[{provider_event:"scan"}]},{tracking_number:second,status_label:"Pending",carrier:{name:"Carrier"},steps:[]}]},internalSecret:"must not leak"};
  let fetcher=fakeRemote({"/v1/orders/logistics/trace":response});
  const env={HIOBUY_API_TOKEN:"test-key"};
  await expect(domesticPurchaseTracking(db,"someone-else",order.id,env)).rejects.toThrow("not found");
  await expect(domesticPurchaseTracking(db,actor.id,order.id,env,"foreign-number")).rejects.toThrow("not linked");
  expect(fetcher).not.toHaveBeenCalled();
  const result=await domesticPurchaseTracking(db,actor.id,order.id,env);
  expect(result).toMatchObject({trackingStatus:"available",packages:[{trackingNumber:number,events:[{provider_event:"scan"}]},{trackingNumber:second,events:[]}]});
  expect(JSON.stringify(result)).not.toContain("internalSecret");
  const detail=await customerPurchase(db,actor.id,order.id,env);
  expect(detail.logistics.domesticParcels.find(p=>p.trackingNumber===number)?.events).toEqual([{provider_event:"scan"}]);
  expect(detail.logistics.domesticParcels.find(p=>p.trackingNumber===second)?.events).toEqual([]);
  await db.update(procurementRemote).set({channel:"weidian"}).where(eq(procurementRemote.orderId,order.id));
  fetcher=fakeRemote({"/v1/orders/logistics/trace":{tracking:{...response.tracking,channel:"weidian"}}});
  const filtered=await domesticPurchaseTracking(db,actor.id,order.id,env,number);
  expect(filtered.packages).toHaveLength(1);
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({channel:"weidian",order_id:remoteId,response_format:"standard",express_no:number});
  await db.update(procurementRemote).set({channel:"manual"}).where(eq(procurementRemote.orderId,order.id));
  fetcher=fakeRemote({"/v1/orders/logistics/trace":{tracking:{...response.tracking,channel:"manual"}}});
  await domesticPurchaseTracking(db,actor.id,order.id,env);
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({channel:"manual",order_id:remoteId,response_format:"standard"});
  expect(parseDomesticTracking(response,"manual",remoteId)).toBeNull();
  fakeRemote({"/v1/orders/logistics/trace":new Error("network failure")});
  expect(await domesticPurchaseTracking(db,actor.id,order.id,env)).toMatchObject({trackingStatus:"unavailable",packages:[]});
  expect(parseDomesticTracking({tracking:{...response.tracking,packages:[{steps:["invalid"]}]}},"1688",remoteId)).toBeNull();
});
