import { formatCnyRate } from "../../domain/exchange-rates";
import { useI18n as useAdminI18n } from "../lib/i18n";
import { ProcurementProductImage } from "./ProcurementProductImage";
import { Check, Package } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useI18n } from "../lib/i18n";
import type { ProcurementDetail } from "../../types/operations";
import { previewMoney as money } from "./preview/shared";

export function DetailCard({title,hint,children}:{title:string;hint?:string;children:ReactNode}){
  const {t}=useI18n();
  return <section className="rounded-xl border border-line bg-white p-5 sm:p-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{t(title)}</h3>{hint&&<span className="text-xs text-slate-400">{t(hint)}</span>}</div>{children}</section>;
}

export function ProcurementSteps({order}:{order:ProcurementDetail}){
  const {t}=useI18n(),v=order.overview;
  const paid=v?.payment==="paid",submitted=!!v?.remoteId,received=!!v?.ordered&&v.received>=v.ordered;
  const packed=v?.stage==="packed"||v?.stage==="shipped",shipped=v?.stage==="shipped";
  const steps=[{label:"Awaiting payment",done:paid},{label:"Pending processing",done:submitted},{label:"Procurement in progress",done:received},{label:"Fully received",done:packed},{label:"Consolidated",done:shipped},{label:"Shipped",done:shipped}];
  const current=steps.findIndex(s=>!s.done);
  return <ol className="mb-7 grid grid-cols-6 gap-1 pt-1" aria-label={t("Procurement progress")}>{steps.map((step,i)=><li key={step.label} className="relative text-center" aria-current={i===current?"step":undefined}>{i<5&&<span className="absolute top-4 right-[-12%] left-[72%] h-px bg-slate-200"/>}<span className={`relative mx-auto grid size-8 place-items-center rounded-full border text-xs ${step.done?"border-indigo-100 bg-indigo-50 text-indigo-500":i===current?"border-indigo-500 bg-indigo-600 text-white ring-4 ring-indigo-50":"border-slate-200 text-slate-400"}`}>{step.done?<Check size={14}/>:i+1}</span><p className={`mt-2 text-[10px] leading-4 sm:text-xs ${i===current?"text-indigo-600":"text-slate-400"}`}>{t(step.label)}</p></li>)}</ol>;
}

export function ProcurementProductsCard({order}:{order:ProcurementDetail}){
  const { t: tr } = useAdminI18n();
  const {t}=useI18n();
  return <DetailCard title={tr("Product details")} hint={t("{styles} products · {quantity} items",{styles:order.items.length,quantity:order.items.reduce((n,i)=>n+i.quantity,0)})}><div className="divide-y divide-line">{order.items.map((item,i)=><div key={item.id} className="py-4 first:pt-0 last:pb-0"><div className="flex flex-wrap gap-3"><ProcurementProductImage key={item.imageUrl} url={item.imageUrl} name={item.name}/><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{item.sourceUrl?<a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600">{item.name}</a>:item.name}</p><p className="mt-1 break-all text-xs text-slate-400"><span className="mr-2 rounded bg-orange-50 px-1 text-orange-600">{order.platform}</span>{item.variantLabel||item.sku} · ×{item.quantity}</p><p className="mt-2 text-[11px] text-slate-400">{t("Product {index} · Order snapshot",{index:i+1})}</p></div><div className="shrink-0 text-right"><strong className="text-sm">{item.sellingLineCents!=null&&item.sellingCurrency?money(item.sellingLineCents,item.sellingCurrency):money(item.quantity*item.unitPriceCents,order.currency)}</strong><p className="mt-2 text-[11px] text-slate-400">{t("Unit procurement cost")} {money(item.unitPriceCents,order.currency)}</p></div></div>{(item.remark || !!item.attachments?.length) && <div className="mt-3 rounded-lg bg-slate-50 p-3">
      <p className="mb-2 text-xs font-medium text-slate-500">{t("SKU instructions")}</p>
      {item.remark && <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{item.remark}</p>}
      {!!item.attachments?.length && <div className="mt-2 flex flex-wrap gap-3">{item.attachments.map(image => <a key={image.id} href={image.url} target="_blank" rel="noreferrer" className="flex w-24 flex-col gap-1 text-xs text-indigo-600"><img src={image.url} alt={t("Order attachment")} loading="lazy" className="h-24 w-24 rounded-lg border object-contain"/><span>{t("View attachment")}</span></a>)}</div>}
    </div>}</div>)}</div></DetailCard>;
}

