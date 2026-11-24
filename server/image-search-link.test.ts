import {describe,it,expect,vi} from 'vitest';
import {createImageSearchLink,readSignedSearchImage} from './image-search-link';
import {imageKey} from './client-images';
const id='20261112T090000123Z_12345678-1234-4123-8123-123456789abc.png';
const secret='test-only-signing-secret';
const token=(url:string)=>new URL(url).pathname.split('/').at(-1)!;
describe('signed image search access',()=>{
 it('authorizes only the signed owner and image, prevents tampering and expires at five minutes',async()=>{
  const now=Date.now(),get=vi.fn(async()=>({body:new Uint8Array([1]),customMetadata:{ownerId:'owner'}}));
  const bucket={get} as unknown as R2Bucket;
  const signed=token(await createImageSearchLink('owner',id,secret,'https://example.com',now));
  const response=await readSignedSearchImage(bucket,signed,secret,now+299999);
  expect(response.status).toBe(200);expect(get).toHaveBeenCalledWith(imageKey('owner',id));expect(response.headers.get('cache-control')).toBe('private, no-store');
  for(const [value,key,time] of [[signed,secret,now+300000],[signed,'wrong-secret',now],[signed.replace(/^./,signed[0]==='a'?'b':'a'),secret,now],['invalid',secret,now]] as const){
    get.mockClear();await expect(readSignedSearchImage(bucket,value,key,time)).rejects.toMatchObject({status:404});expect(get).not.toHaveBeenCalled();
  }
 });
 it('caps validity to the temporary image expiry and refuses already expired images',async()=>{
  const now=Date.now();const stamp=new Date(now-86400000+60000).toISOString().replace(/[-:.]/g,'');
  const temporary=`tmp_${stamp}_12345678-1234-4123-8123-123456789abc.png`;
  const signed=token(await createImageSearchLink('owner',temporary,secret,'https://example.com',now));
  const payload=JSON.parse(Buffer.from(signed.split('.')[0],'base64url').toString());expect(payload.expiresAt).toBe(now+60000);
  const bucket={get:vi.fn()} as unknown as R2Bucket;
  await expect(readSignedSearchImage(bucket,signed,secret,now+60000)).rejects.toMatchObject({status:404});expect(bucket.get).not.toHaveBeenCalled();
  await expect(createImageSearchLink('owner',temporary,secret,'https://example.com',now+60000)).rejects.toMatchObject({status:404});
 });
 it('does not expose deleted or mismatched-owner objects and requires configured HTTPS origin',async()=>{
  const signed=token(await createImageSearchLink('owner',id,secret,'https://example.com'));
  for(const object of [null,{customMetadata:{ownerId:'another'}}]) await expect(readSignedSearchImage({get:async()=>object} as unknown as R2Bucket,signed,secret)).rejects.toMatchObject({status:404});
  for(const origin of ['', 'http://localhost:5173','https://user:pass@example.com','https://example.com/path']) await expect(createImageSearchLink('owner',id,secret,origin)).rejects.toMatchObject({status:503});
 });
});
