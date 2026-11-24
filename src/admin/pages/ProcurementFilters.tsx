import { useEffect, useRef } from "react";
import { RotateCcw, Search, ShoppingBag, SlidersHorizontal } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { inputClass } from "../components/ui";
import { stageLabels } from "./ProcurementPresentation";

type Filters = { orderType: string; query: string; status: string; platform: string; payment: string; from: string; to: string; minAmount: string };
type Props = { filters: Filters; counts: Record<string, number>; loading: boolean; expanded: boolean; onExpand: () => void; onChange: (key: keyof Filters, value: string) => void; onReset: () => void };
export function ProcurementFilters({ filters: f, counts, loading, expanded, onExpand, onChange, onReset }: Props) {
  const { t, currency } = useI18n(), search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || element?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]') || document.querySelector('[role="dialog"]')) return;
      event.preventDefault(); search.current?.focus();
    };
    window.addEventListener("keydown", focus); return () => window.removeEventListener("keydown", focus);
  }, []);
  const count = (key: string) => key === "" ? (counts.draft ?? 0) + (counts.cancelled ?? 0) : key === "awaiting_receipt" ? (counts["stage:transit"] ?? 0) + (counts["stage:partial"] ?? 0) : key === "exception" ? (counts["stage:exception"] ?? 0) + (counts["stage:after"] ?? 0) : counts[`stage:${key}`] ?? 0;
  const badge = (value: number, active = false, warning = false) => <span className={`inline-flex min-w-6 items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-medium ${active ? "bg-indigo-100 text-indigo-600" : warning ? "bg-orange-50 text-orange-600" : "bg-slate-100 text-slate-400"}`}>{loading ? "—" : value}</span>;
  const control = `${inputClass} !h-11 !rounded-lg !border-slate-200 !text-sm`;
  return <>
    <div className="flex gap-6 border-b border-line px-4 sm:px-6" role="tablist" aria-label={t("Order management")}>
      {[{key:"",label:"Order management",Icon:ShoppingBag},{key:"after",label:"Aftersales handling",Icon:RotateCcw}].map(({key,label,Icon}) => { const active = (f.status === "after") === (key === "after"); return <button key={key} type="button" role="tab" aria-selected={active} onClick={() => onChange("status",key)} className={`-mb-px flex items-center gap-2 border-b-2 py-5 text-sm ${active ? "border-indigo-600 font-semibold text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}><Icon size={19}/>{t(label)}{key === "after" && badge(count("after"),active)}</button>; })}
    </div>
    <div className="px-4 pt-3 sm:px-6">
      <div className="flex gap-5 overflow-x-auto" role="tablist" aria-label={t("Order status")}>
        {["","awaiting_payment","pending","buying","awaiting_receipt","stocked","packed","shipped","exception"].map(key => <button key={key} type="button" role="tab" aria-selected={f.status === key} onClick={() => onChange("status",key)} className={`flex shrink-0 items-center gap-2 border-b-[3px] py-4 text-sm ${f.status === key ? "border-slate-700 font-semibold text-slate-800" : "border-transparent text-slate-400 hover:text-slate-600"}`}>{t(key ? stageLabels[key] : "All purchase orders")}{badge(count(key),f.status === key,key === "exception")}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-3 py-5">
        <div className="relative min-w-0 basis-full lg:basis-auto lg:flex-1"><Search size={18} className="pointer-events-none absolute left-3 top-3 text-slate-400"/><input ref={search} className={`${control} !pl-10 !pr-10`} aria-label={t("Search shopping orders")} placeholder={t("Order, product, customer or package")} value={f.query} onChange={e=>onChange("query",e.target.value)}/><kbd className="pointer-events-none absolute right-3 top-2.5 rounded border border-slate-200 px-1.5 text-xs text-slate-400">/</kbd></div>
        <select className={`${control} !w-auto flex-1 sm:min-w-36 sm:flex-none`} aria-label={t("Platform")} value={f.platform} onChange={e=>onChange("platform",e.target.value)}><option value="">{t("All platforms")}</option>{["1688","Taobao","Weidian","jd","pinduoduo","poizon"].map(p=><option key={p} value={p}>{t(p)}</option>)}</select>
        <select className={`${control} !w-auto flex-1 sm:min-w-36 sm:flex-none`} aria-label={t("Order type")} value={f.orderType} onChange={e=>onChange("orderType",e.target.value)}>{[["","All order types"],["standard","Standard order"],["manual","Manual order"]].map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select>
        <select className={`${control} !w-auto flex-1 sm:min-w-36 sm:flex-none`} aria-label={t("Customer payment")} value={f.payment} onChange={e=>onChange("payment",e.target.value)}>{[["","Customer payment"],["issued","Awaiting payment"],["paid","Paid"],["unbilled","Not billed"]].map(([key,label])=><option key={key} value={key}>{t(label)}</option>)}</select>
        <button type="button" className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50" aria-expanded={expanded} aria-controls="procurement-more-filters" onClick={onExpand}><SlidersHorizontal size={18}/>{t("More filters")}</button>
      </div>
    </div>
    {expanded && <div id="procurement-more-filters" className="flex flex-wrap items-center gap-3 border-t border-line bg-slate-50/70 px-4 py-5 text-sm text-slate-500 sm:px-6">
      <span>{t("Order date")}</span><input aria-label={t("Order date from")} className={`${control} !w-40`} type="date" value={f.from} onChange={e=>onChange("from",e.target.value)}/><span>{t("To date")}</span><input aria-label={t("Order date to")} className={`${control} !w-40`} type="date" min={f.from} value={f.to} onChange={e=>onChange("to",e.target.value)}/>
      <label className="flex items-center gap-3">{t("Minimum amount")}<input className={`${control} !w-32`} type="number" min="0" max="9999999" step="0.01" placeholder={currency} value={f.minAmount} onChange={e=>onChange("minAmount",e.target.value)}/></label>
      <select aria-label={t("Additional order statuses")} className={`${control} !w-auto`} value={["partial","cancelled"].includes(f.status)?f.status:""} onChange={e=>onChange("status",e.target.value)}><option value="">{t("Additional order statuses")}</option>{["partial","cancelled"].map(key=><option key={key} value={key}>{t(stageLabels[key])} ({count(key)})</option>)}</select>
      <button type="button" className="px-2 py-2 text-slate-500 hover:text-indigo-600" onClick={onReset}>{t("Clear all filters")}</button>
    </div>}
  </>;
}
