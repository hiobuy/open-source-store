import { manualCartView } from "./manual-cart";
import { allowQuoteAttempt } from "./quote-limit";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "./db/client";
import { cartItems } from "./db/schema";
import { readProductDisplayPolicy as cartPolicy } from "./product-billing";
export { cartPolicy };
import { cartDisplay, type CartSnapshot } from "../src/domain/cart-display";
import type { ProductPolicy } from "../src/domain/product-pricing";
import { cartProduct } from "./purchase-products";

type Row = typeof cartItems.$inferSelect;
export function cartItemView(row: Row, policy: ProductPolicy | null) {
  const {id,type,channel,productId,skuId,quantity,version,createdAt,updatedAt,product:saved} = row;
  const item={id,type,channel,productId,skuId,quantity,version,createdAt,updatedAt};
  const { _cartDisplay, ...product } = JSON.parse(saved);
  return { ...item, product, ...cartDisplay(_cartDisplay as CartSnapshot | undefined, row.skuId, row.quantity, policy) };
}
/** All owned rows, no pagination. Only legacy snapshots trigger upstream reads. */
export async function listCart(db: Database, customerId: string, getToken: () => Promise<string>) {
  const read = () => db.select().from(cartItems).where(and(eq(cartItems.customerId, customerId),eq(cartItems.type,"standard"))).orderBy(desc(cartItems.updatedAt), desc(cartItems.id));
  let rows = await read();
  const legacy = rows.filter(row => !JSON.parse(row.product)._cartDisplay);
  if (legacy.length) {
    let token: string | null = null;
    try { token = await getToken(); } catch { /* Still return the saved cart when integration is unavailable. */ }
    if (token) {
      const keys = [...new Set(legacy.map(row => JSON.stringify([row.channel, row.productId])))];
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, keys.length) }, async () => {
        while (next < keys.length) {
          const key = keys[next++], [channel, productId] = JSON.parse(key);
          let product;
          if (!allowQuoteAttempt(`cart-hydration:${customerId}`, 20, 60_000)) break;
          try { product = await cartProduct(token!, channel, productId); } catch { continue; }
          for (const row of legacy.filter(row => row.channel === channel && row.productId === productId)) {
            await db.update(cartItems).set({ product: JSON.stringify(product) }).where(and(eq(cartItems.id, row.id), eq(cartItems.type,"standard"), eq(cartItems.customerId, customerId), eq(cartItems.version, row.version), eq(cartItems.product, row.product)));
          }
        }
      }));
      rows = await read();
    }
  }
  const policy = await cartPolicy(db);
  type Item = ReturnType<typeof cartItemView>;
  const groups = new Map<string, { type:"standard"; key: string; channel: string; shop: Item["shop"]; items: Item[]; totalQuantity: number; subtotalCents: number | null; priceComplete: boolean }>();
  for (const row of rows) {
    const item = cartItemView(row, policy);
    // Unknown sellers must not be merged or mistaken for a single checkout seller.
    const key = JSON.stringify([row.channel, item.shop.id ? "shop" : "item", item.shop.id ?? row.id]);
    const group = groups.get(key) ?? { type:"standard" as const, key, channel: row.channel, shop: item.shop, items: [], totalQuantity: 0, subtotalCents: 0, priceComplete: true };
    group.items.push(item); group.totalQuantity += item.quantity;
    group.subtotalCents = group.subtotalCents === null || item.subtotalCents === null ? null : group.subtotalCents + item.subtotalCents;
    if (group.subtotalCents !== null && !Number.isSafeInteger(group.subtotalCents)) group.subtotalCents = null;
    group.priceComplete = group.subtotalCents !== null;
    groups.set(key, group);
  }
  const grouped = [...groups.values()];
  const subtotal = grouped.every(group => group.priceComplete) ? grouped.reduce((n, group) => n + group.subtotalCents!, 0) : null;
  const subtotalCents = subtotal !== null && Number.isSafeInteger(subtotal) ? subtotal : null;
  const manualRows=await db.select().from(cartItems).where(and(eq(cartItems.customerId,customerId),eq(cartItems.type,"manual"),inArray(cartItems.state,["draft","submitting"]))).orderBy(desc(cartItems.updatedAt),desc(cartItems.id));
  const manualGroups=manualRows.map(row=>({
    type:"manual" as const, key:JSON.stringify([row.channel,"manual",row.id]), channel:row.channel,
    shop:{id:null,name:manualCartView(row).form.sellerName,url:null},
    items:[{...manualCartView(row),quantity:row.quantity,unitPriceCents:null,subtotalCents:null,priceComplete:false}],
    totalQuantity:row.quantity,subtotalCents:null,priceComplete:false,
  }));
  const updated=new Map([...rows,...manualRows].map(row=>[`${row.type}:${row.id}`,row.updatedAt]));
  const groupedAll=[...grouped,...manualGroups].sort((a,b)=>{
    const time=(group: typeof a)=>Math.max(...group.items.map(item=>updated.get(`${group.type}:${item.id}`)??0));
    return time(b)-time(a)||a.key.localeCompare(b.key);
  });
  return { standardTotal:rows.length, manualTotal:manualRows.length, currency: "CNY" as const, displayOnly: true as const, groups: groupedAll, total: rows.length+manualRows.length,
    totalQuantity: rows.reduce((n, row) => n + row.quantity, 0)+manualRows.reduce((n,row)=>n+row.quantity,0), standardSubtotalCents:subtotalCents, subtotalCents:manualRows.length?null:subtotalCents, priceComplete:!manualRows.length && subtotalCents !== null };
}
