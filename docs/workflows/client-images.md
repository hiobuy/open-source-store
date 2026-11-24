# Client Private Image Uploads

- `POST /api/uploads/images`: Authenticated request submitting a single `file` field via `multipart/form-data`. Supports Session Cookie or Client Bearer Token, with CORS following the client origin allowlist.
- `GET /api/uploads/images/:id`: Only the uploader can read the image; other users receive 404. Bearer clients fetch the Blob with the `Authorization` header first, then render it.
- `DELETE /api/uploads/images/:id`: Deletes objects only within the user's own namespace; repeated deletes succeed idempotently.

Returns `{data:{id,filename,url,contentType,size,width,height,createdAt,temporary,expiresAt},requestId}`. The URL is a relative path requiring authorization; the filename uses a UTC timestamp (with milliseconds) and a random UUID, such as `20261112T090000123Z_<uuid>.png`, ignoring the user's original filename. R2 paths are isolated per user and do not accept user-specified storage paths.

Limits are 3 MiB per image, 20 megapixels, 10,000 px max per side, PNG/JPEG; maximum request body size is 3 MiB + 64 KiB. The server validates MIME type, file signature, and dimensions, rejecting SVG, HTML, spoofed types, and oversized requests; this check is not a full image decode or virus scan and does not strip EXIF data. Responses include `nosniff`, sandbox CSP, and `private/no-store`.

Each user is limited to 10 uploads per minute using the existing per-Worker-isolate rate limiter, not a global quota. Regular images are retained until deleted by the user; temporary images are cleaned up according to the expiration policy below, and long-term storage quotas are not yet implemented. The bucket must not be configured as public, as that would bypass API read authorization. The private URL returned on upload cannot be used directly as `image_url`; when using `uploadId`, the server generates a restricted signed URL for Weidian, while 1688/Taobao still use Base64.

This feature only adds client APIs without modifying the client frontend or requiring database migrations. OpenAPI already documents multipart uploads and binary reads.

## Image Search via `uploadId`

After a successful upload, call `POST /api/products/search-by-image`, for example:

```json
{"channel":"1688","uploadId":"20261112T090000123Z_12345678-1234-4123-8123-123456789abc.png","page":1,"page_size":20,"language":"zh"}
```

`uploadId` is the `id` from the upload response and is mutually exclusive with `image_id`, `image_url`, and `image_base64` (exactly one must be provided). Both endpoints require authentication and must use the same customer identity. 1688, Taobao, and Weidian all support `uploadId`; Weidian does not accept Base64 submitted directly by the client.

The server reads the object from the current customer's R2 namespace and re-verifies `ownerId`, size, MIME type, file signature, and dimensions. Missing, deleted, or unauthorized objects return 404 without calling upstream. After passing validation, 1688/Taobao converts it to Base64 and Weidian generates a read-only signed URL to pass to the existing HioBuy adapter, without sending the client token or R2 storage path. Existing query parameters, response DTOs, authentication, and rate limiting remain unchanged; reading does not delete the image, so subsequent retries can reuse it. Image content is sent to HioBuy when the user initiates a search.


## Temporary Images (Search Scenarios)

The multipart form adds an optional `temporary` field that only accepts the single string `"true"` or `"false"`, defaulting to `false` when omitted. Passing `temporary=true` is recommended for search images. The server enforces a fixed 24-hour TTL and does not accept client-specified expiration times; it returns `temporary:true` and `expiresAt` (Unix milliseconds). Regular uploads return `false`/`null`.

Temporary filenames add a `tmp_` prefix while still containing the UTC timestamp and random UUID. Temporary objects are stored separately under `client-temp-images/<UTC-time>/<user>/<filename>` and are not mixed with regular images. The returned `id` can be used directly as `uploadId`; after expiration, both reads and image searches return 404 even if the object has not yet been physically deleted. The client should re-upload before searching. Ownership checks, file validation, authentication, and rate limits remain unchanged.

The existing per-minute Cron adds a cleanup task that scans up to 5 pages of 200 temporary objects per run, deleting only expired images matching the temporary path rules. Objects are ordered by creation time, starting from the oldest; backlogs may delay physical deletion but do not extend access validity. Deletion is idempotent, R2 failures log a fixed error and are retried by subsequent Cron runs; local Vite does not guarantee automatic production Cron execution, so `scheduled` can be triggered manually for verification. No new database migrations or additional Cron configurations are needed—it activates upon deployment. Existing images without the `tmp_` prefix are kept as regular images and are not retroactively deleted.


## Weidian Signed Image Fetch

When `channel=weidian` is paired with `uploadId`, the server performs the same ownership and image checks, then generates `APP_URL/api/uploads/image-access/:token` and submits it to HioBuy via `image_url`. The client does not need to receive or generate the signed link, and the search response structure remains unchanged.

The link's HMAC-SHA256 signature binds purpose, user, image ID, issued-at timestamp, and expiration timestamp using the existing server-side `BETTER_AUTH_SECRET`; rotating this secret invalidates unexpired links. Expiration is the earlier of 5 minutes after issuance or the temporary image's expiration time. Regular images also receive a 5-minute link. Signed reads require no login and only allow `GET` for a single image; anyone holding the link can read the image while it is valid, so treat it as a short-lived credential and do not log or share the full URL. Invalid signatures, expiration, deletion, or ownership mismatches uniformly return 404. Responses include `private/no-store`, `nosniff`, `sandbox`, and `no-referrer`; no object listing or write permissions are exposed, and the R2 bucket stays private.

External image fetch URLs are constructed exclusively from the trusted server-side HTTPS `APP_URL` and never from the request `Host` header. A missing or non-HTTPS configuration returns 503; local HTTP development environments cannot allow HioBuy to fetch images, so real end-to-end verification requires deploying to a public HTTPS staging site. The signed read route is mounted before the authentication middleware, and OpenAPI marks it as requiring no session but requiring a valid signature.
