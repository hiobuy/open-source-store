import { readProductDisplayPolicy } from "./product-billing";
import { cachedProductSearch } from "./product-search-cache";
import { readOrderAttachment } from "./purchase-attachments";
import { fillPurchaseMedia } from "./purchase-media";
import { Hono } from "hono";
import { z } from "zod";
import type { AdminEnv } from "./admin";
import type { Database } from "./db/client";
import { AppError } from "./errors";
import { parseInput } from "./operations-input";
import { createPurchase, performPurchaseAction, previewPurchase, reconcilePurchase, remotePurchaseView } from "./purchase";
import { productDetailInput, productParseInput, productSearchInput, purchaseActionInput, purchaseCreateInput } from "../src/domain/purchase";
import { queryProducts } from "./purchase-products";
export async function purchaseToken(db:Database,envToken?:string){
  const {resolveHioBuyToken}=await import("./freight");
  const token=await resolveHioBuyToken(db,envToken);
  if(!token)throw new AppError("INTEGRATION_REQUIRED","Configure HioBuy integration first.",503);return token;
}
export const purchaseAdmin=new Hono<AdminEnv>();
purchaseAdmin.get("/procurement/:id/attachments/:attachmentId", async c => readOrderAttachment(c.get("db"),c.env.PHOTOS,c.req.param("id"),c.req.param("attachmentId")));
purchaseAdmin.post("/procurement/:id/media",async c=>{
  parseInput(z.object({confirm:z.literal(true)}).strict(),await c.req.json());
  return c.json({data:await fillPurchaseMedia(c.get("db"),await purchaseToken(c.get("db"),c.env.HIOBUY_API_TOKEN),c.get("user"),c.req.param("id")),requestId:c.get("requestId")});
});
const actorId=z.string().min(1).max(128);
// Remove customerId before using the strict shared preview schema.
purchaseAdmin.post("/procurement/remote/preview",async c=>{
  const {customerId,...input}=parseInput(z.object({customerId:actorId}).passthrough(),await c.req.json());
  const data=await previewPurchase(c.get("db"),await purchaseToken(c.get("db"),c.env.HIOBUY_API_TOKEN),customerId,input);return c.json({data,requestId:c.get("requestId")});
});
purchaseAdmin.post("/procurement/remote/create",async c=>{
  const {customerId,...input}=parseInput(purchaseCreateInput.extend({customerId:actorId}),await c.req.json());
  return c.json({data:await createPurchase(c.get("db"),c.get("user"),customerId,input,c.env.PHOTOS),requestId:c.get("requestId")});
});
purchaseAdmin.get("/procurement/:id/remote",async c=>c.json({data:await remotePurchaseView(c.get("db"),c.req.param("id")),requestId:c.get("requestId")}));
purchaseAdmin.post("/procurement/:id/remote/:action",async c=>{
  if(c.req.param("action")==="reconcile"){
    const input=parseInput(z.object({confirm:z.literal(true),remoteId:z.string().trim().min(1).max(200),reason:z.string().trim().min(10).max(500)}).strict(),await c.req.json());
    return c.json({data:await reconcilePurchase(c.get("db"),await purchaseToken(c.get("db"),c.env.HIOBUY_API_TOKEN),c.get("user"),c.req.param("id"),input.remoteId,input.reason),requestId:c.get("requestId")});
  }
  const action=parseInput(z.enum(["create","sync","pay","cancel"]),c.req.param("action"));
  const {reason,code,maxCostCnyCents}=parseInput(purchaseActionInput,await c.req.json());
  if(action==="pay"){
    const {authorizeHiobuyPay,consumePayGrant}=await import("./pay-factor");
    const grantId=`purchase:${c.req.param("id")}`;
    await authorizeHiobuyPay(c.get("db"),c.get("auth") as Parameters<typeof authorizeHiobuyPay>[1],c.req.raw.headers,c.get("user").id,grantId,code??"");
    if(!await consumePayGrant(c.get("db"),grantId))throw new AppError("FORBIDDEN","Enter the authenticator code for this payment.",403);
  }
  return c.json({data:await performPurchaseAction(c.get("db"),await purchaseToken(c.get("db"),c.env.HIOBUY_API_TOKEN),c.get("user"),c.req.param("id"),action,reason,maxCostCnyCents),requestId:c.get("requestId")});
});
for(const [path,schema] of [["search",productSearchInput],["detail",productDetailInput],["parse",productParseInput]] as const){
  purchaseAdmin.post(`/procurement/products/${path}`,async c=>{
    const token = await purchaseToken(c.get("db"),c.env.HIOBUY_API_TOKEN);
    const input = parseInput(schema as z.ZodType<Record<string,unknown>>,await c.req.json());
    const data = path === "search" ? await cachedProductSearch(c.get("db"),token,input) : await queryProducts(token,path,input,await readProductDisplayPolicy(c.get("db")));
    return c.json({data,requestId:c.get("requestId")});
  });
}
