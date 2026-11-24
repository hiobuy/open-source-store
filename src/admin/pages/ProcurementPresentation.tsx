import { ProcurementCostSummary } from "./ProcurementCostSummary";
import { ProcurementAmounts } from "./ProcurementAmounts";
import { useI18n as useAdminI18n } from "../lib/i18n";
import { ProcurementProductImage } from "./ProcurementProductImage";
import { useState } from "react";
import { Link } from "react-router";
import { Send } from "lucide-react";
import { Button, Dialog, CopyButton } from "../components/ui";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { ProcurementOrder } from "../../types/operations";
import { PreviewBadge, previewMoney as money } from "./preview/shared";

export const stageLabels:Record<string,string>={draft:"Awaiting customer payment",awaiting_payment:"Awaiting customer payment",pending:"Pending processing",buying:"Purchasing",transit:"Awaiting warehouse arrival",awaiting_receipt:"Awaiting warehouse arrival",partial:"Partially received",stocked:"In warehouse",packed:"Packed for forwarding",shipped:"Shipped",exception:"Exception orders",after:"Aftersales in progress",cancelled:"Cancelled"};
export const paymentLabels:Record<string,string>={paid:"Paid",issued:"Awaiting payment",unbilled:"Not billed"};
export const eligibleForPush=(order:ProcurementOrder)=>order.status==="draft"&&order.overview?.payment==="paid"&&order.remote?.state==="ready";

