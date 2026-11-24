# Client Shop Subscriptions and Browsing History

All endpoints follow Session/Bearer authentication and the `{data,requestId}` protocol; they operate only on the current customer, and clients cannot pass `customerId`. No changes were made to the client frontend.

| Method & Path | Purpose |
| --- | --- |
| `GET /api/favorites/status?channel=1688&productId=123` | Single-item favorite status, returning `isFavorited`, `favoriteId`, `createdAt`; returns `false`/`null` if not favorited, without calling HioBuy |
| `POST /api/shop-subscriptions` | Subscribe to a shop: `channel` and `shopId` required; `name`, `url`, and `imageUrl` optional |
| `GET /api/shop-subscriptions` | Paginated list, optional `channel` |
| `GET /api/shop-subscriptions/status?channel=1688&shopId=abc` | Query `isSubscribed`, `subscriptionId`, `createdAt` |
| `DELETE /api/shop-subscriptions/:id` | Cancel own subscription by subscription record UUID; idempotent on repeat deletes |
| `POST /api/browsing-history` | Explicitly report a view with `channel` and `productId`; server queries and validates HioBuy details before saving a safe snapshot |
| `GET /api/browsing-history` | Paginated recent views, optional `channel` |
| `DELETE /api/browsing-history/:id` | Delete a single own record |
| `DELETE /api/browsing-history` | Clear all own records across all platforms |

Pagination `page`/`pageSize` defaults to `1`/`20`, up to 50 items; ordered descending by time and ID, with filtering and pagination performed at the database level. Supports `1688`, `taobao`, and `weidian`.

Shop subscriptions are local follow records and do not send notifications or enable new-arrival pushes. `shopId` for 1688 uses `seller_open_id` from the existing shop products endpoint, and Weidian uses `shop_id`; Taobao can store a client-known shop ID, though the existing shop products query still does not support Taobao. Names and HTTPS URLs are client display metadata only—they do not imply platform verification, and the server does not fetch the URLs; duplicate subscriptions return the existing record without overwriting display metadata. A unique constraint on customer + platform + shop guarantees concurrent deduplication.

Browsing history is not written automatically by normal product detail queries; standalone clients should call the recording endpoint when actually entering a detail page. Uniqueness is enforced on customer + platform + product; repeated reports refresh the last-viewed timestamp without incrementing a view count; timestamps are assigned by the server, and client-supplied timestamps, prices, or product snapshots are not accepted. Insertion and cleanup commit in the same D1 batch, retaining the latest 200 entries across all platforms per customer and automatically pruning older records. The list is a historical display snapshot and is not used for quoting or stock checks; checkout still uses existing preview and payment flows. Deleting or clearing does not affect favorites, subscriptions, cart, or other customers.

Migration `0023` creates `shop_subscriptions`, `browsing_history`, and their unique and query indexes. Apply the migration before deployment without modifying existing migrations. Writes reuse the shopping endpoints' per-Worker-isolate rate limit of 20 requests per minute per user and 16 KiB request body limit (not a global rate limit). All endpoints are registered in OpenAPI.
