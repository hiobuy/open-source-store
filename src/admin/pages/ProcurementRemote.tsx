import { useI18n as useAdminI18n } from "../lib/i18n";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Dialog, Field, inputClass } from "../components/ui";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { allows, useAdminAccess } from "./shared";
import { previewMoney as money } from "./preview/shared";
export { HioBuyPurchaseCreator } from "../shared/PurchaseCreator";

export const remoteLabels:Record<string,string>={"purchase.state.review_required":"Amount review required", "purchase.state.ready": "Ready", "purchase.state.creating": "Creating", "purchase.state.created": "Created", "purchase.state.unknown": "Unknown", "purchase.state.paying": "Paying", "purchase.state.cancel_pending": "Cancel pending", "purchase.state.cancelled": "Cancelled", "purchase.payment.unpaid": "Unpaid", "purchase.payment.paid": "Paid", "purchase.payment.unknown": "Unknown", "purchase.action.create": "Create", "purchase.action.pay": "Pay", "purchase.action.cancel": "Cancel", "purchase.attempt.executing": "Executing", "purchase.attempt.succeeded": "Succeeded", "purchase.attempt.unknown": "Unknown"};
type Remote = {manual?:import("../../domain/manual-purchase").ManualPurchaseInput;channel:string;canSync:boolean;remoteCostCnyCents:number|null;state:string;remoteId:string|null;remoteStatus:string|null;paymentStatus:string;costCnyCents:number;attempts:{action:string;state:string}[]};
export function ProcurementRemote({id,writable,paid,hasBill,refresh}:{id:string;writable:boolean;paid:boolean;hasBill?:boolean;refresh:()=>Promise<void>}){
  const { t: tr } = useAdminI18n();
  const {t}=useI18n(),access=useAdminAccess(),[action,setAction]=useState<"create"|"pay"|"cancel"|"reconcile"|null>(null),[reason,setReason]=useState(""),[remoteId,setRemoteId]=useState(""),[code,setCode]=useState("");
  const detail=useQuery({queryKey:["admin","procurement-remote",id],queryFn:()=>api<Remote|null>(`/api/admin/procurement/${id}/remote`)});
  const run=useMutation({mutationFn:(action:"create"|"pay"|"cancel"|"sync"|"reconcile")=>api(`/api/admin/procurement/${id}/remote/${action}`,{method:"POST",body:JSON.stringify({confirm:true,...(action==="pay"?{code,maxCostCnyCents:detail.data?.remoteCostCnyCents??detail.data?.costCnyCents}:{}),...(action==="cancel"?{reason}:action==="reconcile"?{reason,remoteId}:{})})}),onSuccess:async()=>{setAction(null);await detail.refetch();await refresh();}});
  if(detail.isPending)return <p>{t("Loading…")}</p>;
  if(detail.isError)return <p role="alert">{t(detail.error.message)} <Button onClick={()=>detail.refetch()}>{t("Retry")}</Button></p>;
  const r=detail.data;if(!r)return null;
  const label=(key:string)=>t(key)===key?(remoteLabels[key]??key):t(key);
  const attempted=(kind:string)=>r.attempts.some(a=>a.action===kind);
  return <section className="space-y-3 rounded-lg border border-line p-4"><h3 className="font-semibold">{t("HioBuy purchase")}</h3>
    <p>{t("Submission state")}: {label(`purchase.state.${r.state}`)} · {t("Payment")}: {label(`purchase.payment.${r.paymentStatus}`)}</p>
    <p className="break-all text-xs text-slate-500">{r.remoteId||t("No remote order yet")} {r.remoteStatus?`· ${r.remoteStatus}`:""}</p>
    {r.state==="review_required"&&<p role="alert" className="text-amber-700">{t("Remote amount differs from the approved quote. Review the bill before any procurement payment.")} {r.remoteCostCnyCents!==null&&money(r.remoteCostCnyCents,"CNY")}</p>}<p>{t("Confirmed procurement cost")}: {r.channel==="manual"&&!r.remoteId?"—":money(r.costCnyCents,"CNY")}</p>
    {r.channel==="manual"&&<p className="text-sm text-slate-500">{t("Manual orders are reviewed before submission. Warehouse-confirmed amounts generate the customer bill; creation does not pay HioBuy.")}</p>}
    {r.manual&&<div className="space-y-2 rounded bg-slate-50 p-3 text-sm"><p>{t("Manual order")} · {r.manual.sourcePlatform} · {r.manual.sellerName}</p><p className="whitespace-pre-wrap break-words">{r.manual.remark}</p>{r.manual.items.map((item,index)=><p key={index} className="break-words">{item.name} · {item.specification} × {item.quantity} · {t("Declared unit price (CNY)")}: {money(item.unitPriceCents,"CNY")} {item.remark}</p>)}<p>{t("Declared domestic shipping (CNY)")}: {money(r.manual.domesticShippingCents,"CNY")}</p></div>}
    {r.attempts.map(a=><p key={a.action} className="text-xs">{label(`purchase.action.${a.action}`)} · {label(`purchase.attempt.${a.state}`)}</p>)}
    {!paid&&r.channel!=="manual"&&<p className="text-sm text-amber-700">{t("Customer payment is required before submission.")}</p>}
    <p className="text-xs text-slate-500">{t("Unknown results require reconciliation. Repeated clicks do not submit another order or payment. Cancellation does not refund the customer wallet.")}</p>
    <div className="flex flex-wrap gap-2">{writable&&<>
      <Button disabled={run.isPending||(r.channel==="manual"?(hasBill&&!paid)||!["ready","unknown"].includes(r.state):!paid||r.state!=="ready"||attempted("create"))} onClick={()=>setAction("create")}>{t(r.channel==="manual"&&r.state==="unknown"?"Retry original manual submission":"Submit to HioBuy")}</Button>
      <Button variant="secondary" disabled={run.isPending||!r.canSync} onClick={()=>run.mutate("sync")}>{t("Refresh remote status")}</Button>
      {allows(access.data,"payments.money")&&<Button variant="secondary" disabled={run.isPending||!paid||r.state!=="created"||r.paymentStatus!=="unpaid"||attempted("pay")} onClick={()=>{setCode("");setAction("pay");}}>{t("Pay HioBuy purchase")}</Button>}
      <Button variant="secondary" disabled={run.isPending||!["created","review_required"].includes(r.state)||attempted("cancel")} onClick={()=>{setReason("");setAction("cancel");}}>{t("Request remote cancellation")}</Button>
      {allows(access.data,"payments.money")&&r.channel!=="manual"&&r.state==="unknown"&&!r.remoteId&&<Button variant="secondary" disabled={run.isPending} onClick={()=>{setReason("");setRemoteId("");setAction("reconcile");}}>{t("Reconcile remote order")}</Button>}
    </>}</div>{run.isError&&<p role="alert" className="text-red-700">{t(run.error.message)}</p>}
    <Dialog open={!!action} title={tr("Confirm HioBuy operation")} onClose={()=>{if(!run.isPending)setAction(null);}}><div className="space-y-4"><p>{t(action==="reconcile"?"Verify the order in HioBuy first. This links the confirmed order without creating or paying another order.":action==="pay"?"This spends the HioBuy procurement balance. It does not charge the customer again.":action==="create"?"This creates a real purchase order. It does not automatically pay HioBuy.":"Cancellation can be asynchronous. Verify the remote result before processing any refund.")}</p><p>{money(r.remoteCostCnyCents??r.costCnyCents,"CNY")}</p>{action==="pay"&&access.data?.hiobuyPay2fa&&<Field label={tr("Authenticator code")}><input className={inputClass} autoComplete="one-time-code" value={code} maxLength={40} onChange={e=>setCode(e.target.value)}/></Field>}{action==="reconcile"&&<Field label={tr("Remote order ID")}><input className={inputClass} value={remoteId} onChange={e=>setRemoteId(e.target.value)}/></Field>}{(action==="cancel"||action==="reconcile")&&<Field label={tr("Reason")}><textarea className={inputClass} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></Field>}<Button disabled={run.isPending||(action==="cancel"&&reason.trim().length<2)||(action==="reconcile"&&(!remoteId.trim()||reason.trim().length<10))} onClick={()=>action&&run.mutate(action)}>{t("Confirm")}</Button></div></Dialog>
  </section>;
}
