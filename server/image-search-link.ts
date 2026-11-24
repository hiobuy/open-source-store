import { Buffer } from 'node:buffer';
import { temporaryImageExpiry, clientImageIdPattern } from '../src/domain/client-images';
import { readClientImage } from './client-images';
import { AppError } from './errors';
const TTL=5*60*1000;
const rejected=()=>new AppError('NOT_FOUND','Image not found.',404);
const key=(secret:string)=>crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
const message=(payload:string)=>new TextEncoder().encode(`hiobuy:image-search:read:v1:${payload}`);
export async function createImageSearchLink(userId:string,id:string,secret:string,appUrl:string,now=Date.now()) {
  let origin:URL;
  try { origin=new URL(appUrl); } catch { throw new AppError('CONFIG','A public HTTPS APP_URL is required for image search.',503); }
  if(!secret || origin.protocol!=='https:' || origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash) throw new AppError('CONFIG','A public HTTPS APP_URL is required for image search.',503);
  if(!clientImageIdPattern.test(id)) throw rejected();
  const expiresAt=Math.min(now+TTL,temporaryImageExpiry(id)??Infinity);
  if(expiresAt<=now) throw rejected();
  const payload=Buffer.from(JSON.stringify({userId,id,issuedAt:now,expiresAt})).toString('base64url');
  const signature=Buffer.from(await crypto.subtle.sign('HMAC',await key(secret),message(payload))).toString('base64url');
  return new URL(`/api/uploads/image-access/${payload}.${signature}`,origin).href;
}
export async function readSignedSearchImage(bucket:R2Bucket,token:string,secret:string,now=Date.now()) {
  if(!secret || token.length>2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) throw rejected();
  const [payload,signature]=token.split('.');
  if(!await crypto.subtle.verify('HMAC',await key(secret),Buffer.from(signature,'base64url'),message(payload))) throw rejected();
  let data: {userId:string;id:string;issuedAt:number;expiresAt:number};
  try { data=JSON.parse(Buffer.from(payload,'base64url').toString()); } catch { throw rejected(); }
  if(!data || typeof data.userId!=='string' || !data.userId || typeof data.id!=='string' || !clientImageIdPattern.test(data.id) || !Number.isSafeInteger(data.issuedAt) || !Number.isSafeInteger(data.expiresAt) || data.issuedAt>now || data.expiresAt<=now || data.expiresAt<=data.issuedAt || data.expiresAt-data.issuedAt>TTL || data.expiresAt>(temporaryImageExpiry(data.id)??Infinity)) throw rejected();
  const response=await readClientImage(bucket,data.userId,data.id);
  response.headers.set('referrer-policy','no-referrer');
  return response;
}
