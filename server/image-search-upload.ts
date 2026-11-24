import { createImageSearchLink } from "./image-search-link";
import { Buffer } from 'node:buffer';
import type { z } from 'zod';
import { imageSearchInput } from '../src/domain/shopping';
import { assertClientImageActive, imageKey, inspectClientImage, IMAGE_MAX_BYTES } from './client-images';
import { AppError } from './errors';

/** Resolve only the authenticated customer's namespace; never accept an R2 path or remote URL here. */
export async function resolveImageSearchUpload(bucket: R2Bucket, userId: string, input: z.infer<typeof imageSearchInput>, linkConfig?: {secret:string;appUrl:string}) {
  const { uploadId, ...request } = input;
  if (!uploadId) return request;
  assertClientImageActive(uploadId);
  const object = await bucket.get(imageKey(userId, uploadId));
  if (!object || object.customMetadata?.ownerId !== userId) throw new AppError('NOT_FOUND','Image not found.',404);
  if (object.size > IMAGE_MAX_BYTES) throw new AppError('PAYLOAD_TOO_LARGE','Image exceeds 3 MB.',413);
  const bytes = new Uint8Array(await object.arrayBuffer());
  const mime = uploadId.endsWith('.png') ? 'image/png' : 'image/jpeg';
  if (object.httpMetadata?.contentType !== mime) throw new AppError('INVALID_IMAGE','Image content type does not match.',400);
  inspectClientImage(bytes, mime);
  if (input.channel === 'weidian') {
    if (!linkConfig) throw new AppError('CONFIG','Image search links are not configured.',503);
    return {...request,image_url:await createImageSearchLink(userId,uploadId,linkConfig.secret,linkConfig.appUrl)};
  }
  return { ...request, image_base64: Buffer.from(bytes).toString('base64') };
}