export function ProcurementFeesCard({order}:{order:ProcurementDetail}){
  const { t: tr } = useAdminI18n();
  const {t}=useI18n(),bill=order.bills.find(b=>b.status!=="void");
  const rows=bill?[["Goods",money(bill.goodsCents,bill.currency)],["Domestic shipping",money(bill.shippingCents,bill.currency)],["Service fee",money(bill.serviceCents,bill.currency)]]:[["Goods",money(order.goodsCents,order.currency)],["Domestic shipping",money(order.shippingCents,order.currency)]];
  return <DetailCard title={tr("Fee breakdown")} hint={tr("Procurement charges · International freight excluded")}><dl className="space-y-4 text-sm">{rows.map(([label,value])=><div key={label} className="flex justify-between gap-3"><dt className="text-slate-400">{t(label)}</dt><dd>{value}</dd></div>)}{bill&&<div className="flex justify-between gap-3"><dt className="text-slate-400">{t("Order exchange rate")}</dt><dd>{bill.exchangeRate?`1 CNY = ${formatCnyRate(bill.exchangeRate)} ${bill.currency}`:"—"}</dd></div>}<div className="flex justify-between gap-3 border-t border-line pt-4"><dt>{t(bill?"Customer bill":"Draft total")}</dt><dd className="text-lg font-semibold">{money(bill?.totalCents??order.totalCents,bill?.currency??order.currency)}</dd></div><div className="flex justify-between"><dt className="text-slate-400">{t("Customer payment")}</dt><dd className={`rounded px-2 py-1 text-xs ${bill?.status==="paid"?"bg-teal-50 text-teal-700":"bg-amber-50 text-amber-700"}`}>{t(bill?.status==="paid"?"Paid":bill?"Awaiting payment":"Not billed")}</dd></div>{bill && <><div className="flex justify-between gap-3"><dt>{t("Amount paid")}</dt><dd>{money(bill.paidCents??0,bill.currency)}</dd></div><div className="flex justify-between gap-3"><dt>{t("Amount due")}</dt><dd className="font-semibold text-indigo-600">{money(bill.dueCents??0,bill.currency)}</dd></div>{!!bill.overpaidCents && <div className="flex justify-between gap-3 text-amber-700"><dt>{t("Overpayment pending review")}</dt><dd>{money(bill.overpaidCents,bill.currency)}</dd></div>}</>}</dl>{bill?.estimated && <p className="mt-3 text-xs text-amber-700">{t("Estimated manual order bill. Confirmed costs may require an additional payment.")}</p>}</DetailCard>;
}

export function ProcurementArrivalCard({order}:{order:ProcurementDetail}){
  const { t: tr } = useAdminI18n();
  const {t}=useI18n(),v=order.overview,parcels=v?.packages??[];
  const arrived=parcels.filter(p=>["RECEIVED","CONSOLIDATED","SHIPPED","DELIVERED"].includes(p.status)).length;
  const received=v?.received??order.receiving.items.reduce((n,i)=>n+i.received,0),ordered=v?.ordered??order.items.reduce((n,i)=>n+i.quantity,0);
  return <><DetailCard title={tr("Procurement arrival overview")}><div className="mb-5 flex justify-between gap-3 text-sm"><span className="text-slate-400">{t("Linked procurement order")}</span><strong className="break-all">{v?.remoteId??t("No remote order yet")}</strong></div><div className="grid grid-cols-3 gap-2">{[["Arrived packages",`${arrived} / ${parcels.length}`],["Received quantity",`${received} / ${ordered}`],["Open aftersales",String(order.receiving.openCases)]].map(([label,value])=><div key={label} className="rounded-lg bg-[#f7f7fc] p-3"><p className="text-[11px] text-slate-400">{t(label)}</p><p className="mt-2 text-lg font-semibold">{value}</p></div>)}</div><div role="progressbar" aria-label={t("Received quantity")} aria-valuemin={0} aria-valuemax={ordered||1} aria-valuenow={received} className="mt-5 h-1.5 overflow-hidden rounded-full bg-indigo-50"><div className="h-full bg-indigo-500" style={{width:`${ordered?Math.min(100,received/ordered*100):0}%`}}/></div><p className="mt-3 text-xs text-slate-400">{t("Consolidation eligibility is checked on the package page.")}</p></DetailCard>
  {!parcels.length?<section className="grid min-h-56 place-items-center rounded-xl border border-line bg-white p-6 text-center"><div><Package className="mx-auto mb-5 text-indigo-200" size={36}/><h3 className="font-semibold">{t("No linked domestic packages")}</h3><p className="mt-3 text-sm text-slate-400">{t("Link the domestic packages to track arrival and inspection.")}</p></div></section>:<DetailCard title={tr("Warehouse packages / Domestic tracking")}>{parcels.map(p=><div key={p.id} className="flex flex-wrap justify-between gap-2 border-b border-line py-3 last:border-0"><Link to={`/admin/packages/${p.id}`} className="text-sm text-indigo-600">{p.publicId}</Link><span className="break-all text-xs text-slate-400">{p.tracking}</span></div>)}</DetailCard>}</>;
}
