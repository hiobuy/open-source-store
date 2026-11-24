import { OrderTrackingButton } from "./OrderTrackingButton";
import { AdminListViewport, AdminPagination } from "./AdminListLayout";
import { PurchasePushPay } from "./PurchasePushPay";
import { ProcurementFilters } from "./ProcurementFilters";
import { useI18n as useAdminI18n } from "../lib/i18n";
import { DetailCard, ProcurementSteps, ProcurementProductsCard, ProcurementFeesCard, ProcurementArrivalCard } from "./ProcurementDetailCards";
import { ProcurementRemote, HioBuyPurchaseCreator } from "./ProcurementRemote";
import { BatchPurchasePush, OrderSummaryCells, PaymentReminder, eligibleForPush, stageLabels } from "./ProcurementPresentation";
import { ProcurementTracking, trackingLabels } from "./ProcurementTracking";
import { ProcurementBilling } from "./ProcurementBilling";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { Download, Plus } from "lucide-react";
import { Button, Dialog, Field, inputClass } from "../components/ui";
import { api } from "../lib/api";
import { useI18n, Tr } from "../lib/i18n";
import { AdminHeader, allows, ListEmpty, RowsSkeleton, useAdminAccess } from "./shared";
import { exportPreviewCsv, tableClass } from "./preview/shared";
import type { OperationsList, ProcurementCustomer, ProcurementDetail, ProcurementOrder } from "../../types/operations";

const activityLabels: Record<string, string> = { "procurement.media.fill":"Product images updated", "procurement.remote.request":"Purchase request created", "procurement.remote.create":"Procurement submission requested", "procurement.remote.pay":"Procurement payment requested", "procurement.remote.cancel":"Procurement cancellation requested", "procurement.remote.reconcile":"Remote order reconciled", "procurement.create": "Draft created", "procurement.cancel": "Draft cancelled", "procurement.note": "Note added", "procurement.bill.issue": "Purchase bill issued", "procurement.bill.void": "Purchase bill voided" };

