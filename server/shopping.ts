import { cartItemView, cartPolicy } from "./cart-view";
import { cartProduct } from "./purchase-products";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./db/client";
import { cartItems, productFavorites } from "./db/schema";
import { cartInput, cartUpdateInput, favoriteInput, shoppingPageInput } from "../src/domain/shopping";
import { parseInput } from "./operations-input";
import { queryProducts, type publicProduct } from "./purchase-products";
import { AppError } from "./errors";

type Product = ReturnType<typeof publicProduct>;
const owned = (table: typeof cartItems | typeof productFavorites, customerId: string, id: string) => and(eq(table.customerId, customerId), eq(table.id, id), table === cartItems ? eq(cartItems.type,"standard") : undefined);
const view = <T extends { customerId: string; product: string }>(row: T) => {
  const { customerId: _owner, product, ...rest } = row;
  const { _cartDisplay, ...publicSnapshot } = JSON.parse(product);
  return { ...rest, product: publicSnapshot as Product };
};
export async function verifiedProduct(token: string, channel: string, productId: string) {
  const result = await queryProducts(token, "detail", { channel, id: productId, language: "en" });
  if (!("product" in result) || !result.product || result.product.id !== productId || result.product.channel !== channel)
    throw new AppError("INVALID_PRODUCT", "Product identity does not match.", 502);
  const { id, channel: verifiedChannel, title, sourceUrl, images, variants, pricing } = result.product;
  return { id, channel: verifiedChannel, title, sourceUrl, images, variants: variants.map(({price: _price, ...variant}) => variant), pricing };
}
function checkSku(product: Product, skuId: string, quantity: number) {
  const sku = product.variants.find(v => v.skuId === skuId);
  if (!sku || (sku.stock !== null && sku.stock < quantity))
    throw new AppError("PRODUCT_UNAVAILABLE", "Select an available SKU and quantity.", 409);
}
export async function addCartItem(db: Database, token: string, customerId: string, raw: unknown) {
  const input = parseInput(cartInput, raw), product = await cartProduct(token, input.channel, input.productId);
  checkSku(product, input.skuId, input.quantity);
  const now = Date.now();
  // Repeating add never increments or overwrites a concurrently edited quantity.
  await db.insert(cartItems).values({ ...input, id: crypto.randomUUID(), customerId, product: JSON.stringify(product), createdAt: now, updatedAt: now }).onConflictDoNothing();
  const [row] = await db.select().from(cartItems).where(and(eq(cartItems.type,"standard"), eq(cartItems.customerId, customerId), eq(cartItems.channel, input.channel), eq(cartItems.productId, input.productId), eq(cartItems.skuId, input.skuId)));
  if (!row) throw new AppError("CART_CHANGED", "Cart changed; reload before retrying.", 409);
  return cartItemView(row, await cartPolicy(db));
}
export async function updateCartItem(db: Database, token: string, customerId: string, id: string, raw: unknown) {
  const input = parseInput(cartUpdateInput, raw);
  const [row] = await db.select().from(cartItems).where(owned(cartItems, customerId, id));
  if (!row) throw new AppError("NOT_FOUND", "Cart item not found.", 404);
  if (row.version !== input.version) throw new AppError("CART_CHANGED", "Reload the cart before editing.", 409);
  const product = await cartProduct(token, row.channel, row.productId);
  checkSku(product, row.skuId, input.quantity);
  const [updated] = await db.update(cartItems).set({ quantity: input.quantity, product: JSON.stringify(product), version: sql`${cartItems.version} + 1`, updatedAt: Date.now() })
    .where(and(owned(cartItems, customerId, id), eq(cartItems.version, input.version))).returning();
  if (!updated) throw new AppError("CART_CHANGED", "Reload the cart before editing.", 409);
  return cartItemView(updated, await cartPolicy(db));
}
export async function addFavorite(db: Database, token: string, customerId: string, raw: unknown) {
  const input = parseInput(favoriteInput, raw), product = await verifiedProduct(token, input.channel, input.productId), now = Date.now();
  await db.insert(productFavorites).values({ ...input, id: crypto.randomUUID(), customerId, product: JSON.stringify(product), createdAt: now, updatedAt: now }).onConflictDoNothing();
  const [row] = await db.select().from(productFavorites).where(and(eq(productFavorites.customerId, customerId), eq(productFavorites.channel, input.channel), eq(productFavorites.productId, input.productId)));
  if (!row) throw new AppError("FAVORITES_CHANGED", "Favorites changed; reload before retrying.", 409);
  return view(row);
}
export async function listShopping(db: Database, customerId: string, kind: "cart" | "favorites", raw: unknown) {
  const { page, pageSize } = parseInput(shoppingPageInput, raw), table = kind === "cart" ? cartItems : productFavorites;
  const where = and(eq(table.customerId, customerId), kind === "cart" ? eq(cartItems.type,"standard") : undefined);
  const rows = await db.select().from(table).where(where).orderBy(desc(table.updatedAt), desc(table.id)).limit(pageSize).offset((page - 1) * pageSize);
  const [total] = await db.select({ value: count() }).from(table).where(where);
  return { items: rows.map(view), total: total.value, page, pageSize };
}
export async function removeShopping(db: Database, customerId: string, kind: "cart" | "favorites", id: string) {
  const table = kind === "cart" ? cartItems : productFavorites;
  await db.delete(table).where(owned(table, customerId, id));
  return { ok: true };
}
export { previewCart } from "./cart-checkout";

/** Lightweight badge counts; no product snapshots, pricing or upstream requests. */
export async function countCart(db: Database, customerId: string) {
  const [result] = await db.select({ total: count(), totalQuantity: sql<number>`COALESCE(SUM(${cartItems.quantity}), 0)`.mapWith(Number) })
    .from(cartItems).where(and(eq(cartItems.customerId, customerId), inArray(cartItems.state,["draft","submitting"])));
  return result;
}
