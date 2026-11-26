import { chunks, mapLimited } from "./batch-utils";
import { purchaseBillPresentation, purchaseItemPrice, purchaseLogistics } from "./purchase-detail";
import { purchaseOptionsView, prepareOrderAttachments, discardOrderAttachments } from "./purchase-attachments";
import { applyPurchaseCoupon, reservePurchaseCoupon, unavailableCoupon, type DiscountedQuote } from "./purchase-coupons";
import { purchaseItemDetails, purchaseOrderDetails, purchaseOrderAttachments, purchaseCouponRedemptions } from "./db/schema";
import { customerCanCancel, customerPurchaseCounts, customerPurchaseListInput, customerPurchaseWhere } from "./purchase-customer-query";
import { procurementStage } from "./procurement-overview";
import { submitManualPurchase } from "./manual-purchase";
import { purchaseCostCoverage } from "../src/domain/purchase-cost";
import { allocateNumber } from "./numbering";
import { productMedia, readProductMedia } from "./purchase-media";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { Database } from "./db/client";
import { auditLogs, procurementBills, procurementItems, procurementOrders, procurementRemote, purchaseAttempts, purchaseQuotes, user, warehouseLocations, wallets, walletTransactions } from "./db/schema";
import { queryProducts, type publicProduct } from "./purchase-products";
import { AppError } from "./errors";
import { parseInput } from "./operations-input";
import { readProductPolicy, productPricingSettings } from "./product-billing";
import { customerPurchaseQuote, pricePurchase, purchaseCreateInput, purchaseDetailPayment, purchasePreviewInput, record, stringId, type PurchaseInput } from "../src/domain/purchase";
import type { ProductQuote } from "../src/domain/product-pricing";
import { callProcurement, requireProcurementResult } from "./services/hiobuy/procurement";

