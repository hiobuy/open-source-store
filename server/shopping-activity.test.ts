import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock("cloudflare:workers", () => ({ env: {} }));
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFileSync,readdirSync} from 'node:fs';
import {createDb,type Database} from './db/client';
import {user,browsingHistory,shopSubscriptions,productFavorites} from './db/schema';
import {favoriteStatus,subscribeShop,shopSubscriptionStatus,listShopSubscriptions,unsubscribeShop,recordBrowsingHistory,listBrowsingHistory,removeBrowsingHistory} from './shopping-activity';
import {addFavorite,removeShopping} from './shopping';
import {shoppingClient} from './shopping-http';
import {Hono} from 'hono';
import type {AppEnv} from './index';
let mf:Miniflare,db:Database;
const token='test-only',identity={channel:'1688',productId:'p1'};
function upstream(){const mock=vi.fn(async(_url:unknown,init?:RequestInit)=>{const body=JSON.parse(String(init?.body));return Response.json({product:{id:body.id,channel:body.channel,title:'Product',image:'https://example.com/p.jpg',cost:999,private:'secret'}})});vi.stubGlobal('fetch',mock);return mock;}
beforeAll(async()=>{
 mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'activity-test',modules:true,script:"export default {fetch(){return new Response('test')}}",d1Databases:['DB']}]}));
 const binding=await mf.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())await binding.batch(readFileSync(`drizzle/${f}`,'utf8').split(';').map(s=>s.replaceAll('--> statement-breakpoint','').trim()).filter(Boolean).map(s=>binding.prepare(s)));
 db=createDb(binding as unknown as D1Database);
 for(const id of ['a','b'])await db.insert(user).values({id,name:id,email:`${id}@example.invalid`,memberCode:id,createdAt:new Date(),updatedAt:new Date()});
},30000);
beforeEach(async()=>{await db.delete(browsingHistory);await db.delete(shopSubscriptions);await db.delete(productFavorites)});
afterEach(()=>vi.unstubAllGlobals());afterAll(async()=>mf?.dispose());
describe('shopping activity',()=>{
 it('queries a single favorite locally, distinguishes channel and owner, and follows cancellation',async()=>{
  expect(await favoriteStatus(db,'a',identity)).toMatchObject({isFavorited:false,favoriteId:null});
  const remote=upstream();const saved=await addFavorite(db,token,'a',identity);remote.mockClear();
  expect(await favoriteStatus(db,'a',identity)).toMatchObject({isFavorited:true,favoriteId:saved.id});
  expect(await favoriteStatus(db,'b',identity)).toMatchObject({isFavorited:false});
  expect(await favoriteStatus(db,'a',{...identity,channel:'taobao'})).toMatchObject({isFavorited:false});
  expect(remote).not.toHaveBeenCalled();await removeShopping(db,'a','favorites',saved.id);
  expect(await favoriteStatus(db,'a',identity)).toMatchObject({isFavorited:false});
 });
 it('deduplicates concurrent subscriptions and isolates listing/status/deletion',async()=>{
  const input={channel:'1688',shopId:'seller-1',name:'Store'};
  const [a,b]=await Promise.all([subscribeShop(db,'a',input),subscribeShop(db,'a',input)]);expect(a.id).toBe(b.id);expect(a).not.toHaveProperty('customerId');
  await subscribeShop(db,'a',{channel:'weidian',shopId:'seller-1'});
  expect((await listShopSubscriptions(db,'a',{page:1,pageSize:1}))).toMatchObject({total:2,pageSize:1});
  expect((await listShopSubscriptions(db,'a',{channel:'1688'})).items).toHaveLength(1);
  expect((await listShopSubscriptions(db,'b',{})).total).toBe(0);
  await unsubscribeShop(db,'b',a.id);expect(await shopSubscriptionStatus(db,'a',inputWithoutName(input))).toMatchObject({isSubscribed:true});
  await unsubscribeShop(db,'a',a.id);await unsubscribeShop(db,'a',a.id);expect(await shopSubscriptionStatus(db,'a',inputWithoutName(input))).toMatchObject({isSubscribed:false,subscriptionId:null});
 });
 it('merges concurrent history reports and stores only upstream safe data',async()=>{
  upstream();const [a,b]=await Promise.all([recordBrowsingHistory(db,token,'a',identity),recordBrowsingHistory(db,token,'a',identity)]);
  expect(a.id).toBe(b.id);expect((await listBrowsingHistory(db,'a',{})).total).toBe(1);expect(JSON.stringify(a)).not.toMatch(/customerId|secret|"cost"/);
  await recordBrowsingHistory(db,token,'a',{...identity,channel:'weidian'});expect((await listBrowsingHistory(db,'a',{channel:'weidian'})).total).toBe(1);
  await removeBrowsingHistory(db,'b',a.id);expect((await listBrowsingHistory(db,'a',{})).total).toBe(2);
  await removeBrowsingHistory(db,'a',a.id);await removeBrowsingHistory(db,'a',a.id);expect((await listBrowsingHistory(db,'a',{})).total).toBe(1);
  await removeBrowsingHistory(db,'a');expect((await listBrowsingHistory(db,'a',{})).total).toBe(0);
 });
 it('atomically retains the latest 200 across channels without deleting other customers',async()=>{
  for(let start=0;start<200;start+=10)await db.insert(browsingHistory).values(Array.from({length:10},(_,i)=>({id:crypto.randomUUID(),customerId:'a',channel:'1688',productId:`old-${start+i}`,product:'{}',createdAt:start+i,lastViewedAt:start+i})));
  upstream();await recordBrowsingHistory(db,token,'b',identity);
  await Promise.all(['new1','new2'].map(productId=>recordBrowsingHistory(db,token,'a',{...identity,productId})));
  const list=await listBrowsingHistory(db,'a',{page:1,pageSize:2});expect(list.total).toBe(200);expect(list.items.map(i=>i.productId).sort()).toEqual(['new1','new2']);
  expect((await listBrowsingHistory(db,'a',{page:101,pageSize:2})).items).toEqual([]);
  await removeBrowsingHistory(db,'a');expect((await listBrowsingHistory(db,'b',{})).total).toBe(1);
 });
 it('rejects owner/price injection, unsafe display URLs, and invalid pagination before writes',async()=>{
  const remote=upstream();await expect(recordBrowsingHistory(db,token,'a',{...identity,customerId:'b'})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  await expect(recordBrowsingHistory(db,token,'a',{...identity,price:1})).rejects.toMatchObject({code:'VALIDATION_ERROR'});expect(remote).not.toHaveBeenCalled();
  await expect(subscribeShop(db,'a',{channel:'1688',shopId:'x',url:'javascript:alert(1)'})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  await expect(listBrowsingHistory(db,'a',{pageSize:51})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({product:{id:'wrong',channel:'1688'}})));
  await expect(recordBrowsingHistory(db,token,'a',identity)).rejects.toMatchObject({status:502});expect((await listBrowsingHistory(db,'a',{})).total).toBe(0);
 });
 it('mounts status and list routes with the common envelope and body limits',async()=>{
  const app=new Hono<AppEnv>();app.use('*',async(c,next)=>{c.set('db',db);c.set('user',{id:'a'} as AppEnv['Variables']['user']);c.set('requestId','test');await next()});app.onError((e,c)=>c.json({error:e.message},((e as {status?:number}).status??500) as 400));app.route('/api',shoppingClient);
  const res=await app.request('/api/favorites/status?channel=1688&productId=p1');expect(res.status).toBe(200);expect(await res.json()).toMatchObject({requestId:'test',data:{isFavorited:false}});
  expect((await app.request('/api/shop-subscriptions',{method:'POST',body:'x'.repeat(20000)})).status).toBe(413);
 });
});
function inputWithoutName(v:{channel:string;shopId:string}){return {channel:v.channel,shopId:v.shopId}}
