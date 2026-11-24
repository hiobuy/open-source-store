import { clientImageIdPattern, temporaryImageExpiry } from "../src/domain/client-images";
import { AppError } from './errors';

export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const invalid = () => new AppError('INVALID_IMAGE', 'Upload a valid PNG or JPEG image (maximum 3 MB and 20 megapixels).', 400);
export function inspectClientImage(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > IMAGE_MAX_BYTES) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0, extension: 'png' | 'jpg';
  if (mime === 'image/png' && bytes.length >= 45 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) {
    if (view.getUint32(8)!==13 || view.getUint32(12)!==0x49484452 || view.getUint32(bytes.length-12)!==0 || view.getUint32(bytes.length-8)!==0x49454e44) throw invalid();
    width=view.getUint32(16); height=view.getUint32(20); extension='png';
  } else if (mime === 'image/jpeg' && bytes.length >= 12 && bytes[0]===255 && bytes[1]===216 && bytes.at(-2)===255 && bytes.at(-1)===217) {
    extension='jpg';
    let offset=2;
    while(offset+4 <= bytes.length) {
      if(bytes[offset++]!==255) throw invalid();
      while(bytes[offset]===255) offset++;
      const marker=bytes[offset++];
      if(marker===0xda || marker===0xd9) break;
      if(marker===1 || (marker>=0xd0 && marker<=0xd7)) continue;
      if(offset+2>bytes.length) throw invalid();
      const length=view.getUint16(offset);
      if(length<2 || offset+length>bytes.length) throw invalid();
      if([0xc0,0xc1,0xc2].includes(marker)) { if(length<8) throw invalid(); height=view.getUint16(offset+3); width=view.getUint16(offset+5); break; }
      offset+=length;
    }
  } else throw invalid();
  if(!width || !height || width>10000 || height>10000 || width*height>20000000) throw invalid();
  return {contentType:mime,extension,width,height};
}

export function imageKey(userId:string,id:string) {
  if(!clientImageIdPattern.test(id)) throw new AppError('NOT_FOUND','Image not found.',404);
  return id.startsWith("tmp_") ? `client-temp-images/${id.slice(4,23)}/${encodeURIComponent(userId)}/${id}` : `client-images/${encodeURIComponent(userId)}/${id}`;
}
export async function uploadClientImage(bucket:R2Bucket,userId:string,file:File,temporary=false) {
  if(file.size>IMAGE_MAX_BYTES) throw new AppError('PAYLOAD_TOO_LARGE','Image exceeds 3 MB.',413);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const info=inspectClientImage(bytes,file.type);
  const createdAt=Date.now();
  const id=`${temporary ? "tmp_" : ""}${new Date(createdAt).toISOString().replace(/[-:.]/g,'')}_${crypto.randomUUID()}.${info.extension}`;
  const expiresAt=temporaryImageExpiry(id);
  await bucket.put(imageKey(userId,id),bytes,{httpMetadata:{contentType:info.contentType},customMetadata:{ownerId:userId,createdAt:String(createdAt),...(expiresAt!==null?{expiresAt:String(expiresAt)}:{})}});
  return {id,filename:id,url:`/api/uploads/images/${id}`,contentType:info.contentType,size:bytes.length,width:info.width,height:info.height,createdAt,temporary,expiresAt};
}
export async function readClientImage(bucket:R2Bucket,userId:string,id:string) {
  assertClientImageActive(id);
  const object=await bucket.get(imageKey(userId,id));
  if(!object || object.customMetadata?.ownerId!==userId) throw new AppError('NOT_FOUND','Image not found.',404);
  return new Response(object.body,{headers:{'content-type':id.endsWith('.png')?'image/png':'image/jpeg','content-disposition':`inline; filename="${id}"`,'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",'cache-control':'private, no-store'}});
}

export function assertClientImageActive(id:string, now=Date.now()) {
  const expiry=temporaryImageExpiry(id);
  if(expiry!==null && expiry<=now) throw new AppError('NOT_FOUND','Image not found.',404);
}
export function parseTemporaryImageFlag(values: (string | File)[]) {
  if(values.length===0) return false;
  if(values.length!==1 || (values[0]!=="true" && values[0]!=="false")) throw new AppError('VALIDATION_ERROR','temporary must be true or false.',400);
  return values[0]==="true";
}
/** Bounded cleanup of the dedicated temporary prefix. Deletes are idempotent, failed runs retry next cron. */
export async function cleanupTemporaryImages(bucket:R2Bucket, now=Date.now()) {
  let cursor:string|undefined, deleted=0;
  for(let page=0;page<5;page++) {
    const result=await bucket.list({prefix:'client-temp-images/',limit:200,cursor});
    const keys=result.objects.filter(object=>{
      const parts=object.key.split('/');
      if(parts.length!==4 || parts[0]!=="client-temp-images" || !parts[3].startsWith('tmp_') || !clientImageIdPattern.test(parts[3]) || parts[1]!==parts[3].slice(4,23)) return false;
      const expiry=temporaryImageExpiry(parts[3]);
      return expiry!==null && expiry>0 && expiry<=now;
    }).map(object=>object.key);
    if(keys.length) { await bucket.delete(keys); deleted+=keys.length; }
    if(!result.truncated) break;
    cursor=result.cursor;
  }
  return {deleted};
}
