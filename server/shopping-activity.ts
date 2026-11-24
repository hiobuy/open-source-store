import { and,count,desc,eq,sql } from 'drizzle-orm';
import type { Database } from './db/client';
import { browsingHistory,productFavorites,shopSubscriptions } from './db/schema';
import { favoriteInput } from '../src/domain/shopping';
import { activityId,browsingHistoryInput,HISTORY_LIMIT,shopIdentityInput,shopSubscriptionInput,shoppingActivityPage } from '../src/domain/shopping-activity';
import { parseInput } from './operations-input';
import { verifiedProduct } from './shopping';
import { AppError } from './errors';
const shopView=({customerId:_owner,...row}:typeof shopSubscriptions.$inferSelect)=>row;
const historyView=({customerId:_owner,product,...row}:typeof browsingHistory.$inferSelect)=>({...row,product:JSON.parse(product)});
export async function favoriteStatus(db:Database,customerId:string,raw:unknown){
 const input=parseInput(favoriteInput,raw);
 const [row]=await db.select({id:productFavorites.id,createdAt:productFavorites.createdAt}).from(productFavorites).where(and(eq(productFavorites.customerId,customerId),eq(productFavorites.channel,input.channel),eq(productFavorites.productId,input.productId)));
 return {...input,isFavorited:!!row,favoriteId:row?.id??null,createdAt:row?.createdAt??null};
}
export async function subscribeShop(db:Database,customerId:string,raw:unknown){
 const input=parseInput(shopSubscriptionInput,raw);
 await db.insert(shopSubscriptions).values({...input,id:crypto.randomUUID(),customerId,createdAt:Date.now()}).onConflictDoNothing();
 const [row]=await db.select().from(shopSubscriptions).where(and(eq(shopSubscriptions.customerId,customerId),eq(shopSubscriptions.channel,input.channel),eq(shopSubscriptions.shopId,input.shopId)));
 if(!row)throw new AppError('SUBSCRIPTION_CHANGED','Subscription changed; retry the request.',409);
 return shopView(row);
}
export async function shopSubscriptionStatus(db:Database,customerId:string,raw:unknown){
 const input=parseInput(shopIdentityInput,raw);
 const [row]=await db.select({id:shopSubscriptions.id,createdAt:shopSubscriptions.createdAt}).from(shopSubscriptions).where(and(eq(shopSubscriptions.customerId,customerId),eq(shopSubscriptions.channel,input.channel),eq(shopSubscriptions.shopId,input.shopId)));
 return {...input,isSubscribed:!!row,subscriptionId:row?.id??null,createdAt:row?.createdAt??null};
}
export async function listShopSubscriptions(db:Database,customerId:string,raw:unknown){
 const {page,pageSize,channel}=parseInput(shoppingActivityPage,raw);
 const where=and(eq(shopSubscriptions.customerId,customerId),channel?eq(shopSubscriptions.channel,channel):undefined);
 const rows=await db.select().from(shopSubscriptions).where(where).orderBy(desc(shopSubscriptions.createdAt),desc(shopSubscriptions.id)).limit(pageSize).offset((page-1)*pageSize);
 const [total]=await db.select({value:count()}).from(shopSubscriptions).where(where);
 return {items:rows.map(shopView),total:total.value,page,pageSize};
}
export async function unsubscribeShop(db:Database,customerId:string,id:string){
 parseInput(activityId,id);await db.delete(shopSubscriptions).where(and(eq(shopSubscriptions.customerId,customerId),eq(shopSubscriptions.id,id)));return {ok:true};
}
export async function recordBrowsingHistory(db:Database,token:string,customerId:string,raw:unknown){
 const input=parseInput(browsingHistoryInput,raw),product=await verifiedProduct(token,input.channel,input.productId),now=Date.now();
 // One D1 transaction preserves deduplication and the per-customer retention bound, including concurrent reports.
 await db.batch([
  db.insert(browsingHistory).values({...input,id:crypto.randomUUID(),customerId,product:JSON.stringify(product),createdAt:now,lastViewedAt:now}).onConflictDoUpdate({target:[browsingHistory.customerId,browsingHistory.channel,browsingHistory.productId],set:{product:JSON.stringify(product),lastViewedAt:now},setWhere:sql`${browsingHistory.lastViewedAt} <= ${now}`}),
  db.delete(browsingHistory).where(sql`${browsingHistory.customerId}=${customerId} AND ${browsingHistory.id} IN (SELECT id FROM browsing_history WHERE customer_id=${customerId} ORDER BY last_viewed_at DESC,id DESC LIMIT -1 OFFSET ${HISTORY_LIMIT})`),
 ]);
 const [row]=await db.select().from(browsingHistory).where(and(eq(browsingHistory.customerId,customerId),eq(browsingHistory.channel,input.channel),eq(browsingHistory.productId,input.productId)));
 if(!row)throw new AppError('HISTORY_CHANGED','Browsing history changed; retry the request.',409);
 return historyView(row);
}
export async function listBrowsingHistory(db:Database,customerId:string,raw:unknown){
 const {page,pageSize,channel}=parseInput(shoppingActivityPage,raw);
 const where=and(eq(browsingHistory.customerId,customerId),channel?eq(browsingHistory.channel,channel):undefined);
 const rows=await db.select().from(browsingHistory).where(where).orderBy(desc(browsingHistory.lastViewedAt),desc(browsingHistory.id)).limit(pageSize).offset((page-1)*pageSize);
 const [total]=await db.select({value:count()}).from(browsingHistory).where(where);
 return {items:rows.map(historyView),total:total.value,page,pageSize};
}
export async function removeBrowsingHistory(db:Database,customerId:string,id?:string){
 if(id!==undefined)parseInput(activityId,id);
 await db.delete(browsingHistory).where(and(eq(browsingHistory.customerId,customerId),id!==undefined?eq(browsingHistory.id,id):undefined));return {ok:true};
}
