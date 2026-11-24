import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "./db/client";
import { procurementItems, procurementRemote, purchaseQuotes, auditLogs } from "./db/schema";
import { queryProducts, publicProduct } from "./purchase-products";
import { AppError } from "./errors";
import { record, purchasePreviewInput } from "../src/domain/purchase";

const webUrl=(v:unknown)=>typeof v==="string"&&/^https?:\/\//i.test(v)?v:null;
export function productMedia(product:ReturnType<typeof publicProduct>,skuId:string){
  const variant=product.variants.find(v=>v.skuId===skuId);
  return {productId:product.id,skuId,sourceUrl:webUrl(product.sourceUrl),imageUrl:webUrl(variant?.image)??webUrl(product.images[0]),
    variantLabel:variant?.attributes.map(a=>a.value_zh??a.value_original??a.value).filter(v=>typeof v==="string"&&v).join(" / ")??""};
}
export function readProductMedia(raw:string|null|undefined){
  let p:Record<string,unknown>={};try{p=record(JSON.parse(raw??"{}"));}catch{}
  return {productId:typeof p.productId==="string"?p.productId:null,sourceUrl:webUrl(p.sourceUrl),imageUrl:webUrl(p.imageUrl),variantLabel:typeof p.variantLabel==="string"?p.variantLabel:null};
}
/** Explicit backfill of absent media only. Never changes historical names, costs, bills or remote orders. */
export async function fillPurchaseMedia(db:Database,token:string,actor:{id:string;email:string},orderId:string){
  const [remote]=await db.select().from(procurementRemote).where(eq(procurementRemote.orderId,orderId));
  if(!remote)throw new AppError("MEDIA_SOURCE_REQUIRED","This order has no verified product source.",409);
  const [quote]=await db.select().from(purchaseQuotes).where(eq(purchaseQuotes.id,remote.quoteId));
  const request=record(JSON.parse(quote.request));
  const input=purchasePreviewInput.parse({channel:request.channel,lines:request.lines});
  const items=await db.select().from(procurementItems).where(eq(procurementItems.orderId,orderId)).orderBy(asc(procurementItems.position));
  const products=new Map<string,ReturnType<typeof publicProduct>>();let updated=0;
  for(const item of items){
    if(readProductMedia(item.productSnapshot).imageUrl)continue;
    const line=input.lines[item.position];if(!line||line.spec_id!==item.sku)continue;
    let product=products.get(line.id);
    if(!product){const response=await queryProducts(token,"detail",{channel:input.channel,id:line.id,language:"en"});product=response.product;if(!product||product.id!==line.id||product.channel!==input.channel)throw new AppError("INVALID_PRODUCT","Product identity did not match.",502);products.set(line.id,product);}
    const media=productMedia(product,line.spec_id);if(!media.imageUrl)continue;
    const result=await db.update(procurementItems).set({productSnapshot:JSON.stringify(media)}).where(and(eq(procurementItems.id,item.id),item.productSnapshot===null?sql`${procurementItems.productSnapshot} IS NULL`:eq(procurementItems.productSnapshot,item.productSnapshot))).returning({id:procurementItems.id});
    updated+=result.length;
  }
  if(updated)await db.insert(auditLogs).values({id:crypto.randomUUID(),actorId:actor.id,actorEmail:actor.email,action:"procurement.media.fill",target:orderId,detail:JSON.stringify({updated}),createdAt:Date.now()});
  return {updated};
}
