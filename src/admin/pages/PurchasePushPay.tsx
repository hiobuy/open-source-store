import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShoppingBag, Info } from "lucide-react";
import { Button, Dialog, Field, inputClass } from "../components/ui";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { ProcurementOrder } from "../../types/operations";
import { eligibleForPush } from "./ProcurementPresentation";
import { previewMoney as money } from "./preview/shared";
import { pushAndPayPurchase, type PurchaseProgress } from "../../domain/purchase-push-pay";

type Balance={balance:{availableFen:number;currency:string}};
export function PurchasePushPay({orders,requires2fa,onClose,refresh}:{orders:ProcurementOrder[];requires2fa:boolean;onClose:()=>void;refresh:()=>Promise<void>}){
  const {t}=useI18n(),client=useQueryClient();
  const [busy,setBusy]=useState(false),[started,setStarted]=useState(false),[code,setCode]=useState("");
  const [results,setResults]=useState<{number:string;message:string}[]>([]);
  const eligible=orders.filter(eligibleForPush),total=eligible.reduce((n,o)=>n+o.totalCents,0);
  const readBalance=async()=>{const data=await api<Balance>("/api/admin/settings/hiobuy-wallet");if(data.balance.currency!=="CNY"||!Number.isSafeInteger(data.balance.availableFen))throw new Error("HioBuy balance is unavailable.");return data.balance.availableFen;};
  const balance=useQuery({queryKey:["admin","purchase-push-pay-balance"],queryFn:readBalance,staleTime:0});
  const submit=async()=>{
    if(busy||started)return;setStarted(true);setBusy(true);
    try{for(const order of eligible){
      let message:string;
      try{
        const action=(kind:string)=>api<PurchaseProgress>(`/api/admin/procurement/${order.id}/remote/${kind}`,{method:"POST",body:JSON.stringify({confirm:true,...(kind==="pay"?{code}:{}),...(["pay","create"].includes(kind)?{maxCostCnyCents:order.totalCents}:{})})});
        message=await pushAndPayPurchase(order.totalCents,{balance:readBalance,create:()=>action("create"),sync:()=>action("sync"),pay:()=>action("pay")});
      }catch(error){message=error instanceof Error?error.message:"Could not submit order.";}
      setResults(previous=>[...previous,{number:order.number,message}]);
      if(message!=="Purchase submitted and paid.")break;
    }}finally{setBusy(false);await Promise.all([refresh(),client.invalidateQueries({queryKey:["admin","procurement-remote"]}),client.invalidateQueries({queryKey:["admin","hiobuy-wallet"]}),balance.refetch()]);}
  };
  return <Dialog open title={t("Confirm purchase submission and payment")} size="lg" onClose={()=>{if(!busy)onClose();}}><div className="space-y-5">
    <div className="flex gap-3"><span className="rounded-xl bg-indigo-50 p-3 text-indigo-600"><ShoppingBag size={26}/></span><p className="text-sm text-slate-500">{t("Create the HioBuy order, then pay from the HioBuy balance within the confirmed limit. The customer is not charged again.")}</p></div>
    <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-5">{[["Selected orders",orders.length],["Eligible orders",eligible.length]].map(([label,count])=><div key={label}><p className="text-sm text-slate-500">{t(String(label))}</p><strong className="mt-3 block text-2xl">{count}</strong></div>)}</div>
    <ul className="max-h-48 space-y-2 overflow-auto">{orders.map(o=><li key={o.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-line p-3 text-sm"><span className="break-all">{o.number}</span><strong>{money(o.totalCents,"CNY")}</strong>{!eligibleForPush(o)&&<p className="w-full text-amber-700">{t("Skipped: payment or submission state is not eligible.")}</p>}</li>)}</ul>
    <div className="divide-y divide-line text-sm"><div className="flex justify-between py-3"><span>{t("Current HioBuy balance")}</span><strong>{balance.data===undefined?"—":money(balance.data,"CNY")}</strong></div><div className="flex justify-between py-4"><span>{t("Confirmed maximum procurement total")}</span><strong className="text-2xl text-indigo-600">{money(total,"CNY")}</strong></div><div className="flex justify-between py-3"><span>{t("Estimated balance after all payments")}</span><strong>{balance.data===undefined||started?"—":money(balance.data-total,"CNY")}</strong></div></div>
    <p className="flex gap-2 text-xs text-slate-500"><Info size={16} className="shrink-0"/>{t("If submission or payment is uncertain, the remaining orders stop. Created orders remain for review; do not submit them again. Balance estimates are not reservations.")}</p>
    {requires2fa&&(eligible.length===1?<Field label={t("Authenticator code")}><input className={inputClass} value={code} autoComplete="one-time-code" onChange={e=>setCode(e.target.value)} disabled={busy||started}/></Field>:<p role="alert" className="text-amber-700">{t("Authenticator protection is enabled. Confirm one order at a time.")}</p>)}
    {balance.isError&&<p role="alert" className="text-red-700">{t(balance.error.message)} <Button onClick={()=>balance.refetch()}>{t("Retry")}</Button></p>}
    {balance.data!==undefined&&balance.data<total&&<p role="alert" className="text-amber-700">{t("Insufficient HioBuy balance. Order was not submitted.")}</p>}
    {results.map(result=><p key={result.number} role="status" className="break-words text-sm">{result.number}: {t(result.message)}</p>)}
    <div className="flex justify-end gap-3"><Button variant="secondary" disabled={busy} onClick={onClose}>{t(started?"Close":"Cancel")}</Button><Button loading={busy} disabled={started||!eligible.length||balance.isFetching||balance.data===undefined||balance.data<total||(requires2fa&&(eligible.length!==1||!code.trim()))} onClick={()=>void submit()}>{t("Confirm submission and payment")}</Button></div>
  </div></Dialog>;
}