export function OrderSummaryCells({order:o,open}:{order:ProcurementOrder;open:()=>void}) {
  const {t,locale}=useI18n(),v=o.overview;
  return <><td className="min-w-[360px] max-w-[480px]"><div className="flex flex-wrap items-center gap-2"><button className="break-all text-left text-xs font-semibold text-slate-700 hover:text-indigo-600" onClick={open}>{o.number}</button><CopyButton value={o.number} iconOnly variant="ghost" size="sm" className="h-5 w-5 text-slate-400"/><span className="rounded bg-orange-50 px-1.5 py-1 text-[10px] font-semibold text-orange-600">{o.platform}</span>{o.orderType==="manual"&&<span className="text-xs text-indigo-600">{t("Manual order")}</span>}<span className="rounded bg-indigo-50 px-1.5 py-1 text-[10px] text-indigo-600">• {t(stageLabels[v?.stage??o.status]??"Purchase under review")}</span><time className="text-[10px] text-slate-400" title={new Date(o.createdAt).toLocaleString(locale)}>{new Date(o.createdAt).toLocaleString(locale,{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}</time></div>
    {o.items.map(item=><div key={item.id} className="mt-3 flex items-start gap-3"><div className="[&>button]:size-16 [&>span]:size-16"><ProcurementProductImage key={item.imageUrl} url={item.imageUrl} name={item.name}/></div><div className="min-w-0 flex-1"><p className="break-words text-xs font-medium">{item.sourceUrl?<a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600">{item.name}</a>:item.name}</p><p className="mt-1 break-words text-[11px] text-slate-400">{item.variantLabel||item.sku||"—"}</p><div className="mt-1.5 flex items-end justify-between gap-3"><div>{item.sellingLineCents!=null&&item.sellingCurrency&&<p className="text-xs font-semibold">{item.sellingLineCents%item.quantity?"≈ ":""}{money(item.sellingLineCents/item.quantity,item.sellingCurrency)}</p>}<p className="mt-1 text-[10px] text-slate-400">{t("Unit procurement cost")}: {money(item.unitPriceCents,o.currency)} / {t("Unit")}</p></div><strong className="shrink-0 text-sm">× {item.quantity}</strong></div></div></div>)}</td>
    <td className="min-w-40"><ProcurementAmounts overview={v}/><div className="mt-3"><PreviewBadge>{t(paymentLabels[v?.payment??"unbilled"])}</PreviewBadge></div></td>
    <td className="min-w-32"><div className="flex gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-500">{o.customer.trim().slice(0,2).toUpperCase()}</span><div><p>{o.customer}</p><p className="mt-1 text-xs text-slate-400">{o.member}</p><p className="mt-3 text-xs text-slate-400">{t("Country")}: {o.country||"—"}</p></div></div></td>
    <td className="min-w-40"><ProcurementCostSummary order={o} open={open}/></td>
    <td className="min-w-44"><p className="mb-2 text-xs text-slate-500">{t("Received quantity")}: {v?.received??0} / {v?.ordered??o.items.reduce((n,i)=>n+i.quantity,0)}</p>{v?.packages.length?v.packages.map(p=><div key={p.id} className="mt-2"><Link className="text-xs font-medium text-indigo-700" to={`/admin/packages/${p.id}`}>{p.publicId}</Link><p className="mt-1 break-all text-xs text-slate-400">{p.tracking||"—"}</p></div>):<p className="text-xs text-slate-400">{t("No linked packages")}</p>}{!!v?.openCases&&<p className="mt-2 text-xs text-red-600">{t("Open cases: {count}",{count:v.openCases})}</p>}</td></>;
}

export function BatchPurchasePush({orders,onClose,refresh}:{orders:ProcurementOrder[];onClose:()=>void;refresh:()=>Promise<void>}){
  const { t: tr } = useAdminI18n();
  const {t}=useI18n(),[busy,setBusy]=useState(false),[started,setStarted]=useState(false),[results,setResults]=useState<{id:string;message:string}[]>([]);
  const eligible=orders.filter(eligibleForPush);
  const submit=async()=>{
    setStarted(true);setBusy(true);
    try{for(const order of eligible){
      let message:string;
      try{const r=await api<{state:string}>(`/api/admin/procurement/${order.id}/remote/create`,{method:"POST",body:JSON.stringify({confirm:true})});message=r.state==="created"?"Purchase submitted":r.state==="review_required"?"Purchase under review":"Unknown results require reconciliation. Repeated clicks do not submit another order or payment. Cancellation does not refund the customer wallet.";}
      catch(error){message=error instanceof Error?error.message:"Could not submit order.";}
      setResults(previous=>[...previous,{id:order.number,message}]);
    }}finally{setBusy(false);await refresh();}
  };
  return <Dialog open title={tr("Batch submit to HioBuy")} onClose={()=>{if(!busy)onClose();}}><div className="space-y-4"><p className="text-sm text-slate-500">{t("Only paid, unsubmitted orders are eligible. Creates procurement orders without paying HioBuy.")}</p><p>{t("Eligible orders: {count}",{count:eligible.length})} / {orders.length}</p><ul className="max-h-56 space-y-2 overflow-auto">{orders.map(o=><li key={o.id} className="break-all rounded border border-line p-3 text-sm">{o.number}<p>{eligibleForPush(o)?money(o.totalCents,o.currency):t("Skipped: payment or submission state is not eligible.")}</p></li>)}</ul><p>{t("Confirmed procurement cost")}: {money(eligible.reduce((sum,o)=>sum+o.totalCents,0),"CNY")}</p>
    {results.map(r=><p key={r.id} className="break-all text-sm" role="status">{r.id}: {t(r.message)}</p>)}<Button disabled={busy||started||!eligible.length} onClick={()=>void submit()}><Send size={14}/>{t(busy?"Submitting…":"Confirm submission")}</Button></div></Dialog>;
}

export function PaymentReminder({order,onClose}:{order:ProcurementOrder;onClose:()=>void}) {
  const { t: tr } = useAdminI18n();
  const {t}=useI18n(),[copied,setCopied]=useState(false),[error,setError]=useState(false),v=order.overview;
  const message=t("Hello {customer}, order {number} is awaiting payment of {amount}. Please open Shopping orders to complete payment.",{customer:order.customer,number:order.number,amount:v?.billCurrency?money(Math.max(0,(v.billTotalCents??0)-(v.billPaidCents??0)),v.billCurrency):"—"});
  return <Dialog open title={tr("Payment reminder draft")} onClose={onClose}><p className="mb-3 text-sm text-slate-500">{t("Copy this draft and send it yourself. No message is sent automatically.")}</p><textarea aria-label={t("Payment reminder draft")} className="min-h-36 w-full rounded-lg border border-line p-3 text-sm" readOnly value={message}/><Button onClick={async()=>{try{await navigator.clipboard.writeText(message);setCopied(true);setError(false);}catch{setError(true);}}}>{t(copied?"Copied":"Copy")}</Button>{error&&<p role="alert">{t("Copy failed. Select the text and copy it manually.")}</p>}</Dialog>;
}
