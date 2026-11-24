import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock("cloudflare:workers", () => ({ env: {} }));
import { Hono } from 'hono';
import { shoppingClient } from './shopping-http';
import type { AppEnv } from './index';
import { imageKey, IMAGE_MAX_BYTES } from './client-images';
import { AppError } from './errors';
import { imageSearchInput } from '../src/domain/shopping';
const mocks=vi.hoisted(()=>({query:vi.fn(),token:vi.fn()}));
vi.mock('./product-billing',async importOriginal=>({...await importOriginal<typeof import('./product-billing')>(),readProductDisplayPolicy:vi.fn(async()=>({markupBps:1000,fixedCnyCents:50}))}));
vi.mock('./purchase-products',()=>({queryProducts:mocks.query}));
vi.mock('./purchase-http',()=>({purchaseToken:mocks.token}));
vi.mock('./shopping',()=>({addCartItem:vi.fn(),addFavorite:vi.fn(),listShopping:vi.fn(),previewCart:vi.fn(),removeShopping:vi.fn(),updateCartItem:vi.fn()}));
const id='20261112T090000123Z_12345678-1234-4123-8123-123456789abc.png';
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6V0AAAAASUVORK5CYII=','base64');
function fixture(overrides:Record<string,unknown>={},missing=false){
 const owner=crypto.randomUUID();
 const object={size:bytes.length,customMetadata:{ownerId:owner},httpMetadata:{contentType:'image/png'},arrayBuffer:vi.fn(async()=>bytes),...overrides};
 const get=vi.fn(async(key:string)=>!missing&&key===imageKey(owner,id)?object:null);
 const app=new Hono<AppEnv>();
 app.use('*',async(c,next)=>{c.set('user',{id:owner} as AppEnv['Variables']['user']);c.set('requestId','test');await next();});
 app.onError((error,c)=>c.json({error:{code:error instanceof AppError?error.code:'INTERNAL'}},error instanceof AppError?error.status as 400:500));
 app.route('/api',shoppingClient);
 return {owner,get,object,send:(body:unknown)=>app.request('/api/products/search-by-image',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)},{PHOTOS:{get},BETTER_AUTH_SECRET:"test-link-secret",APP_URL:"https://example.com"})};
}
beforeEach(()=>{vi.clearAllMocks();mocks.token.mockResolvedValue('server-only-token');mocks.query.mockResolvedValue({items:[],page:1,pageSize:20,total:0});});
describe('uploadId image search integration',()=>{
 it.each(['1688','taobao'])('resolves owned upload for %s without forwarding private identifiers',async channel=>{
  const f=fixture();expect((await f.send({channel,uploadId:id,keyword:'shirt'})).status).toBe(200);
  expect(f.get).toHaveBeenCalledWith(imageKey(f.owner,id));
  expect(mocks.query.mock.calls[0][3]).toMatchObject({markupBps:1000,fixedCnyCents:50});
  const payload=mocks.query.mock.calls[0][2];expect(payload).toMatchObject({channel,keyword:'shirt',image_base64:bytes.toString('base64'),page:1,page_size:20});expect(payload).not.toHaveProperty('uploadId');
 });
 it('rejects missing, deleted or foreign files before obtaining a token or querying HioBuy',async()=>{
  for(const f of [fixture({},true),fixture({customMetadata:{ownerId:'other'}})]){expect((await f.send({channel:'1688',uploadId:id})).status).toBe(404);}
  expect(mocks.token).not.toHaveBeenCalled();expect(mocks.query).not.toHaveBeenCalled();
 });
 it('rechecks size, MIME and contents before querying upstream',async()=>{
  for(const f of [fixture({size:IMAGE_MAX_BYTES+1}),fixture({httpMetadata:{contentType:'image/svg+xml'}}),fixture({arrayBuffer:async()=>new Uint8Array([1,2,3])})]) expect((await f.send({channel:'1688',uploadId:id})).status).toBeGreaterThanOrEqual(400);
  expect(mocks.query).not.toHaveBeenCalled();
 });
 it('rejects conflicting sources, invalid IDs and unsupported channels',async()=>{
  for(const body of [{channel:'1688',uploadId:id,image_id:'x'},{channel:'1688',uploadId:'../secret'},{channel:'1688'}]) expect(imageSearchInput.safeParse(body).success).toBe(false);
  const f=fixture();expect((await f.send({channel:'weidian',image_base64:'AAAA'})).status).toBe(400);expect(f.get).not.toHaveBeenCalled();
 });
 it('rejects expired temporary uploads without reading R2 or calling HioBuy',async()=>{
  const f=fixture();const expired='tmp_20000101T000000000Z_12345678-1234-4123-8123-123456789abc.png';
  expect((await f.send({channel:'1688',uploadId:expired})).status).toBe(404);expect(f.get).not.toHaveBeenCalled();expect(mocks.query).not.toHaveBeenCalled();
 });
 it('gives Weidian a server-origin signed URL, never the private upload path or base64',async()=>{
  const f=fixture();expect((await f.send({channel:'weidian',uploadId:id})).status).toBe(200);
  expect(mocks.query.mock.calls[0][3]).toMatchObject({markupBps:1000,fixedCnyCents:50});
  const payload=mocks.query.mock.calls[0][2];expect(payload.image_url).toMatch(/^https:\/\/example.com\/api\/uploads\/image-access\//);expect(payload).not.toHaveProperty('uploadId');expect(payload).not.toHaveProperty('image_base64');
 });
 it('preserves legacy input without reading R2',async()=>{
  const f=fixture();expect((await f.send({channel:'taobao',image_id:'upstream-image'})).status).toBe(200);expect(f.get).not.toHaveBeenCalled();expect(mocks.query.mock.calls[0][2].image_id).toBe('upstream-image');
 });
});