type Actor = { id: string; email: string };
const missing = () => { throw new AppError("NOT_FOUND", "Record not found.", 404); };
const conflict = (message = "This purchase changed. Refresh and review it before continuing.") => { throw new AppError("PURCHASE_CONFLICT", message, 409); };
const audit = (actor: Actor, action: string, orderId: string) => ({ id: crypto.randomUUID(), actorId: actor.id, actorEmail: actor.email, action: `procurement.remote.${action}`, target: orderId, detail: "{}", createdAt: Date.now() });
function createdRemoteId(data: Record<string, unknown>, localId: string) {
  if (data.external_order_id && data.external_order_id !== localId) return null;
  return stringId(data.order_id) ?? (data.success === true && data.external_order_id === localId ? stringId(data.order_sn) : null);
}
function remoteAmount(data: Record<string, unknown>, channel: string) {
  if (data.channel === "manual" && data.currency === "CNY" && data.monetary_unit === "CNY_minor") {
    const payment=record(record(data.total).payment);
    if(payment.currency === "CNY" && Number.isSafeInteger(payment.amount) && Number(payment.amount)>=0) return Number(payment.amount);
  }
  const total = record(data.order).total;
  let amount: unknown;
  if (typeof total === "number") {
    amount = total;
  } else if (record(total).currency === "CNY") {
    amount = record(total).amount;
  } else if (data.currency === "CNY" && Number.isSafeInteger(data.payment) && Number.isSafeInteger(data.shipping)) {
    // A 1688 create response itemizes domestic shipping inside the payable total.
    amount = channel === "1688" ? data.payment : Number(data.payment) + Number(data.shipping);
  }
  return Number.isSafeInteger(amount)&&Number(amount)>=0?Number(amount):null;
}
async function costCoverage(db: Database, orderId: string, amount: number | null) {
  const bills = await db.select().from(procurementBills).where(eq(procurementBills.orderId, orderId));
  return purchaseCostCoverage(amount, bills);
}
async function customer(db: Database, id: string) {
  const row = (await db.select().from(user).where(and(eq(user.id,id),eq(user.status,"active"))))[0];
  if (!row?.memberCode) return missing(); return row;
}
async function receiver(db: Database, customerId: string) {
  const [who, place] = await Promise.all([customer(db,customerId), db.select().from(warehouseLocations).where(eq(warehouseLocations.id,"current"))]);
  const w=place[0];
  if (!w?.syncedAt || !w.recipient || !w.phone || !w.province || !w.city || !w.district || !w.street) throw new AppError("WAREHOUSE_REQUIRED", "Sync a complete HioBuy receiving address first.",409);
  return { name: `${w.recipient} ${who.memberCode}`, mobile:w.phone, province:w.province, city:w.city, district:w.district, address:`${w.street} ${who.memberCode}`, zip:w.postalCode, country:w.country };
}
export async function previewPurchase(db: Database, token: string, customerId: string, raw: unknown, verifiedProducts?: ReturnType<typeof publicProduct>[]) {
  const input=parseInput(purchasePreviewInput,raw), policy=await readProductPolicy(db);
  if (!policy || policy.currency !== (await productPricingSettings(db)).currency) throw new AppError("PRICING_REQUIRED","Configure product pricing for the current customer currency.",409);
  const {couponCode,...upstreamInput}=input;
  const request={...upstreamInput,receiver:await receiver(db,customerId),response_format:"standard"};
  const preview=requireProcurementResult(await callProcurement(token,"preview",request));
  let priced: ReturnType<typeof pricePurchase>;
  try { priced=pricePurchase(input,preview,policy); } catch(error){throw new AppError("PREVIEW_UNAVAILABLE",error instanceof Error?error.message:"Invalid preview.",409);}
  // Persist server-fetched product names; presentation metadata never determines the approved amount.
  const products = verifiedProducts ?? await mapLimited([...new Set(input.lines.map(l=>l.id))], async id => {
    const result = await queryProducts(token,"detail",{channel:input.channel,id,language:"en"});
    if (!("product" in result) || !result.product) throw new AppError("INVALID_PRODUCT","Product details are unavailable.",502);
    return result.product;
  });
  for (const [index,line] of input.lines.entries()) {
    const product=products.find(p=>p.id===line.id && p.channel===input.channel);
    const variant=product?.variants.find(v=>v.skuId===line.spec_id);
    if(!product || !variant || (variant.stock!==null && variant.stock<line.quantity)) throw new AppError("OUT_OF_STOCK","This variant is unavailable. Select another variant.",409);
    priced.quote.lines[index].name=String(product.title.original??product.title.translated??line.id).slice(0,500);
  }
  const discounted=await applyPurchaseCoupon(db,priced.quote,couponCode);
  const now=Date.now(),id=crypto.randomUUID(),expiresAt=now+8*60*1000;
  await db.insert(purchaseQuotes).values({id,customerId,channel:input.channel,request:JSON.stringify(request),preview:JSON.stringify({...preview,productSnapshots:input.lines.map(line=>productMedia(products.find(p=>p.id===line.id)!,line.spec_id))}),pricing:JSON.stringify(discounted),costCnyCents:priced.costCnyCents,createdAt:now,expiresAt});
  return { id,expiresAt,...customerPurchaseQuote(discounted) };
}
export async function createPurchase(db: Database, actor: Actor, customerId: string, raw: unknown, bucket?: R2Bucket) {
  const input=parseInput(purchaseCreateInput,raw);
  const requestHash=JSON.stringify(input);
  const verifyRetry=async()=>{
    const previous=(await db.select().from(purchaseOrderDetails).where(eq(purchaseOrderDetails.orderId,input.id)))[0];
    if(previous ? previous.requestHash!==requestHash : !!input.remark || input.attachmentUploadIds.length>0 || !!input.couponCode || !!input.items?.length) conflict("Retry must use the same remark, attachments and coupon code.");
  };
  const existing=(await db.select().from(procurementRemote).where(eq(procurementRemote.orderId,input.id)))[0];
  if(existing){if(existing.quoteId!==input.quoteId)conflict();await verifyRetry();return customerPurchase(db,customerId,input.id);}
  const { statements, attachments, pricing, savedPricing, q } = await preparePurchaseCreation(db,actor,customerId,input,bucket);
  try {
    await db.batch(statements);
  } catch(error) {
    const saved=(await db.select().from(procurementRemote).where(eq(procurementRemote.orderId,input.id)))[0];
    const retained=saved?await db.select({id:purchaseOrderAttachments.id}).from(purchaseOrderAttachments).where(eq(purchaseOrderAttachments.orderId,input.id)):[];
    await discardOrderAttachments(bucket,attachments.filter(a=>!retained.some(r=>r.id===a.id)));
    if(!saved){if(pricing.coupon){const fresh=await applyPurchaseCoupon(db,savedPricing,pricing.coupon.code);if(fresh.coupon?.version!==pricing.coupon.version)throw unavailableCoupon();}if((await db.select().from(procurementRemote).where(eq(procurementRemote.quoteId,q.id)))[0])conflict("This quote already belongs to an order.");throw error;}
    if(saved.quoteId!==q.id)conflict();
    await verifyRetry();
  }
  return customerPurchase(db,customerId,input.id);
}
/** Builds local writes without executing them, so cart checkout can commit all orders atomically. */
export async function preparePurchaseCreation(db: Database, actor: Actor, customerId: string, raw: unknown, bucket?: R2Bucket) {
  const input=parseInput(purchaseCreateInput,raw), requestHash=JSON.stringify(input);
  await customer(db,customerId);
  const q=(await db.select().from(purchaseQuotes).where(and(eq(purchaseQuotes.id,input.quoteId),eq(purchaseQuotes.customerId,customerId))))[0];
  if(!q)return missing();if(q.expiresAt<=Date.now())conflict("The purchase quote expired. Request a new preview.");
  const savedPricing=JSON.parse(q.pricing) as DiscountedQuote;
  if(savedPricing.coupon && input.couponCode && savedPricing.coupon.code!==input.couponCode) conflict("Coupon changed. Request a new preview.");
  const pricing=await applyPurchaseCoupon(db,savedPricing,input.couponCode??savedPricing.coupon?.code),now=Date.now();
  if(savedPricing.coupon && (pricing.coupon?.version!==savedPricing.coupon.version || pricing.discountCents!==savedPricing.discountCents)) throw unavailableCoupon();
  const goods=pricing.lines.reduce((n,l)=>n+l.costCnyCents*l.quantity,0);
  const media=record(JSON.parse(q.preview)).productSnapshots;
  const quotedLines = purchasePreviewInput.shape.lines.parse(record(JSON.parse(q.request)).lines);
  for (const item of input.items ?? []) {
    if (!quotedLines.some(line => line.id === item.productId && line.spec_id === item.skuId)) throw new AppError("INVALID_PURCHASE_ITEM", "SKU options must belong to the selected quote.", 400);
  }
  const orderItems = pricing.lines.map((l, position) => ({id:crypto.randomUUID(),orderId:input.id,position,name:l.name,sku:l.sku,productSnapshot:Array.isArray(media)&&media[position]?JSON.stringify(media[position]):null,quantity:l.quantity,unitPriceCents:l.costCnyCents}));
  const itemDetails = orderItems.map((item, position) => {
    const line = quotedLines[position];
    const options = input.items?.find(option => option.productId === line.id && option.skuId === line.spec_id);
    return {itemId:item.id,orderId:input.id,remark:options?.remark ?? "",uploadIds:options?.attachmentUploadIds ?? []};
  });
  const billId=crypto.randomUUID();
  const attachments: Awaited<ReturnType<typeof prepareOrderAttachments>> = [];
  try {
    attachments.push(...await prepareOrderAttachments(bucket,customerId,input.id,input.attachmentUploadIds));
    for (const item of itemDetails) attachments.push(...await prepareOrderAttachments(bucket,customerId,input.id,item.uploadIds,item.itemId));
  } catch (error) { await discardOrderAttachments(bucket,attachments); throw error; }
  try {
  const statements = [
      db.insert(procurementOrders).values({id:input.id,number: await allocateNumber(db, "procurement"),customerId,platform: q.channel==="1688"?"1688":q.channel==="taobao"?"Taobao":"Weidian",currency:"CNY",goodsCents:goods,shippingCents:q.costCnyCents-goods,totalCents:q.costCnyCents,requestHash:input.quoteId,createdBy:actor.id,createdAt:now,updatedAt:now}),
      ...chunks(orderItems, 8).map(items => db.insert(procurementItems).values(items)),
      ...chunks(itemDetails, 20).map(items => db.insert(purchaseItemDetails).values(items.map(({uploadIds: _uploadIds,...item})=>item))),
      db.insert(procurementRemote).values({orderId:input.id,quoteId:q.id,channel:q.channel,costCnyCents:q.costCnyCents,updatedAt:now}),
      db.insert(procurementBills).values({id:billId,orderId:input.id,customerId,status:"issued",currency:pricing.currency,goodsCents:pricing.goodsCents,serviceCents:pricing.serviceCents,shippingCents:pricing.shippingCents,totalCents:pricing.totalCents,discountCents:pricing.discountCents??0,snapshot:JSON.stringify(pricing),requestHash:q.id,createdBy:actor.id,createdAt:now}),
      db.insert(purchaseOrderDetails).values({orderId:input.id,remark:input.remark,requestHash}),
      ...(attachments.length?[db.insert(purchaseOrderAttachments).values(attachments)]:[]),
      ...(pricing.coupon?[reservePurchaseCoupon(db,input.id,billId,pricing,now)]:[]),
      db.insert(auditLogs).values(audit(actor,"request",input.id)),
  ] as const;
  return { statements, attachments, pricing, savedPricing, q };
  } catch (error) { await discardOrderAttachments(bucket,attachments); throw error; }
}
export async function customerPurchase(db: Database, customerId: string, id: string, trackingEnv?: { HIOBUY_API_TOKEN?: string; BETTER_AUTH_SECRET?: string }) {
  const o=(await db.select({id:procurementOrders.id,number:procurementOrders.number,platform:procurementOrders.platform,orderType:procurementOrders.orderType,status:procurementOrders.status,createdAt:procurementOrders.createdAt,stage:procurementStage,canCancel:customerCanCancel}).from(procurementOrders).where(and(eq(procurementOrders.id,id),eq(procurementOrders.customerId,customerId))))[0];if(!o)return missing();
  const [items,bills,remote,presentation,logistics]=await Promise.all([
    db.select({id:procurementItems.id,position:procurementItems.position,name:procurementItems.name,sku:procurementItems.sku,quantity:procurementItems.quantity,productSnapshot:procurementItems.productSnapshot}).from(procurementItems).where(eq(procurementItems.orderId,id)).orderBy(asc(procurementItems.position)),
    db.select({id:procurementBills.id,status:procurementBills.status,currency:procurementBills.currency,goodsCents:procurementBills.goodsCents,serviceCents:procurementBills.serviceCents,shippingCents:procurementBills.shippingCents,discountCents:procurementBills.discountCents,totalCents:procurementBills.totalCents,paidCents:procurementBills.paidCents,version:procurementBills.version,estimated:sql<boolean>`COALESCE(json_extract(${procurementBills.snapshot}, '$.estimated'),0)`.mapWith(Boolean),paidAt:procurementBills.paidAt}).from(procurementBills).where(eq(procurementBills.orderId,id)),
    db.select({state:procurementRemote.state,status:procurementRemote.remoteStatus,updatedAt:procurementRemote.updatedAt}).from(procurementRemote).where(eq(procurementRemote.orderId,id)),
    purchaseBillPresentation(db,customerId,id),
    purchaseLogistics(db,customerId,id,trackingEnv),
  ]);
  const {itemOptions,...options} = await purchaseOptionsView(db,id);
  return {...options,logistics,id:o.id,number:o.number,platform:o.platform,orderType:o.orderType,status:o.status,stage:o.stage,canCancel:o.canCancel,createdAt:o.createdAt,items:items.map(({productSnapshot,position,...item})=>({...item,...purchaseItemPrice({...item,position},presentation.find(b=>b.status!=="void")),...readProductMedia(productSnapshot),...(itemOptions[item.id] ?? {remark:"",attachments:[]})})),bills:bills.map(b=>({...b,paymentMethod:presentation.find(p=>p.id===b.id)?.paymentMethod??null,paymentMethods:presentation.find(p=>p.id===b.id)?.paymentMethods??[],paymentHistory:presentation.find(p=>p.id===b.id)?.paymentHistory??[],dueCents:b.status==="void"?0:Math.max(0,b.totalCents-b.paidCents),overpaidCents:Math.max(0,b.paidCents-b.totalCents)})),fulfillment:remote[0]??null};
}
export async function listCustomerPurchases(db: Database, customerId: string, raw: unknown) {
  const input=parseInput(customerPurchaseListInput,raw), where=customerPurchaseWhere(customerId,input.q,input.status);
  const total=(await db.select({n:count()}).from(procurementOrders).where(where))[0].n;
  const rows=await db.select({id:procurementOrders.id}).from(procurementOrders).where(where).orderBy(desc(procurementOrders.createdAt),desc(procurementOrders.id)).limit(input.pageSize).offset((input.page-1)*input.pageSize);
  return {items:await Promise.all(rows.map(r=>customerPurchase(db,customerId,r.id))),total,page:input.page,pageSize:input.pageSize,counts:await customerPurchaseCounts(db,customerId,input)};
}
/** One atomic D1 batch: bill transition, balance and immutable ledger either all commit or all roll back. */
export async function payPurchaseBill(db: Database, actor: Actor, id: string, confirmation?: {billVersion?:number;amountCents?:number}) {
  await customerPurchase(db,actor.id,id);
  const b=(await db.select().from(procurementBills).where(and(eq(procurementBills.orderId,id),eq(procurementBills.customerId,actor.id),sql`${procurementBills.status} != 'void'`)))[0];
  if(!b)return missing();if(b.status==="paid")return customerPurchase(db,actor.id,id);
  const due=Math.max(0,b.totalCents-b.paidCents);
  if (b.paidCents>0 && (confirmation?.billVersion!==b.version || confirmation?.amountCents!==due)) conflict("Confirm the current bill version and remaining amount before paying the balance.");
  if (confirmation?.billVersion!==undefined && confirmation.billVersion!==b.version || confirmation?.amountCents!==undefined && confirmation.amountCents!==due) conflict("The bill changed. Refresh before paying.");
  const tx=b.paidCents>0?`purchase:${b.id}:v${b.version}`:`purchase:${b.id}`,now=Date.now();
  await db.batch([
    db.insert(walletTransactions).select(sql`SELECT ${tx},w.user_id,'PURCHASE_PAYMENT',-${due},${b.currency},w.balance_fen,w.balance_fen-${due},'procurement',${id},'Purchase bill payment',${now}
      FROM wallets w JOIN procurement_bills b ON b.id=${b.id} JOIN procurement_orders o ON o.id=b.order_id
      WHERE w.user_id=${actor.id} AND b.status='issued' AND b.version=${b.version} AND b.total_cents=${b.totalCents} AND b.paid_cents=${b.paidCents} AND o.status='draft' AND w.balance_fen>=${due}
      AND NOT EXISTS (SELECT 1 FROM purchase_stripe_payments s JOIN payments p ON p.id=s.id WHERE s.order_id=o.id AND p.risk_status IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM purchase_stripe_payments WHERE bill_id=b.id AND state IN ('pending','review'))
      AND b.currency=COALESCE((SELECT customer_currency FROM platform_settings LIMIT 1),'USD')`),
    db.update(wallets).set({balanceFen:sql`${wallets.balanceFen}-${due}`}).where(sql`user_id=${actor.id} AND EXISTS (SELECT 1 FROM wallet_transactions WHERE id=${tx}) AND EXISTS (SELECT 1 FROM procurement_bills WHERE id=${b.id} AND status='issued' AND version=${b.version})`),
    db.update(procurementBills).set({status:"paid",paidCents:b.paidCents+due,paidAt:now,version:sql`${procurementBills.version}+1`}).where(sql`id=${b.id} AND status='issued' AND version=${b.version} AND EXISTS (SELECT 1 FROM wallet_transactions WHERE id=${tx})`),
    db.update(purchaseCouponRedemptions).set({state:"redeemed",updatedAt:now}).where(and(eq(purchaseCouponRedemptions.billId,b.id),eq(purchaseCouponRedemptions.state,"reserved"),sql`EXISTS (SELECT 1 FROM procurement_bills WHERE id=${b.id} AND status='paid')`)),
  ]);
  const result=await customerPurchase(db,actor.id,id);
  if(!result.bills.some(b=>b.status==="paid"))conflict("Insufficient wallet balance, currency changed, or the bill is no longer payable.");
  return result;
}
export async function remotePurchaseView(db:Database,id:string) {
  const row=(await db.select().from(procurementRemote).where(eq(procurementRemote.orderId,id)))[0];
  if(!row)return null;
  const manualSource=row.channel === "manual" ? (await db.select().from(purchaseQuotes).where(eq(purchaseQuotes.id,row.quoteId)))[0] : null;
  const attempts=await db.select({action:purchaseAttempts.action,state:purchaseAttempts.state,createdAt:purchaseAttempts.createdAt,updatedAt:purchaseAttempts.updatedAt}).from(purchaseAttempts).where(eq(purchaseAttempts.orderId,id));
  const lastResult = record(JSON.parse(row.lastResult ?? "{}"));
  return {
    ...row,
    manual: manualSource ? record(JSON.parse(manualSource.preview)).manualInput : undefined,
    syncLockToken: undefined,
    syncLockedUntil: undefined,
    canSync: !!row.remoteId || (row.channel !== "manual" && !!createdRemoteId(lastResult, id)),
    remoteCostCnyCents: remoteAmount(lastResult, row.channel),
    state: ["creating", "paying"].includes(row.state) && row.updatedAt < Date.now() - 60000 ? "unknown" : row.state,
    lastResult: undefined,
    attempts: attempts.map(a => ({ ...a, state: a.state === "executing" && a.updatedAt < Date.now() - 60000 ? "unknown" : a.state })),
  };
}
export async function performPurchaseAction(db: Database, token: string, actor: Actor, id: string, action:"create"|"sync"|"pay"|"cancel", reason?:string, maxCostCnyCents?:number, syncDeadline?:number) {
  const r=(await db.select().from(procurementRemote).where(eq(procurementRemote.orderId,id)))[0];if(!r)return missing();
  if(r.channel === "manual" && action === "create") { await submitManualPurchase(db,token,actor,id); return remotePurchaseView(db,id); }
  const q=(await db.select().from(purchaseQuotes).where(eq(purchaseQuotes.id,r.quoteId)))[0];
  const o=(await db.select().from(procurementOrders).where(eq(procurementOrders.id,id)))[0];
  if(r.channel === "manual" && q.pricing === "{}") conflict("Retry the original manual submission to recover its complete fee and item snapshot.");
  if(action==="sync"){
    // Recover only an identity in our persisted, successful response, never by guessing a remote ID.
    if(!r.remoteId){
      const saved=record(JSON.parse(r.lastResult??"{}"));
      if(saved.success===true)r.remoteId=createdRemoteId(saved,id);
    }
    if(!r.remoteId)conflict("The remote order id is unknown. Review the original operation with HioBuy; do not submit again.");
    const result=requireProcurementResult(await callProcurement(token,"orderDetail",{channel:r.channel,order_id:r.remoteId,response_format:"standard"}));
    if (syncDeadline !== undefined && Date.now() >= syncDeadline) throw new AppError("PURCHASE_SYNC_DEADLINE", "Purchase sync will retry in a later polling round.", 503);
    const order=record(result.order),returnedId=stringId(order.order_id??order.id??result.order_id);
    if(returnedId!==r.remoteId)conflict("Remote order identity did not match.");
    const status=typeof order.status==="string"&&/^[a-zA-Z_0-9-]{1,60}$/.test(order.status)?order.status:null;
    const payment = purchaseDetailPayment(result);
    const cancelled=["cancelled","canceled","closed"].includes(String(status).toLowerCase());
    const amount=remoteAmount(result,r.channel);
    let paid = payment === "paid";
    if (payment === "paid_at" && amount !== null) {
      const [attempt] = await db.select({ request: purchaseAttempts.request }).from(purchaseAttempts)
        .where(and(eq(purchaseAttempts.orderId, id), eq(purchaseAttempts.action, "pay")));
      const requested = attempt && record(JSON.parse(attempt.request)).pay_amount;
      paid = requested == null || requested === amount;
    }
    const reviewPayment = !paid && payment !== "unconfirmed" && r.paymentStatus !== "paid";
    const mismatch=r.channel === "manual" && !paid && r.paymentStatus === "unpaid" ? amount === null || amount !== r.costCnyCents : await costCoverage(db,id,amount)!=="covered";
    const [synced] = await db.batch([
      db.update(procurementRemote).set({syncNextAt:Date.now()+5*60_000,remoteId:r.remoteId,remoteStatus:status,lastResult:JSON.stringify(result),updatedAt:Date.now(),...(["unknown","creating","review_required"].includes(r.state)?{state:mismatch?"review_required":"created"}:{}),...(paid?{paymentStatus:"paid",state:"created",paidCostCnyCents:sql`COALESCE(${procurementRemote.paidCostCnyCents}, ${amount})`}:{}),...(reviewPayment?{paymentStatus:"unknown"}:{}),...(mismatch?{state:"review_required"}:{}),...(cancelled?{state:"cancelled"}:{})}).where(and(eq(procurementRemote.orderId,id),eq(procurementRemote.updatedAt,r.updatedAt))).returning({orderId:procurementRemote.orderId}),
      db.update(purchaseAttempts).set({state:"succeeded",updatedAt:Date.now()}).where(and(eq(purchaseAttempts.orderId,id),eq(purchaseAttempts.action,paid?"pay":"cancel"),sql`${paid||cancelled?1:0}=1 AND changes()=1`)),
      db.update(purchaseAttempts).set({state:"succeeded",updatedAt:Date.now()}).where(and(eq(purchaseAttempts.orderId,id),eq(purchaseAttempts.action,"create"),sql`EXISTS (SELECT 1 FROM procurement_remote WHERE order_id=${id} AND remote_id=${r.remoteId})`)),
    ]);
    if (!synced.length) conflict();
    if (!cancelled) {
      const { syncPurchaseFulfillment } = await import("./purchase-fulfillment");
      await syncPurchaseFulfillment(db, token, actor, id, order, syncDeadline);
    }
    return remotePurchaseView(db,id);
  }
  const previous=(await db.select().from(purchaseAttempts).where(and(eq(purchaseAttempts.orderId,id),eq(purchaseAttempts.action,action))))[0];
  if(previous)return remotePurchaseView(db,id);
  if(o.status!=="draft")conflict();
  let body: Record<string,unknown>;
  let confirmedPayAmount: number | undefined;
  if(action==="create"){
    if(r.state!=="ready")conflict();
    const req=JSON.parse(q.request) as PurchaseInput & {receiver:unknown};
    if(JSON.stringify(req.receiver)!==JSON.stringify(await receiver(db,o.customerId)))conflict("The receiving address changed. Review the purchase before submission.");
    // Obtain a fresh Weidian preview id and verify the approved cost before any real order creation.
    const fresh=requireProcurementResult(await callProcurement(token,"preview",{...req,response_format:"standard"}));
    const pricing=JSON.parse(q.pricing) as ProductQuote;
    let priced:ReturnType<typeof pricePurchase>;
    try {priced=pricePurchase(req,fresh,pricing.policy);}catch{conflict("The latest preview is not valid. Review this purchase.");}
    const old=record(JSON.parse(q.preview));
    if(priced!.sellerId!==stringId(record((old.sellers as unknown[])[0]).seller_id))conflict("The purchase seller changed. Review before submitting.");
    if(maxCostCnyCents!==undefined && priced!.costCnyCents>maxCostCnyCents)conflict("The HioBuy cost exceeds your confirmed payment limit. Review the order before paying.");
    if(await costCoverage(db,id,priced!.costCnyCents)!=="covered")conflict("Customer receipts do not cover the HioBuy cost, or the historical exchange rate is unavailable.");
    body=r.channel==="weidian"?{channel:r.channel,preview_id:fresh.preview_id,direct_pay:false,response_format:"standard"}:{...req,response_format:"standard",out_order_id:id,external_order_id:id,outer_purchase_id:id,support_partial_success:false,need_supplychain_service:false};
  }else{
    if(!r.remoteId||!(r.state==="created"||(action==="cancel"&&r.state==="review_required")))conflict("Only a confirmed remote order can be paid or cancelled.");
    body={channel:r.channel,order_id:r.remoteId,response_format:"standard"};
    if(action==="cancel"){if(!reason)conflict("Enter a cancellation reason.");body.cancel_reason=reason;}
    if(action==="pay"){
      if(r.paymentStatus!=="unpaid")conflict("Payment already submitted. Query the order instead of paying again.");
      const detail=requireProcurementResult(await callProcurement(token,"orderDetail",body));
      const remoteOrder=record(detail.order);
      if(stringId(remoteOrder.order_id??remoteOrder.id??detail.order_id)!==r.remoteId)conflict("Remote order identity did not match.");
      const amount=remoteAmount(detail,r.channel);
      if (purchaseDetailPayment(detail) !== "unconfirmed") conflict("HioBuy reports a payment for this order. Refresh remote status before paying.");
      if(r.channel === "manual" && amount !== r.costCnyCents) conflict("Manual purchase cost or payment state changed. Refresh remote status before paying.");
      if(await costCoverage(db,id,amount)!=="covered")conflict("Customer receipts do not cover the HioBuy cost, or the historical exchange rate is unavailable.");
      if(maxCostCnyCents!==undefined && (amount===null || amount>maxCostCnyCents))conflict("The HioBuy cost exceeds your confirmed payment limit. Review the order before paying.");
      confirmedPayAmount=Number(amount);
      if(r.channel!=="manual")body.pay_amount=amount;
    }
  }
  const attemptId=`purchase-${action}-${crypto.randomUUID()}`,now=Date.now(),expected=action==="create"?"ready":r.state;
  const [claimed]=await db.batch([
    db.insert(purchaseAttempts).select(sql`SELECT ${attemptId},${id},${action},'executing',${JSON.stringify(body)},NULL,${actor.id},${now},${now}
      WHERE EXISTS (SELECT 1 FROM procurement_remote r JOIN procurement_orders o ON o.id=r.order_id WHERE r.order_id=${id} AND r.state=${expected} AND o.status='draft' AND (${action}<>'pay' OR r.payment_status='unpaid'))
      AND (${action}='cancel' OR NOT EXISTS (SELECT 1 FROM purchase_stripe_payments s JOIN payments p ON p.id=s.id WHERE s.order_id=${id} AND p.risk_status IS NOT NULL))
      AND (${action}='cancel' OR EXISTS (SELECT 1 FROM procurement_bills WHERE order_id=${id} AND status='paid'))`).onConflictDoNothing().returning({id:purchaseAttempts.id}),
    db.update(procurementRemote).set({state:action==="create"?"creating":action==="cancel"?"cancel_pending":"paying",updatedAt:now}).where(and(eq(procurementRemote.orderId,id),sql`EXISTS (SELECT 1 FROM purchase_attempts WHERE id=${attemptId} AND state='executing' AND created_at=${now})`)),
    db.insert(auditLogs).select(sql`SELECT ${crypto.randomUUID()},${actor.id},${actor.email},${`procurement.remote.${action}`},${id},'{}',${now} WHERE EXISTS (SELECT 1 FROM purchase_attempts WHERE id=${attemptId} AND created_at=${now})`),
  ]);
  if(!claimed.length)conflict("The order requires a paid customer bill or another operation is already in progress.");
  const result=await callProcurement(token,action,body,attemptId),data=result.data;
  const success=!result.uncertain&&result.status>=200&&result.status<300&&data.success!==false&&!data.error;
  const remoteId=action==="create"?createdRemoteId(data,id):r.remoteId;
  const confirmed=success&&!!remoteId&&data.pending!==true;
  let settled=action==="pay"&&confirmed&&data.success===true&&data.payment_status==="success";
  if (action === "pay" && confirmed && data.success === true && data.payment_status == null && (!data.order_sn || data.order_sn === remoteId)) {
    const lookup = await callProcurement(token, "orderDetail", { channel: r.channel, order_id: remoteId, response_format: "standard" });
    const detail = lookup.data;
    const order = record(detail.order);
    const payment = purchaseDetailPayment(detail);
    settled = !lookup.uncertain && lookup.status >= 200 && lookup.status < 300 && detail.success !== false && !detail.error &&
      stringId(order.order_id ?? order.id ?? detail.order_id) === remoteId &&
      remoteAmount(detail, r.channel) === confirmedPayAmount && (payment === "paid" || payment === "paid_at");
  }
  const creationCoverage=action==="create"&&confirmed?await costCoverage(db,id,remoteAmount(data,r.channel)):null;
  const state=action==="create"?(confirmed?(creationCoverage!==null&&creationCoverage!=="covered"?"review_required":"created"):"unknown"):action==="cancel"?"cancel_pending":"created";
  const attemptState=action==="pay"?(settled?"succeeded":"unknown"):confirmed?"succeeded":"unknown";
  await db.batch([
    db.update(purchaseAttempts).set({state:attemptState,result:JSON.stringify(data),updatedAt:Date.now()}).where(and(eq(purchaseAttempts.id,attemptId),eq(purchaseAttempts.state,"executing"))),
    db.update(procurementRemote).set({state,remoteId:remoteId??r.remoteId,lastResult:JSON.stringify(data),updatedAt:Date.now(),...(action==="pay"?{paymentStatus:settled?"paid":"unknown",...(settled?{paidCostCnyCents:sql`COALESCE(${procurementRemote.paidCostCnyCents}, ${Number(confirmedPayAmount)})`}:{})}:{})}).where(and(eq(procurementRemote.orderId,id),eq(procurementRemote.updatedAt,now),eq(procurementRemote.state,action==="create"?"creating":action==="pay"?"paying":"cancel_pending"))),
  ]);
  return remotePurchaseView(db,id);
}

