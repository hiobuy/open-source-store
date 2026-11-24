# Announcement Publishing and Reading

The admin console at `/admin/announcements` supports creating, editing, searching, paginating, pinning, and status filtering. Owners and admins can publish announcements, while customer support has read-only access; announcement management is not available in the demo admin console.

Each announcement requires a title and body in at least one language, supporting English, Simplified Chinese, Traditional Chinese, and Russian. The body is plain text with preserved line breaks and does not execute HTML. Image uploads, scheduled publishing, push notifications, and read tracking are not included.

- Draft: Visible only in the admin console.
- Published: Visible in client lists and detail views.
- Unpublished: Retained in admin records and hidden from clients; can be published again.

The first publish records the publication timestamp, and republishing preserves the original publication timestamp. Pinned announcements appear first, ordered in reverse chronological order by publication time within the same group. Editing uses a version number to prevent overwriting another user's updates; on conflict, close the editor modal, refresh the list, and reopen it. Successful writes and audit records are committed in the same database batch.

The legacy customer portal's announcements page (`/app/announcements`) was removed along with the old portal; the storefront homepage reads announcements via the following public APIs. No login is required for these public APIs:

- `GET /api/announcements?page=1&pageSize=20&q=keyword&locale=zh-CN`: Returns `{ items, total, page, pageSize }`, up to 50 items per page, searching across all filled-in translations.
- `GET /api/announcements/:id?locale=zh-CN`: Returns a published announcement; draft, unpublished, and non-existent IDs all return 404.

The API uses the standard `{ data, requestId }` wrapper. Language fallback follows the order: requested locale, site default locale, English, and any existing translation; the actually used `locale` is returned. Cross-origin browser access follows the client domain allowlist. The API does not return drafts, version numbers, or internal audit fields.

The admin endpoints are `GET /api/admin/announcements` and `PUT /api/admin/announcements/:id`, verifying `announcements.read` and `announcements.write` respectively. Creation uses a UUID and `version: 0`, while updates submit the version obtained when reading; duplicate creations and stale versions return 409.

Before deployment, apply migration `0020_clever_nightcrawler.sql`, which creates the announcements table and list indexes without modifying existing business data.
