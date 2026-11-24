import { listCart } from "./cart-view";
import { checkoutCart, readCartCheckout } from "./cart-checkout";
import { favoriteStatus, subscribeShop, shopSubscriptionStatus, listShopSubscriptions, unsubscribeShop, recordBrowsingHistory, listBrowsingHistory, removeBrowsingHistory } from "./shopping-activity";
import { addManualCart, updateManualCart, removeManualCart, checkoutManualCart } from "./manual-cart";
import { resolveImageSearchUpload } from "./image-search-upload";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv } from "./index";
import { imageSearchInput, sellerSearchInput } from "../src/domain/shopping";
import { parseInput } from "./operations-input";
import { purchaseToken } from "./purchase-http";
import { readProductDisplayPolicy } from "./product-billing";
import { queryProducts } from "./purchase-products";
import { countCart, addCartItem, addFavorite, listShopping, previewCart, removeShopping, updateCartItem } from "./shopping";
import { allowQuoteAttempt } from "./quote-limit";
import { AppError } from "./errors";

export const shoppingClient = new Hono<AppEnv>();

shoppingClient.use("*", async (c, next) => {
  if (!/^\/api\/(cart(?:\/|$)|favorites(?:\/|$)|shop-subscriptions(?:\/|$)|browsing-history(?:\/|$)|products\/(seller\/search|search-by-image)$)/.test(c.req.path)) return next();
  if (c.req.method !== "GET" && c.req.method !== "DELETE" && !allowQuoteAttempt(`shopping:${c.get("user").id}`, 20, 60000))
    throw new AppError("RATE_LIMITED", "Too many shopping requests. Try again shortly.", 429);
  await bodyLimit({ maxSize: c.req.path.endsWith("/search-by-image") ? 4_200_000 : c.req.path.startsWith("/api/cart/manual-items") ? 262_144 : 16_384, onError: () => { throw new AppError("PAYLOAD_TOO_LARGE", "Request body is too large.", 413); } })(c, next);
});
const token = (c: import("hono").Context<AppEnv>) => purchaseToken(c.get("db"), c.env.HIOBUY_API_TOKEN);
const ok = (c: import("hono").Context<AppEnv>, data: unknown) => c.json({ data, requestId: c.get("requestId") });
shoppingClient.post("/products/seller/search", async c => {
  const input = parseInput(sellerSearchInput, await c.req.json());
  return ok(c, await queryProducts(await token(c), "sellerSearch", input, await readProductDisplayPolicy(c.get("db"))));
});
shoppingClient.post("/products/search-by-image", async c => {
  const input = await resolveImageSearchUpload(c.env.PHOTOS, c.get("user").id, parseInput(imageSearchInput, await c.req.json()), {secret:c.env.BETTER_AUTH_SECRET,appUrl:c.env.APP_URL ?? ""});
  return ok(c, await queryProducts(await token(c), "imageSearch", input, await readProductDisplayPolicy(c.get("db"))));
});
shoppingClient.get("/cart/count", async c => ok(c, await countCart(c.get("db"), c.get("user").id)));
shoppingClient.get("/cart", async c => ok(c, await listCart(c.get("db"), c.get("user").id, () => token(c))));
shoppingClient.post("/cart/items", async c => ok(c, await addCartItem(c.get("db"), await token(c), c.get("user").id, await c.req.json())));
shoppingClient.patch("/cart/items/:id", async c => ok(c, await updateCartItem(c.get("db"), await token(c), c.get("user").id, c.req.param("id"), await c.req.json())));
shoppingClient.delete("/cart/items/:id", async c => ok(c, await removeShopping(c.get("db"), c.get("user").id, "cart", c.req.param("id"))));
shoppingClient.post("/cart/preview", async c => ok(c, await previewCart(c.get("db"), () => token(c), c.get("user").id, await c.req.json())));
shoppingClient.post("/cart/checkout", async c => ok(c, await checkoutCart(c.get("db"), c.get("user"), await c.req.json())));
shoppingClient.get("/cart/checkouts/:id", async c => ok(c, await readCartCheckout(c.get("db"), c.get("user").id, c.req.param("id"))));
shoppingClient.get("/favorites", async c => ok(c, await listShopping(c.get("db"), c.get("user").id, "favorites", c.req.query())));
shoppingClient.post("/favorites", async c => ok(c, await addFavorite(c.get("db"), await token(c), c.get("user").id, await c.req.json())));
shoppingClient.delete("/favorites/:id", async c => ok(c, await removeShopping(c.get("db"), c.get("user").id, "favorites", c.req.param("id"))));

shoppingClient.post("/cart/manual-items", async c => ok(c, await addManualCart(c.get("db"), c.get("user").id, await c.req.json())));
shoppingClient.put("/cart/manual-items/:id", async c => ok(c, await updateManualCart(c.get("db"), c.get("user").id, c.req.param("id"), await c.req.json())));
shoppingClient.delete("/cart/manual-items/:id", async c => ok(c, await removeManualCart(c.get("db"), c.get("user").id, c.req.param("id"), await c.req.json())));
shoppingClient.post("/cart/manual-items/:id/checkout", async c => ok(c, await checkoutManualCart(c.get("db"), c.get("user"), c.req.param("id"), await c.req.json())));

shoppingClient.get("/favorites/status", async c => ok(c, await favoriteStatus(c.get("db"),c.get("user").id,c.req.query())));
shoppingClient.get("/shop-subscriptions", async c => ok(c, await listShopSubscriptions(c.get("db"),c.get("user").id,c.req.query())));
shoppingClient.get("/shop-subscriptions/status", async c => ok(c, await shopSubscriptionStatus(c.get("db"),c.get("user").id,c.req.query())));
shoppingClient.post("/shop-subscriptions", async c => ok(c, await subscribeShop(c.get("db"),c.get("user").id,await c.req.json())));
shoppingClient.delete("/shop-subscriptions/:id", async c => ok(c, await unsubscribeShop(c.get("db"),c.get("user").id,c.req.param("id"))));
shoppingClient.get("/browsing-history", async c => ok(c, await listBrowsingHistory(c.get("db"),c.get("user").id,c.req.query())));
shoppingClient.post("/browsing-history", async c => ok(c, await recordBrowsingHistory(c.get("db"),await token(c),c.get("user").id,await c.req.json())));
shoppingClient.delete("/browsing-history/:id", async c => ok(c, await removeBrowsingHistory(c.get("db"),c.get("user").id,c.req.param("id"))));
shoppingClient.delete("/browsing-history", async c => ok(c, await removeBrowsingHistory(c.get("db"),c.get("user").id)));