export function AdminProcurement() {
  const { t: tr } = useAdminI18n();
  const access = useAdminAccess();
  if (access.isPending) return <RowsSkeleton />;
  if (access.data?.role === "demo") return <ListEmpty title={tr("Shopping orders")} body={tr("This module is unavailable in the read-only demo.")} />;
  if (!allows(access.data, "procurement.read")) return <ListEmpty title={tr("Shopping orders")} body={tr("You don't have permission for this.")} />;
  return <ProcurementWorkspace writable={allows(access.data, "procurement.write")} canPay={allows(access.data,"payments.money")} requires2fa={!!access.data?.hiobuyPay2fa} />;
}
function ProcurementWorkspace({ writable, canPay, requires2fa }: { writable: boolean; canPay:boolean; requires2fa:boolean }) {
  const [routeParams, setRouteParams] = useSearchParams();
  const { t: tr } = useAdminI18n();
  const { t, locale } = useI18n(), client = useQueryClient();
  const [orderType,setOrderType]=useState("");
  const [payment,setPayment]=useState(""),[minAmount,setMinAmount]=useState(""),[pageSize,setPageSize]=useState(20),[moreFilters,setMoreFilters]=useState(false);
  const [detailTab,setDetailTab]=useState("overview"),[batch,setBatch]=useState<ProcurementOrder[]|null>(null),[reminder,setReminder]=useState<ProcurementOrder|null>(null);
  const [query, setQuery] = useState(""), [status, setStatus] = useState(""), [platform, setPlatform] = useState("");
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]), [active, setActive] = useState<string | null>(routeParams.get("order"));
  useEffect(() => { if (routeParams.get("order")) setActive(routeParams.get("order")); }, [routeParams]);
  const closeOrder = () => { setActive(null); if (routeParams.has("order")) { const next = new URLSearchParams(routeParams); next.delete("order"); setRouteParams(next, { replace: true }); } };
  const [remoteCreate,setRemoteCreate]=useState(false);
  const [create, setCreate] = useState(false), [note, setNote] = useState(""), [kind, setKind] = useState<"internal" | "resolution">("internal");
  const [noteId, setNoteId] = useState(() => crypto.randomUUID()), [cancel, setCancel] = useState(false);
  const params = new URLSearchParams({ q: query, orderType, stage:status, payment, ...(minAmount?{minAmount}:{}), platform, page: String(page), pageSize: String(pageSize), ...(from ? { from } : {}), ...(to ? { to } : {}) });
  const list = useQuery({ queryKey: ["admin", "procurement", params.toString()], queryFn: () => api<OperationsList<ProcurementOrder>>(`/api/admin/procurement?${params}`) });
  const detail = useQuery({ queryKey: ["admin", "procurement-detail", active], queryFn: () => api<ProcurementDetail>(`/api/admin/procurement/${active}`), enabled: !!active });
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ["admin", "procurement"] }), client.invalidateQueries({ queryKey: ["admin", "procurement-detail"] })]); };
  const saveNote = useMutation({ mutationFn: () => api(`/api/admin/procurement/${active}/notes`, { method: "POST", body: JSON.stringify({ id: noteId, text: note, kind }) }), onSuccess: async () => { setNote(""); setNoteId(crypto.randomUUID()); await refresh(); } });
  const fillMedia=useMutation({mutationFn:()=>api<{updated:number}>(`/api/admin/procurement/${active}/media`,{method:"POST",body:JSON.stringify({confirm:true})}),onSuccess:refresh});
  const cancelOrder = useMutation({ mutationFn: () => api(`/api/admin/procurement/${active}/cancel`, { method: "POST", body: JSON.stringify({ version: detail.data?.version }) }), onSuccess: async () => { setCancel(false); await refresh(); } });
  const reset = () => { setQuery(""); setStatus(""); setPlatform("");setOrderType(""); setFrom(""); setTo(""); setPayment("");setMinAmount("");setPage(1); setSelected([]); };
  const rows = list.data?.items ?? [], counts = list.data?.counts ?? {};
  const stageCount=(key:string)=>counts[`stage:${key}`]??0;
  const visibleSelected = rows.filter(row => selected.includes(row.id));
  const exportRows = (items: ProcurementOrder[]) => exportPreviewCsv("procurement-orders.csv", [["Order","Customer","Platform","Customer bill","Currency","Customer payment","Procurement progress","Upstream settlement","Warehouse packages / Domestic tracking","Received quantity"].map(label=>t(label)), ...items.map(o=>[o.number,o.customer,o.platform,o.overview?.billTotalCents!=null?(o.overview.billTotalCents/100).toFixed(2):"",o.overview?.billCurrency??"",t(o.overview?.payment==="paid"?"Paid":o.overview?.payment==="issued"?"Awaiting payment":"Not billed"),t(stageLabels[o.overview?.stage??o.status]),o.remote?.paymentStatus??"",o.overview?.packages.map(p=>`${p.publicId} / ${p.tracking}`).join("; ")??"",`${o.overview?.received??0}/${o.overview?.ordered??0}`])]);
  const open = (id: string) => { setActive(id);setDetailTab("overview");fillMedia.reset(); setNote(""); setNoteId(crypto.randomUUID()); setKind("internal"); setCancel(false); saveNote.reset(); cancelOrder.reset(); };
  return <div>
    <AdminHeader title={tr("Shopping orders")} meta="Manage purchase drafts, customer bills and HioBuy orders." action={<><Button size="sm" variant="secondary" disabled={!rows.length || list.isFetching} onClick={() => exportRows(rows)}><Download size={14} />{t("Export current page")}</Button><Button size="sm" variant="secondary" disabled={!writable||!visibleSelected.some(eligibleForPush)} onClick={()=>setBatch(visibleSelected)}>{t(canPay?"Submit and pay HioBuy":"Batch submit to HioBuy")}</Button><Button size="sm" variant="secondary" disabled={!writable} onClick={()=>setRemoteCreate(true)}>{t("New HioBuy purchase")}</Button><Button size="sm" disabled={!writable} onClick={() => setCreate(true)}><Plus size={14} />{t("New order")}</Button></>} />
    <p className="mb-5 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">{t("Creates a local purchase request and bill. The customer pays first; an operator then submits it to HioBuy.")}</p>
    <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">{[
      {key:"",label:"All shopping orders",value:(counts.draft??0)+(counts.cancelled??0),hint:"All saved orders"},
      {key:"pending",label:"Awaiting operator submission",value:stageCount("pending"),hint:"Customer paid; operator confirmation required"},
      {key:"awaiting_payment",label:"Awaiting payment",value:counts["payment:issued"]??0,hint:"Issued customer bills"},
      {key:"exception",label:"Needs attention",value:stageCount("exception")+stageCount("after"),hint:"Procurement exceptions and open aftersales"},
    ].map(metric=><button key={metric.key} onClick={()=>{setStatus(metric.key==="awaiting_payment"?"":metric.key);setPayment(metric.key==="awaiting_payment"?"issued":"");setPage(1);setSelected([]);}} className="rounded-xl border border-line bg-white p-5 text-left transition hover:border-indigo-300"><p className="text-xs text-slate-500">{t(metric.label)}</p><p className="mt-3 text-3xl font-semibold tracking-tight">{list.isPending||list.isError?"—":metric.value}</p><p className="mt-2 text-xs text-slate-400">{t(metric.hint)}</p></button>)}</div>
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <ProcurementFilters filters={{orderType,query,status,platform,payment,from,to,minAmount}} counts={counts} loading={list.isPending||list.isError} expanded={moreFilters} onExpand={()=>setMoreFilters(!moreFilters)} onReset={reset} onChange={(key,value)=>{({orderType:setOrderType,query:setQuery,status:setStatus,platform:setPlatform,payment:setPayment,from:setFrom,to:setTo,minAmount:setMinAmount})[key](value);setPage(1);setSelected([]);}} />
      {(query||platform||payment||from||to||minAmount)&&<div className="flex flex-wrap gap-2 border-b border-line p-3">{[{value:query,clear:()=>setQuery("")},{value:platform,clear:()=>setPlatform("")},{value:payment?t(payment==="paid"?"Paid":payment==="issued"?"Awaiting payment":"Not billed"):"",clear:()=>setPayment("")},{value:from||to?`${from||"…"} — ${to||"…"}`:"",clear:()=>{setFrom("");setTo("");}},{value:minAmount?`≥ ${minAmount}`:"",clear:()=>setMinAmount("")}].filter(c=>c.value).map((chip,i)=><button key={i} className="rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-700" onClick={()=>{chip.clear();setPage(1);setSelected([]);}}>{chip.value} ×</button>)}</div>}
      {visibleSelected.length > 0 && <div className="flex flex-wrap items-center gap-3 bg-indigo-50 px-4 py-2"><span>{t("Selected: {count}", { count: visibleSelected.length })}</span><Button size="sm" disabled={!writable||!visibleSelected.some(eligibleForPush)} onClick={()=>setBatch(visibleSelected)}>{t(canPay?"Submit and pay HioBuy":"Batch submit to HioBuy")}</Button><Button size="sm" variant="ghost" onClick={() => exportRows(visibleSelected)}>{t("Export selected")}</Button><Button size="sm" variant="ghost" onClick={() => setSelected([])}>{t("Clear selection")}</Button></div>}
      <AdminListViewport label={t("Shopping orders")} resetKey={params.toString()} busy={list.isFetching}>
      {list.isPending ? <RowsSkeleton /> : list.isError ? <div className="p-6" role="alert"><p>{t(list.error.message)}</p><Button onClick={() => list.refetch()}>{t("Retry")}</Button></div> : <>
        <div><table className={`${tableClass} min-w-[1140px]`}><thead><tr><th><input type="checkbox" aria-label={t("Select orders on this page")} checked={rows.length>0&&rows.every(o=>selected.includes(o.id))} onChange={e=>setSelected(e.target.checked?rows.map(o=>o.id):[])}/></th>{["Product information","Order amount","Customer","HioBuy procurement","Warehouse packages / Domestic tracking","Actions"].map(label=><th key={label}>{t(label)}</th>)}</tr></thead><tbody>{rows.map(o=><tr key={o.id}><td><input type="checkbox" aria-label={t("Select {number}",{number:o.number})} checked={selected.includes(o.id)} onChange={()=>setSelected(ids=>ids.includes(o.id)?ids.filter(id=>id!==o.id):[...ids,o.id])}/></td><OrderSummaryCells order={o} open={()=>open(o.id)}/><td className="min-w-28"><div className="flex flex-col items-start gap-2"><Button variant="ghost" size="sm" onClick={()=>open(o.id)}>{t("Details")}</Button><OrderTrackingButton kind="domestic" id={o.id} number={o.number} />{writable&&eligibleForPush(o)&&<Button size="sm" onClick={()=>setBatch([o])}>{t(canPay?"Submit and pay HioBuy":"Submit to HioBuy")}</Button>}{o.overview?.payment==="issued"&&<Button variant="ghost" size="sm" onClick={()=>setReminder(o)}>{t("Payment reminder draft")}</Button>}</div></td></tr>)}</tbody></table></div>
        {!rows.length && <ListEmpty title={tr("No matching orders")} body={tr("Try another search or create a new draft.")} />}

      </>}
      </AdminListViewport>
      <AdminPagination page={list.data?.page ?? page} pageSize={pageSize} total={list.data?.total ?? 0} disabled={list.isFetching || list.isError} onChange={next=>{setPage(next);setSelected([]);}} onPageSizeChange={size=>{setPageSize(size);setPage(1);setSelected([]);}} />
    </div>
    <Dialog drawer open={!!active} title={detail.data?.number??tr("Order details")} description={detail.data?`${detail.data.platform} · ${detail.data.customer} · ${detail.data.member} · ${new Date(detail.data.createdAt).toLocaleString(locale)}`:undefined} onClose={() => { if (!saveNote.isPending && !cancelOrder.isPending && !batch && !cancel) closeOrder(); }}
      tabs={<div className="flex gap-6" role="tablist">{[["overview","Order overview"],["arrival","Arrival and inspection"],["activity","Activity"]].map(([key,label])=><button key={key} role="tab" aria-selected={detailTab===key} className={`border-b-2 py-4 text-sm ${detailTab===key?"border-indigo-600 font-semibold text-indigo-600":"border-transparent text-slate-400"}`} onClick={()=>setDetailTab(key)}>{t(label)}</button>)}</div>}
      footer={<><p className="mr-auto text-xs text-slate-400">{t(canPay?"Submission and payment require your confirmation.":"Submission and procurement payment are confirmed separately.")}</p><Button variant="secondary" disabled={saveNote.isPending||cancelOrder.isPending} onClick={closeOrder}>{t("Close")}</Button>{detail.data&&writable&&eligibleForPush(detail.data)&&<Button onClick={()=>setBatch([detail.data!])}>{t(canPay?"Submit and pay HioBuy":"Submit to HioBuy")}</Button>}</>}>

      {detail.isPending ? <RowsSkeleton rows={3} /> : detail.isError ? <p role="alert">{t(detail.error.message)}</p> : detail.data && <div className="space-y-4">
        {detailTab==="overview"&&<>
        <ProcurementSteps order={detail.data}/>
        <ProcurementProductsCard order={detail.data}/>{writable&&detail.data.remote&&detail.data.items.some(i=>!i.imageUrl)&&<div><Button variant="secondary" disabled={fillMedia.isPending} onClick={()=>fillMedia.mutate()}>{t(fillMedia.isPending?"Loading…":"Fill missing product images")}</Button>{fillMedia.isSuccess&&<p className="mt-2 text-xs text-slate-500">{t("Images updated: {count}",{count:fillMedia.data.updated})}</p>}{fillMedia.isError&&<p role="alert">{t(fillMedia.error.message)}</p>}</div>}
        <ProcurementFeesCard order={detail.data}/>
        {(detail.data.remark || detail.data.attachments?.length || detail.data.coupon) && <DetailCard title={tr("Customer order instructions")}>
          {detail.data.remark && <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{detail.data.remark}</p>}
          {!!detail.data.attachments?.length && <div className="mt-3 flex flex-wrap gap-3">{detail.data.attachments.map(image=><a key={image.id} href={image.url} target="_blank" rel="noreferrer" className="flex w-28 flex-col gap-1 text-xs text-indigo-600"><img src={image.url} alt={tr("Order attachment")} loading="lazy" className="h-24 w-28 rounded-lg border object-contain"/><span>{tr("View attachment")}</span></a>)}</div>}
          {detail.data.coupon && <p className="mt-3 text-sm">{tr("Coupon code")}: {detail.data.coupon.code} · {new Intl.NumberFormat(locale,{style:"currency",currency:detail.data.coupon.currency}).format(detail.data.coupon.discountCents/100)} · {tr(detail.data.coupon.state==="reserved"?"Coupon reserved":detail.data.coupon.state==="redeemed"?"Coupon redeemed":"Coupon released")}</p>}
        </DetailCard>}
        <div className="rounded-xl border border-line bg-white p-5 sm:p-6">
        <ProcurementRemote id={detail.data.id} writable={writable} paid={detail.data.bills.some(b=>b.status==="paid")} hasBill={detail.data.bills.some(b=>b.status!=="void")} refresh={refresh} />
        </div>
        <details open={!detail.data.bills.some(b=>b.status!=="void")} className="rounded-xl border border-line bg-white p-5"><summary className="cursor-pointer text-sm font-semibold">{t("Purchase bills")}</summary><ProcurementBilling key={detail.data.id} order={detail.data} writable={writable} refresh={refresh}/></details>
        </>}
        {detailTab==="arrival"&&<><ProcurementArrivalCard order={detail.data}/><details className="rounded-xl border border-line bg-white p-5"><summary className="cursor-pointer text-sm font-semibold">{t("Arrival and aftersales")}</summary><div className="mt-5"><ProcurementTracking key={`${detail.data.id}:tracking`} order={detail.data} writable={writable} refresh={refresh}/></div></details></>}
        {detailTab==="activity"&&<>
        <DetailCard title={tr("Operation timeline")} hint={tr("Recorded events")}><ol className="space-y-5 border-l-2 border-indigo-100 pl-5">{[...detail.data.bills.filter(b=>b.status==="paid"&&b.paidAt).map(b=>({id:`paid:${b.id}`,at:b.paidAt!,author:detail.data!.customer,title:tr("Customer payment received"),text:new Intl.NumberFormat(locale,{style:"currency",currency:b.currency}).format(b.totalCents/100)})),...detail.data.activity.filter(e=>e.action!=="procurement.note").map(e=>({id:e.id,at:e.at,author:e.author,title:activityLabels[e.action]??trackingLabels[e.action.replace("procurement.tracking.","")]??e.action,text:""})),...detail.data.notes.map(n=>({id:n.id,at:n.createdAt,author:n.author,title:tr(n.kind==="internal"?"Internal note":"Resolution note"),text:n.text}))].sort((a,b)=>b.at-a.at).map(event=><li key={event.id} className="relative"><span className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-white bg-indigo-400"/><p className="text-sm font-medium">{t(event.title)}</p><p className="mt-1 text-xs text-slate-400">{event.author??t("Former staff")} · {new Date(event.at).toLocaleString(locale)}</p>{event.text&&<p className="mt-2 whitespace-pre-wrap break-words text-sm">{event.text}</p>}</li>)}</ol></DetailCard>
        {writable && <DetailCard title={tr("Internal note")} hint={tr("Only visible to the team")}><Field label={tr("Note type")}><select className={inputClass} value={kind} onChange={e => { setKind(e.target.value as typeof kind); setNoteId(crypto.randomUUID()); }}><option value="internal">{t("Internal note")}</option><option value="resolution">{t("Resolution note")}</option></select></Field><Field label={tr("Internal note")}><textarea className={`${inputClass} !h-24 py-2`} maxLength={1000} value={note} disabled={saveNote.isPending} onChange={e => { setNote(e.target.value); setNoteId(crypto.randomUUID()); }} /></Field>{saveNote.isError && <p role="alert" className="text-red-700">{t(saveNote.error.message)}</p>}<Button disabled={!note.trim() || saveNote.isPending} onClick={() => saveNote.mutate()}>{t("Save note")}</Button>{detail.data.status === "draft" && (!detail.data.remote || detail.data.remote.state === "ready") && !detail.data.bills.some(b => b.status !== "void") && !detail.data.receiving.items.some(i => i.allocated > 0) && !detail.data.receiving.openCases && <Button className="ml-2" variant="secondary" onClick={() => setCancel(true)}>{t("Cancel draft")}</Button>}</DetailCard>}
        </>}
      </div>}
    </Dialog>
    <Dialog open={cancel} title={tr("Cancel this draft?")} description="The order and notes will remain available for audit. No payment or warehouse operation will occur." onClose={() => { if (!cancelOrder.isPending) setCancel(false); }} footer={<><Button variant="secondary" disabled={cancelOrder.isPending} onClick={() => setCancel(false)}>{t("Back")}</Button><Button disabled={cancelOrder.isPending} onClick={() => cancelOrder.mutate()}>{t("Confirm")}</Button></>}>{cancelOrder.isError && <p role="alert">{t(cancelOrder.error.message)}</p>}</Dialog>
    {batch&&(canPay?<PurchasePushPay orders={batch} requires2fa={requires2fa} onClose={()=>setBatch(null)} refresh={refresh}/>:<BatchPurchasePush orders={batch} onClose={()=>setBatch(null)} refresh={refresh}/>)}
    {reminder&&<PaymentReminder order={reminder} onClose={()=>setReminder(null)}/>}
    {remoteCreate && <HioBuyPurchaseCreator onClose={()=>setRemoteCreate(false)} onSaved={async id=>{await refresh();setRemoteCreate(false);open(id);}} />}
    {create && <NewOrder onClose={() => setCreate(false)} onSaved={async id => { await refresh(); reset(); setCreate(false); open(id); }} />}
  </div>;
}
function NewOrder({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => Promise<void> }) {
  const { t: tr } = useAdminI18n();
  const { t } = useI18n();
  const [id] = useState(() => crypto.randomUUID()), [customerId, setCustomerId] = useState(""), [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("1688"), [shipping, setShipping] = useState("0");
  const [items, setItems] = useState([{ name: "", sku: "", quantity: "1", price: "" }]);
  const customers = useQuery({ queryKey: ["admin", "procurement-customers", search], queryFn: () => api<{ items: ProcurementCustomer[] }>(`/api/admin/procurement/customers?q=${encodeURIComponent(search)}`) });
  const save = useMutation({ mutationFn: () => api<ProcurementDetail>("/api/admin/procurement", { method: "POST", body: JSON.stringify({ id, customerId, platform, shippingCents: Math.round(Number(shipping) * 100), items: items.map(item => ({ name: item.name, sku: item.sku, quantity: Number(item.quantity), unitPriceCents: Math.round(Number(item.price) * 100) })) }) }), onSuccess: result => onSaved(result.id) });
  const submit = (e: FormEvent) => { e.preventDefault(); if (!save.isPending) save.mutate(); };
  return <Dialog open title={tr("New shopping order")} description="Creates a payable customer bill using confirmed CNY costs and current product pricing. No wallet is charged." size="xl" onClose={() => { if (!save.isPending) onClose(); }}><form onSubmit={submit} className="space-y-4"><fieldset disabled={save.isPending} className="space-y-4">
    <Field label={tr("Search customers")}><input className={inputClass} value={search} onChange={e => { setSearch(e.target.value); setCustomerId(""); }} placeholder={t("Name, email or member code")} /></Field>
    <Field label={tr("Customer")}><select className={inputClass} required value={customerId} onChange={e => setCustomerId(e.target.value)}><option value="">{t(customers.isPending ? "Loading…" : "Select customer")}</option>{customers.data?.items.map(c => <option key={c.id} value={c.id}>{c.name} · {c.memberCode}</option>)}</select></Field>{customers.isError && <p role="alert">{t(customers.error.message)}</p>}
    <Field label={tr("Platform")}><select className={inputClass} value={platform} onChange={e => setPlatform(e.target.value)}>{["1688", "Taobao", "Weidian"].map(p => <option key={p} value={p}>{t(p)}</option>)}</select></Field>
    {items.map((item, i) => <div key={i} className="rounded-lg border border-line p-3"><div className="mb-3 flex justify-between"><span>{t("Product")} {i + 1}</span>{items.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => setItems(prev => prev.filter((_, index) => index !== i))}>{t("Remove")}</Button>}</div><div className="grid gap-3 sm:grid-cols-2">{([["name", "Product name"], ["sku", "SKU / Variant"], ["quantity", "Quantity"], ["price", "Purchase unit cost (CNY)"]] as const).map(([key, label]) => <Field key={key} label={label}><input className={inputClass} required maxLength={120} type={key === "quantity" || key === "price" ? "number" : "text"} min={key === "quantity" ? 1 : 0.01} max={key === "quantity" ? 999 : 999999} step={key === "price" ? "0.01" : "1"} value={item[key]} onChange={e => setItems(prev => prev.map((row, index) => index === i ? { ...row, [key]: e.target.value } : row))} /></Field>)}</div></div>)}
    <Button type="button" variant="secondary" disabled={items.length >= 20} onClick={() => setItems(prev => [...prev, { name: "", sku: "", quantity: "1", price: "" }])}>{t("Add product")}</Button>
    <Field label={tr("Domestic freight (CNY)")}><input className={inputClass} type="number" required min="0" max="999999" step="0.01" value={shipping} onChange={e => setShipping(e.target.value)} /></Field>
    {save.isError && <p role="alert" className="text-red-700">{t(save.error.message)}</p>}
    <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}><Tr k="Cancel" /></Button><Button type="submit" disabled={!customerId || customers.isFetching}>{t(save.isPending ? "Saving…" : "Create order and bill")}</Button></div>
  </fieldset></form></Dialog>;
}
