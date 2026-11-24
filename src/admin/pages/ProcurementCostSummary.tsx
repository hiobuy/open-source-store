import { Check, Clock } from "lucide-react";
import { CopyButton } from "../components/ui";
import { useI18n } from "../lib/i18n";
import type { ProcurementOrder } from "../../types/operations";
import { formatCnyFen } from "../../domain/freight";
export function ProcurementCostSummary({order,open}:{order:ProcurementOrder;open:()=>void}){
  const {t}=useI18n(),v=order.overview;
  const paid=(v?.procurementPayment??order.remote?.paymentStatus)==="paid";
  const unknown=(v?.procurementPayment??order.remote?.paymentStatus)==="unknown";
  const cost=paid?v?.paidCostCnyCents:(v?.estimatedCostCnyCents??(order.currency==="CNY"?order.totalCents:null));
  const profit=v?.profitCnyCents;
  return <div className="min-w-40 text-sm">
    <p className="text-xs text-slate-400">{t("Procurement order number")}</p>
    <div className="mt-2 flex items-center gap-1">{v?.remoteId?<><button type="button" className="break-all text-left font-medium text-indigo-600 hover:text-indigo-700" onClick={open}>{v.remoteId}</button><CopyButton value={v.remoteId} iconOnly variant="ghost" size="sm" className="size-6 shrink-0 text-slate-400"/></>:<span className="text-slate-400">{t("To be generated")}</span>}</div>
    <p className="mt-5 text-xs text-slate-400">{t(paid?"Procurement cost":"Procurement cost · Estimated")}</p>
    <strong className="mt-2 block text-base tabular-nums">{cost==null?t("Pending verification"):formatCnyFen(cost)}</strong>
    <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">{paid?<Check size={14}/>:<Clock size={14}/>} {t(paid?"Procurement settled":unknown?"Payment result unconfirmed":"Procurement unsettled")}</p>
    {paid&&profit!==undefined&&<div className="mt-4 border-t border-dashed border-line pt-4"><p className="text-xs text-slate-400" title={t("Customer receipts at the historical bill rate minus the confirmed HioBuy cost. Excludes international freight and later refunds.")}>{t("Order procurement profit")}</p><strong className={`mt-2 block text-base tabular-nums ${profit!=null&&profit<0?"text-red-600":"text-slate-800"}`}>{profit==null?t("Pending verification"):formatCnyFen(profit)}</strong></div>}
  </div>;
}
