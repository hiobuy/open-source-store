import { useI18n as useAdminI18n } from "../lib/i18n";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Button, Field, inputClass, Pagination } from "../components/ui";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { AFTERSALE_KINDS, canTransitionAftersale, type AftersaleStatus } from "../../domain/procurement-tracking";
import type { ProcurementDetail, ProcurementPackageLink, ProcurementAftersale, ProcurementTrackingEvent, ProcurementTrackingPage } from "../../types/operations";
import { RowsSkeleton } from "./shared";
import { PreviewBadge } from "./preview/shared";

const statuses: Record<string, string> = { open: "Open case", in_progress: "Case in progress", resolved: "Case resolved", cancelled: "Case cancelled", not_received: "Not received", partially_received: "Partially received", fully_received: "Fully received" };
const kinds: Record<string, string> = { missing: "Missing items", damaged: "Damaged items", wrong_item: "Wrong item", return: "Return request", other: "Other issue" };
export const trackingLabels: Record<string, string> = { link: "Package linked", arrival: "Received quantity updated", fulfillment_arrival: "Received quantity updated", unlink: "Package unlinked", case_create: "Aftersales case created", case_update: "Aftersales case updated" };
type Edit = { action: "link" } | { action: "arrival"; link: ProcurementPackageLink } | { action: "unlink"; link: ProcurementPackageLink } | { action: "case_create"; link?: ProcurementPackageLink } | { action: "case_update"; record: ProcurementAftersale };

export function ProcurementTracking({ order, writable, refresh }: { order: ProcurementDetail; writable: boolean; refresh: () => Promise<void> }) {
  const { t } = useI18n(), client = useQueryClient();
  const [group, setGroup] = useState<"links" | "cases" | "events">("links"), [page, setPage] = useState(1), [itemId, setItemId] = useState("");
  const [edit, setEdit] = useState<Edit | null>(null);
  const params = new URLSearchParams({ group, page: String(page), pageSize: "10", ...(itemId ? { itemId } : {}) });
  const list = useQuery({ queryKey: ["admin", "procurement-tracking", order.id, params.toString()], queryFn: () => api<ProcurementTrackingPage<ProcurementPackageLink | ProcurementAftersale | ProcurementTrackingEvent>>(`/api/admin/procurement/${order.id}/tracking?${params}`) });
  const canWrite = writable && order.status === "draft";
  const name = (id: string) => { const item = order.items.find(i => i.id === id); return item ? `${item.name} · ${item.sku}` : id; };
  const saved = async () => { setEdit(null); await Promise.all([refresh(), client.invalidateQueries({ queryKey: ["admin", "procurement-tracking", order.id] })]); };
  return <section className="space-y-4 border-t border-line pt-4">
    <h3 className="font-semibold">{t("Packages, arrivals and aftersales")}</h3>
    <p className="text-xs text-slate-500">{t("These are merchant reconciliation records. They do not change warehouse status, shipment eligibility, bills or wallet balances.")}</p>
    <div className="space-y-2">{order.receiving.items.map(row => <div key={row.itemId} className="rounded-lg bg-slate-50 p-3 text-sm"><div className="mb-2 flex flex-wrap justify-between gap-2"><strong className="break-words">{name(row.itemId)}</strong><PreviewBadge>{t(statuses[row.status])}</PreviewBadge></div><p>{t("Ordered {ordered} · Linked {allocated} · Received {received} · Outstanding {outstanding}", row)}</p></div>)}</div>
    <div className="flex flex-wrap items-center gap-2"><span className="mr-auto text-sm">{t("Open aftersales: {count}", { count: order.receiving.openCases })}</span>{canWrite && !edit && <><Button size="sm" variant="secondary" onClick={() => setEdit({ action: "link" })}>{t("Link package")}</Button><Button size="sm" variant="secondary" onClick={() => setEdit({ action: "case_create" })}>{t("New aftersales case")}</Button></>}</div>
    {edit && canWrite && <TrackingForm key={`${order.version}:${JSON.stringify(edit)}`} edit={edit} order={order} onClose={() => setEdit(null)} onSaved={saved} refresh={refresh} />}
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("Tracking records")}>{([ ["links", "Package links"], ["cases", "Aftersales records"], ["events", "Receiving and handling history"] ] as const).map(([key, label]) => <Button key={key} size="sm" variant={group === key ? "primary" : "secondary"} onClick={() => { setGroup(key); setPage(1); }}>{t(label)}</Button>)}</div>
    <select className={inputClass} aria-label={t("Filter by product")} value={itemId} onChange={e => { setItemId(e.target.value); setPage(1); }}><option value="">{t("All products")}</option>{order.items.map(i => <option key={i.id} value={i.id}>{name(i.id)}</option>)}</select>
    {list.isPending ? <RowsSkeleton rows={2} /> : list.isError ? <div role="alert"><p>{t(list.error.message)}</p><Button size="sm" onClick={() => list.refetch()}>{t("Retry")}</Button></div> : <>
      {!list.data.items.length && <p className="rounded-lg border border-dashed border-line p-4 text-sm text-slate-500">{t("No tracking records yet.")}</p>}
      {list.data.items.map(row => <article key={row.id} className="space-y-2 rounded-lg border border-line p-3 text-sm">
        <p className="font-medium">{name(row.itemId)}</p>
        {"action" in row ? <EventRow event={row} /> : "packageId" in row ? <><Link className="break-all text-indigo-700 underline" to={`/admin/packages/${encodeURIComponent(row.packageId)}`}>{row.publicId}</Link><p className="break-all text-xs text-slate-500">{row.tracking} · {row.packageStatus}</p><p>{t("Linked {allocated} · Received {received}", { allocated: row.allocatedQuantity, received: row.receivedQuantity })} · {t(row.active ? "Active link" : "Unlinked")}</p>{row.active && canWrite && !edit && <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => setEdit({ action: "arrival", link: row })}>{t("Record arrival / correction")}</Button><Button size="sm" variant="ghost" onClick={() => setEdit({ action: "case_create", link: row })}>{t("New aftersales case")}</Button>{row.receivedQuantity === 0 && <Button size="sm" variant="ghost" onClick={() => setEdit({ action: "unlink", link: row })}>{t("Unlink package")}</Button>}</div>}</>
          : "kind" in row ? <><p><PreviewBadge>{t(statuses[row.status])}</PreviewBadge> · {t(kinds[row.kind])} × {row.quantity}</p><p className="break-all text-xs text-slate-500">{row.id}{row.publicId ? ` · ${row.publicId}` : ""}</p><p className="whitespace-pre-wrap break-words">{row.reason}</p>{row.resolution && <p className="whitespace-pre-wrap break-words">{t("Handling result")}: {row.resolution}</p>}{canWrite && !edit && (row.status === "open" || row.status === "in_progress") && <Button size="sm" variant="ghost" onClick={() => setEdit({ action: "case_update", record: row })}>{t("Update aftersales")}</Button>}</>
             : null}
      </article>)}
      <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onChange={setPage} />
    </>}
  </section>;
}