/** Explicit operator reconciliation; never creates or pays an upstream order. */
export async function reconcilePurchase(db:Database,token:string,actor:Actor,id:string,remoteId:string,reason:string){
  const r=(await db.select().from(procurementRemote).where(eq(procurementRemote.orderId,id)))[0];if(!r)return missing();
  if(r.channel === "manual") conflict("Retry the original manual submission to recover its complete fee and item snapshot.");
  const attempt=(await db.select().from(purchaseAttempts).where(and(eq(purchaseAttempts.orderId,id),eq(purchaseAttempts.action,"create"))))[0];
  if(!attempt||attempt.updatedAt>Date.now()-60000||!["unknown","executing"].includes(attempt.state)||r.remoteId&&r.remoteId!==remoteId)conflict("Only an unresolved submission can be reconciled after its request has ended.");
  const result=requireProcurementResult(await callProcurement(token,"orderDetail",{channel:r.channel,order_id:remoteId,response_format:"standard"}));
  const order=record(result.order),returnedId=stringId(order.order_id??order.id??result.order_id);
  const amount=remoteAmount(result,r.channel);
  const external=stringId(order.out_order_id??order.external_order_id??order.outer_purchase_id);
  if(returnedId!==remoteId||external&&external!==id)conflict("Remote identity or external reference did not match. Contact HioBuy for reconciliation.");
  const coverage=await costCoverage(db,id,amount);
  const now=Date.now(),entry=audit(actor,"reconcile",id);
  const [changed]=await db.batch([
    db.update(procurementRemote).set({remoteId,state:coverage==="covered"?"created":"review_required",lastResult:JSON.stringify(result),updatedAt:now}).where(and(eq(procurementRemote.orderId,id),eq(procurementRemote.state,r.state),eq(procurementRemote.updatedAt,r.updatedAt),r.remoteId?eq(procurementRemote.remoteId,r.remoteId):sql`${procurementRemote.remoteId} IS NULL`)).returning({id:procurementRemote.orderId}),
    db.update(purchaseAttempts).set({state:"succeeded",result:JSON.stringify(result),updatedAt:now}).where(and(eq(purchaseAttempts.id,attempt.id),sql`EXISTS (SELECT 1 FROM procurement_remote WHERE order_id=${id} AND remote_id=${remoteId} AND updated_at=${now})`)),
    db.insert(auditLogs).select(sql`SELECT ${entry.id},${actor.id},${actor.email},${entry.action},${id},${JSON.stringify({remoteId,reason})},${now} WHERE EXISTS (SELECT 1 FROM procurement_remote WHERE order_id=${id} AND remote_id=${remoteId} AND updated_at=${now})`),
  ]);
  if(!changed.length)conflict();
  return remotePurchaseView(db,id);
}
