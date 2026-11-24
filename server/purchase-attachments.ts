import { and, eq } from "drizzle-orm";
import type { Database } from "./db/client";
import { purchaseOrderAttachments, purchaseItemDetails, purchaseOrderDetails, purchaseCouponRedemptions, procurementOrders } from "./db/schema";
import { assertClientImageActive, imageKey, inspectClientImage, IMAGE_MAX_BYTES } from "./client-images";
import { AppError } from "./errors";

type Attachment = typeof purchaseOrderAttachments.$inferInsert;
export async function discardOrderAttachments(bucket: R2Bucket | undefined, attachments: Attachment[]) {
  if (bucket && attachments.length) {
    try { await bucket.delete(attachments.map(a => a.objectKey)); } catch { console.error("Purchase attachment cleanup failed"); }
  }
}
export async function prepareOrderAttachments(bucket: R2Bucket | undefined, customerId: string, orderId: string, uploadIds: string[], itemId: string | null = null) {
  if (uploadIds.length && !bucket) throw new AppError("STORAGE_UNAVAILABLE", "Image storage is unavailable.", 503);
  const attachments: Attachment[] = [];
  try {
    for (const uploadId of uploadIds) {
      assertClientImageActive(uploadId);
      const original = await bucket!.get(imageKey(customerId, uploadId));
      if (!original || original.customMetadata?.ownerId !== customerId) throw new AppError("NOT_FOUND", "Attachment image not found.", 404);
      if (original.size > IMAGE_MAX_BYTES) throw new AppError("INVALID_IMAGE", "Attachment is too large.", 400);
      const bytes = new Uint8Array(await original.arrayBuffer());
      const info = inspectClientImage(bytes, original.httpMetadata?.contentType ?? "");
      const id = crypto.randomUUID(), objectKey = `purchase-attachments/${orderId}/${id}`;
      const attachment = { id, orderId, itemId, sourceUploadId: uploadId, objectKey, contentType: info.contentType, size: bytes.length, createdAt: Date.now() };
      attachments.push(attachment);
      await bucket!.put(objectKey, bytes, { httpMetadata: { contentType: info.contentType } });
    }
    return attachments;
  } catch (error) { await discardOrderAttachments(bucket, attachments); throw error; }
}
export async function purchaseOptionsView(db: Database, orderId: string, admin = false) {
  const [details, attachments, coupons, itemDetails] = await Promise.all([
    db.select().from(purchaseOrderDetails).where(eq(purchaseOrderDetails.orderId, orderId)),
    db.select({ id: purchaseOrderAttachments.id, itemId: purchaseOrderAttachments.itemId, filename: purchaseOrderAttachments.sourceUploadId, contentType: purchaseOrderAttachments.contentType, size: purchaseOrderAttachments.size, createdAt: purchaseOrderAttachments.createdAt }).from(purchaseOrderAttachments).where(eq(purchaseOrderAttachments.orderId, orderId)),
    db.select({ code: purchaseCouponRedemptions.code, currency: purchaseCouponRedemptions.currency, discountCents: purchaseCouponRedemptions.discountCents, state: purchaseCouponRedemptions.state }).from(purchaseCouponRedemptions).where(eq(purchaseCouponRedemptions.orderId, orderId)),
    db.select().from(purchaseItemDetails).where(eq(purchaseItemDetails.orderId, orderId)),
  ]);
  const view = (a: typeof attachments[number]) => { const {itemId: _itemId, ...fields} = a; return {...fields, url: `${admin ? "/api/admin/procurement" : "/api/purchase-orders"}/${orderId}/attachments/${a.id}`}; };
  const itemOptions = Object.fromEntries(itemDetails.map(item => [item.itemId, {remark: item.remark, attachments: attachments.filter(a => a.itemId === item.itemId).map(view)}]));
  return { itemOptions, remark: details[0]?.remark ?? "", attachments: attachments.filter(a => !a.itemId).map(view), coupon: coupons[0] ?? null };
}
export async function readOrderAttachment(db: Database, bucket: R2Bucket | undefined, orderId: string, attachmentId: string, customerId?: string) {
  const [row] = await db.select({ key: purchaseOrderAttachments.objectKey, contentType: purchaseOrderAttachments.contentType }).from(purchaseOrderAttachments)
    .innerJoin(procurementOrders, eq(procurementOrders.id, purchaseOrderAttachments.orderId))
    .where(and(eq(purchaseOrderAttachments.orderId, orderId), eq(purchaseOrderAttachments.id, attachmentId), customerId === undefined ? undefined : eq(procurementOrders.customerId, customerId)));
  if (!row) throw new AppError("NOT_FOUND", "Attachment not found.", 404);
  if (!bucket) throw new AppError("STORAGE_UNAVAILABLE", "Image storage is unavailable.", 503);
  const object = await bucket.get(row.key);
  if (!object) throw new AppError("NOT_FOUND", "Attachment not found.", 404);
  return new Response(object.body, { headers: { "content-type": row.contentType, "content-disposition": "inline", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox", "cache-control": "private, no-store" } });
}
