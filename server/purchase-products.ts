import { publicProductContent } from "./product-content";
import { productDisplayPrice, productDisplayTiers } from "../src/domain/product-display-pricing";
import type { ProductPolicy } from "../src/domain/product-pricing";
import { cartSnapshot } from "../src/domain/cart-display";
import { record, stringId } from "../src/domain/purchase";
import { callProcurement, requireProcurementResult } from "./services/hiobuy/procurement";
import { AppError } from "./errors";
const textMap=(value:unknown)=>Object.fromEntries(Object.entries(record(value)).filter(([,v])=>typeof v==="string"));
const imageUrl=(value:unknown)=>typeof value==="string"&&/^https?:\/\//.test(value)?value:null;
/** Explicit customer DTO: marketplace costs, seller/account metadata and upstream payloads never pass through. */
export function publicProduct(value:unknown,channel?:string){
  const p=record(value),id=stringId(p.id);
  if(!id)throw new AppError("INVALID_PRODUCT","HioBuy returned a product without a usable id.",502);
  return {id,channel:typeof p.channel==="string"?p.channel:channel??"",title:typeof p.title==="string"?{original:p.title}:textMap(p.title),
    sourceUrl:imageUrl(p.source_url),images:[...new Set([...(Array.isArray(p.images)?p.images.map(i=>imageUrl(typeof i==="string"?i:record(i).url)):[]),imageUrl(p.image)].filter((i):i is string=>!!i))],
    variants:Array.isArray(p.variants)?p.variants.map(v=>{const r=record(v);return {skuId:stringId(r.sku_id),stock:typeof r.stock==="number"?r.stock:null,image:imageUrl(r.image),attributes:Array.isArray(r.attributes)?r.attributes.map(a=>textMap(a)):[]};}).filter(v=>v.skuId):[],
    pricing:"preview_required" as const,
  };
}
export function publicProductDetail(value: unknown, channel: string, policy: ProductPolicy | null) {
  const raw = record(value), product = publicProduct(value, channel);
  const variants = Array.isArray(raw.variants) ? raw.variants.map(record) : [];
  return { ...product, ...publicProductContent(raw), price: productDisplayPrice(raw.price, policy), priceTiers: productDisplayTiers(raw.price_tiers, policy),
    minOrderQuantity: Number.isSafeInteger(raw.min_order_quantity) && Number(raw.min_order_quantity) > 0 ? Number(raw.min_order_quantity) : null,
    orderQuantityMultiple: Number.isSafeInteger(raw.order_quantity_multiple) && Number(raw.order_quantity_multiple) > 0 ? Number(raw.order_quantity_multiple) : null,
    variants: product.variants.map(variant => ({ ...variant, price: productDisplayPrice(variants.find(v => stringId(v.sku_id) === variant.skuId)?.price, policy) })),
  };
}
export async function queryProducts(token:string,operation:"search"|"detail"|"parse"|"sellerSearch"|"imageSearch",input:Record<string,unknown>, policy:ProductPolicy|null=null){
  const data=requireProcurementResult(await callProcurement(token,operation,{...input,response_format:"standard"}));
  if(operation==="detail"||operation==="parse")return {product:publicProductDetail(data.product,String(input.channel??""),policy)};
  if(!Array.isArray(data.items))throw new AppError("INVALID_PRODUCTS","HioBuy returned an unsupported search response.",502);
  const items = data.items.map(value => {
    const item = publicProduct(value, String(input.channel));
    return { ...item, price: productDisplayPrice(record(value).price, policy) };
  });
  return {items,page:Number.isSafeInteger(data.page)&&Number(data.page)>0?data.page:input.page,pageSize:Number.isSafeInteger(data.page_size)&&Number(data.page_size)>0?data.page_size:input.page_size,total:typeof data.total==="number"?data.total:null};
}

/** Customer-safe product plus private pricing metadata, persisted only inside cart storage. */
export async function cartProduct(token: string, channel: string, productId: string) {
  const data = requireProcurementResult(await callProcurement(token, "detail", { channel, id: productId, language: "en", response_format: "standard" }));
  const product = publicProduct(data.product, channel);
  if (product.id !== productId || product.channel !== channel) throw new AppError("INVALID_PRODUCT", "Product identity does not match.", 502);
  return { ...product, _cartDisplay: cartSnapshot(data.product) };
}