function EventRow({ event }: { event: ProcurementTrackingEvent }) {
  const { t, locale } = useI18n();
  return <><p>{t(trackingLabels[event.action] ?? event.action)} · {event.author ?? t("Former staff")} · {new Date(event.createdAt).toLocaleString(locale)}</p>{event.publicId && <p className="break-all text-xs text-slate-500">{event.publicId}</p>}{event.beforeQuantity !== null && <p>{event.beforeQuantity} → {event.afterQuantity}</p>}{event.toStatus && <p>{event.fromStatus ? `${t(statuses[event.fromStatus])} → ` : ""}{t(statuses[event.toStatus])}</p>}{event.caseId && <p className="break-all font-mono text-xs">{event.caseId}</p>}<p className="whitespace-pre-wrap break-words">{event.note}</p></>;
}

type PackageOption = { id: string; publicId: string; tracking: string; name: string | null; status: string };
function TrackingForm({ edit, order, onClose, onSaved, refresh }: { edit: Edit; order: ProcurementDetail; onClose: () => void; onSaved: () => Promise<void>; refresh: () => Promise<void> }) {
  const { t: tr } = useAdminI18n();
  const { t } = useI18n();
  const [id, setId] = useState(() => crypto.randomUUID()), [itemId, setItemId] = useState("link" in edit && edit.link ? edit.link.itemId : ""), [packageId, setPackageId] = useState("");
  const [search, setSearch] = useState(""), [packagePage, setPackagePage] = useState(1), [note, setNote] = useState("");
  const [qty, setQty] = useState(edit.action === "arrival" ? String(edit.link.receivedQuantity) : "1"), [kind, setKind] = useState<typeof AFTERSALE_KINDS[number]>("missing");
  const [status, setStatus] = useState<AftersaleStatus>(edit.action === "case_update" ? edit.record.status : "open");
  const options = useQuery({ queryKey: ["admin", "procurement-package-options", order.id, search, packagePage], queryFn: () => api<ProcurementTrackingPage<PackageOption>>(`/api/admin/procurement/${order.id}/package-options?${new URLSearchParams({ q: search, page: String(packagePage), pageSize: "10" })}`), enabled: edit.action === "link" });
  const body = () => {
    const common = { id, orderVersion: order.version, note, action: edit.action };
    if (edit.action === "link") return { ...common, itemId, packageId, quantity: Number(qty) };
    if (edit.action === "arrival") return { ...common, linkId: edit.link.id, receivedQuantity: Number(qty) };
    if (edit.action === "unlink") return { ...common, linkId: edit.link.id };
    if (edit.action === "case_create") return { ...common, itemId, linkId: edit.link?.id ?? null, kind, quantity: Number(qty) };
    return { ...common, caseId: edit.record.id, status };
  };
  const save = useMutation({ mutationFn: () => api(`/api/admin/procurement/${order.id}/tracking`, { method: "POST", body: JSON.stringify(body()) }), onSuccess: onSaved });
  const changed = () => { setId(crypto.randomUUID()); save.reset(); };
  const linked = "link" in edit ? edit.link : undefined;
  const maximum = edit.action === "arrival" ? edit.link.allocatedQuantity : linked ? linked.allocatedQuantity : order.items.find(i => i.id === itemId)?.quantity ?? 999;
  return <form className="space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/30 p-4" onSubmit={e => { e.preventDefault(); if (!save.isPending) save.mutate(); }}>
    <h4 className="font-semibold">{t(({ link: "Link package", arrival: "Record arrival / correction", unlink: "Unlink package", case_create: "New aftersales case", case_update: "Update aftersales" })[edit.action])}</h4>
    <fieldset disabled={save.isPending} className="space-y-3">
      {(edit.action === "link" || edit.action === "case_create") && <Field label={tr("Product")}><select className={inputClass} value={itemId} required disabled={!!linked} onChange={e => { setItemId(e.target.value); changed(); }}><option value="">{t("Select product")}</option>{order.items.map(i => <option key={i.id} value={i.id}>{i.name} · {i.sku} × {i.quantity}</option>)}</select></Field>}
      {linked && <p className="break-all text-sm">{linked.publicId} · {linked.tracking}</p>}
      {edit.action === "link" && <>
        <Field label={tr("Search customer packages")}><input className={inputClass} value={search} placeholder={t("Package number, tracking or product")} onChange={e => { setSearch(e.target.value); setPackagePage(1); setPackageId(""); changed(); }} /></Field>
        <Field label={tr("Package")}><select className={inputClass} required value={packageId} onChange={e => { setPackageId(e.target.value); changed(); }}><option value="">{t(options.isPending ? "Loading…" : "Select package")}</option>{options.data?.items.map(p => <option key={p.id} value={p.id}>{p.publicId} · {p.tracking} · {p.name}</option>)}</select></Field>
        {options.isError && <p role="alert">{t(options.error.message)} <Button type="button" size="sm" onClick={() => options.refetch()}>{t("Retry")}</Button></p>}
        {options.data && <><p className="text-xs text-slate-500">{t(options.data.total ? "Only this customer's existing packages are listed." : "No customer packages found. Create a package using the existing workflow first.")}</p><Pagination page={packagePage} pageSize={10} total={options.data.total} onChange={p => { setPackagePage(p); setPackageId(""); changed(); }} /></>}
      </>}
      {(edit.action === "link" || edit.action === "arrival" || edit.action === "case_create") && <Field label={edit.action === "arrival" ? tr("Total confirmed received quantity") : tr("Quantity")}><input className={inputClass} type="number" required min={edit.action === "arrival" ? 0 : 1} max={maximum} step="1" value={qty} onChange={e => { setQty(e.target.value); changed(); }} /></Field>}
      {edit.action === "arrival" && <p className="text-xs text-slate-500">{t("Enter the cumulative received quantity, not the added quantity. A decrease is recorded as a correction with your reason.")}</p>}
      {edit.action === "unlink" && <p className="text-xs text-slate-500">{t("Unlinking retains history. Received quantity must be zero and linked aftersales cases must be closed.")}</p>}
      {edit.action === "case_create" && <Field label={tr("Issue type")}><select className={inputClass} value={kind} onChange={e => { setKind(e.target.value as typeof kind); changed(); }}>{AFTERSALE_KINDS.map(k => <option key={k} value={k}>{t(kinds[k])}</option>)}</select></Field>}
      {edit.action === "case_update" && <Field label={tr("Case status")}><select className={inputClass} value={status} onChange={e => { setStatus(e.target.value as AftersaleStatus); changed(); }}>{(["open", "in_progress", "resolved", "cancelled"] as const).filter(s => canTransitionAftersale(edit.record.status, s)).map(s => <option key={s} value={s}>{t(statuses[s])}</option>)}</select></Field>}
      <Field label={edit.action === "case_update" ? tr("Handling note / result") : tr("Reason / evidence note")}><textarea className={`${inputClass} !h-20 py-2`} required minLength={2} maxLength={1000} value={note} onChange={e => { setNote(e.target.value); changed(); }} /></Field>
      {save.isError && <div role="alert" className="text-red-700"><p>{t(save.error.message)}</p><Button type="button" variant="ghost" size="sm" onClick={() => refresh()}>{t("Refresh order")}</Button></div>}
      <div className="flex gap-2"><Button type="submit" loading={save.isPending} disabled={note.trim().length < 2 || (edit.action === "link" && options.isFetching)}>{t("Save record")}</Button><Button type="button" variant="ghost" onClick={onClose}>{t("Back")}</Button></div>
    </fieldset>
  </form>;
}
