import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth';
export const shopSubscriptions=sqliteTable('shop_subscriptions',{
 id:text('id').primaryKey(),customerId:text('customer_id').notNull().references(()=>user.id,{onDelete:'cascade'}),
 channel:text('channel').notNull(),shopId:text('shop_id').notNull(),name:text('name'),url:text('url'),imageUrl:text('image_url'),createdAt:integer('created_at').notNull(),
},t=>[uniqueIndex('shop_subscription_identity').on(t.customerId,t.channel,t.shopId),index('shop_subscription_recent').on(t.customerId,t.createdAt,t.id)]);
export const browsingHistory=sqliteTable('browsing_history',{
 id:text('id').primaryKey(),customerId:text('customer_id').notNull().references(()=>user.id,{onDelete:'cascade'}),
 channel:text('channel').notNull(),productId:text('product_id').notNull(),product:text('product').notNull(),
 createdAt:integer('created_at').notNull(),lastViewedAt:integer('last_viewed_at').notNull(),
},t=>[uniqueIndex('browsing_history_identity').on(t.customerId,t.channel,t.productId),index('browsing_history_recent').on(t.customerId,t.lastViewedAt,t.id)]);
