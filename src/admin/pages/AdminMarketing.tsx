import { useI18n as useAdminI18n } from "../lib/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tr, useI18n } from "../lib/i18n";
import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { api } from "../lib/api";
import { Button, Dialog, Field, inputClass, Pagination } from "../components/ui";
import { AdminHeader, allows, ListEmpty, RowsSkeleton, StatusTabs, useAdminAccess } from "./shared";
import { Metrics, PreviewBadge, previewMoney, tableClass } from "./preview/shared";
import type { MarketingRecord, OperationsList } from "../../types/operations";

export function AdminMarketing() {
  const { t: tr } = useAdminI18n();
  const access = useAdminAccess();
  if (access.isPending) return <RowsSkeleton />;
  if (access.data?.role === "demo") return <ListEmpty title={tr("Marketing")} body={tr("This module is unavailable in the read-only demo.")} />;
  if (!allows(access.data, "marketing.read")) return <ListEmpty title={tr("Marketing")} body={tr("You don't have permission for this.")} />;
  return <MarketingWorkspace writable={allows(access.data, "marketing.write")} />;
}
function MarketingWorkspace({ writable }: { writable: boolean }) {
  const { t: tr } = useAdminI18n();
  const { t, currency } = useI18n(), client = useQueryClient();
  const [tab, setTab] = useState<"coupons" | "campaigns">("coupons"), [query, setQuery] = useState(""), [filter, setFilter] = useState(""), [page, setPage] = useState(1);
  const [draft, setDraft] = useState<MarketingRecord | null>(null), [editing, setEditing] = useState(false), [toggle, setToggle] = useState<MarketingRecord | null>(null);
  const params = new URLSearchParams({ group: tab, q: query, status: filter, page: String(page), pageSize: "20" });
  const list = useQuery({ queryKey: ["admin", "marketing", params.toString()], queryFn: () => api<OperationsList<MarketingRecord>>(`/api/admin/marketing?${params}`) });
  const refresh = () => client.invalidateQueries({ queryKey: ["admin", "marketing"] });
  const save = useMutation({ mutationFn: (record: MarketingRecord) => {
    const { id, group, name, code, from, to, kind, amount, minimum, limit, channel, version } = record;
    return api(`/api/admin/marketing${editing ? `/${id}` : ""}`, { method: editing ? "PUT" : "POST", body: JSON.stringify({ id, group, name, code, from, to, kind, amount, minimum, limit, channel, ...(editing ? { version } : {}) }) });
  }, onSuccess: async () => { setDraft(null); await refresh(); } });
  const enable = useMutation({ mutationFn: () => api(`/api/admin/marketing/${toggle!.group}/${toggle!.id}/enabled`, { method: "PUT", body: JSON.stringify({ version: toggle!.version, enabled: !toggle!.enabled }) }), onSuccess: async () => { setToggle(null); await refresh(); } });
  const records = list.data?.items ?? [], counts = list.data?.counts ?? {};
  function create() { save.reset(); setEditing(false); setDraft({ id: crypto.randomUUID(), group: tab, name: "", code: "", enabled: false, from: new Date().toISOString().slice(0, 10), to: "", kind: "percent", amount: 10, minimum: 0, limit: 100, channel: "Community", version: 1, currency, status: "Disabled" }); }
  return <div>
    <AdminHeader title={tr("Marketing")} meta="Manage customer offers and promotional campaigns." action={<Button size="sm" disabled={!writable} onClick={create}><Plus size={14} />{t(tab === "coupons" ? "New coupon" : "New campaign")}</Button>} />
    <p className="mb-5 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">{t("Coupons support standard purchase orders. Campaign attribution is not connected. New records start disabled.")}</p>
    <Metrics items={[{ label: "Coupons", value: counts.coupons ?? 0, hint: "Saved records" }, { label: "Enabled offers", value: counts.enabled ?? 0, hint: "Within the validity period" }, { label: "Campaigns", value: counts.campaigns ?? 0, hint: "Saved records" }, { label: "Attributed orders", value: "—", hint: "Attribution is not connected" }]} />
    <StatusTabs value={tab} primary={[{ key: "coupons", label: "Coupons" }, { key: "campaigns", label: "Promotions" }]} onChange={v => { setTab(v as typeof tab); setQuery(""); setFilter(""); setPage(1); }} />
    <div className="rounded-lg border border-line bg-white"><div className="flex flex-wrap gap-2 border-b border-line p-3"><input className={`${inputClass} sm:!w-80`} aria-label={t("Search marketing records")} placeholder={t("Search name or code")} value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /><select className={`${inputClass} !w-auto`} aria-label={t("Marketing status")} value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="">{t("All statuses")}</option>{["Enabled", "Disabled", "Scheduled", "Expired"].map(s => <option key={s} value={s}>{t(s)}</option>)}</select><Button size="sm" variant="ghost" onClick={() => { setFilter(""); setQuery(""); setPage(1); }}>{t("Reset")}</Button></div>
    {list.isPending ? <RowsSkeleton /> : list.isError ? <div role="alert" className="p-6"><p>{t(list.error.message)}</p><Button onClick={() => list.refetch()}>{t("Retry")}</Button></div> : <>
      <div className="overflow-x-auto"><table className={`${tableClass} min-w-[850px]`}><thead><tr>{[tab === "coupons" ? "Coupon / Code" : "Campaign / Code", tab === "coupons" ? "Discount" : "Channel", tab === "coupons" ? "Minimum spend" : "Visits", tab === "coupons" ? "Usage limit" : "Attributed orders", "Validity", "Status", "Actions"].map(label => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{records.map(r => <tr key={r.id}><td><p className="font-medium text-ink">{r.name}</p><p className="mt-1 font-mono text-xs text-slate-400">{r.code}</p></td><td>{r.group === "coupons" ? r.kind === "percent" ? t("{amount}% off", { amount: r.amount }) : previewMoney(Math.round(r.amount * 100), r.currency) : t(r.channel)}</td><td>{r.group === "coupons" ? previewMoney(Math.round(r.minimum * 100), r.currency) : "—"}</td><td>{r.group === "coupons" ? r.limit : "—"}</td><td className="text-xs text-slate-500">{r.from}<br />{r.to}</td><td><PreviewBadge tone={r.status === "Enabled" ? "green" : r.status === "Scheduled" ? "blue" : "neutral"}>{r.status}</PreviewBadge></td><td><div className="flex gap-1"><Button size="sm" variant="ghost" disabled={!writable} onClick={() => { save.reset(); setEditing(true); setDraft({ ...r }); }}>{t("Edit")}</Button><Button size="sm" variant="ghost" disabled={!writable} onClick={() => { enable.reset(); setToggle(r); }}>{t(r.enabled ? "Disable" : "Enable")}</Button></div></td></tr>)}</tbody></table></div>
      {!records.length && <ListEmpty title={tr("No matching marketing records")} body={tr("Clear your filters or create a new record.")} />}
      <div className="border-t border-line p-3"><Pagination page={list.data?.page ?? page} pageSize={20} total={list.data?.total ?? 0} onChange={setPage} /></div>
    </>}
    </div>
    {draft && <MarketingForm key={draft.id} record={draft} editing={editing} pending={save.isPending} serverError={save.error?.message} onClose={() => setDraft(null)} onSave={next => save.mutate(next)} />}
    <Dialog open={!!toggle} title={toggle?.enabled ? tr("Disable this record?") : tr("Enable this record?")} description="This changes availability settings only. Redemption and attribution remain disconnected." onClose={() => { if (!enable.isPending) setToggle(null); }} footer={<><Button variant="secondary" disabled={enable.isPending} onClick={() => setToggle(null)}>{t("Cancel")}</Button><Button disabled={enable.isPending} onClick={() => enable.mutate()}>{t("Confirm")}</Button></>}><p>{toggle?.name} · {toggle?.code}</p>{enable.isError && <p className="mt-3 text-red-700" role="alert">{t(enable.error.message)}</p>}</Dialog>
  </div>;
}

function MarketingForm({ record, editing, pending, serverError, onClose, onSave }: { record: MarketingRecord; editing: boolean; pending: boolean; serverError?: string; onClose: () => void; onSave: (r: MarketingRecord) => void }) {
  const { t: tr } = useAdminI18n();
  const { t } = useI18n();
  const [draft, setDraft] = useState(record);
  const [error, setError] = useState("");
  const edit = editing, coupon = record.group === "coupons";
  const update = <K extends keyof MarketingRecord>(key: K, value: MarketingRecord[K]) => setDraft(prev => ({ ...prev, [key]: value }));
  function submit(e: FormEvent) {
    e.preventDefault();
    const code = draft.code.trim().toUpperCase();
    if (pending) return;
    if (!draft.name.trim() || !/^[A-Z0-9_-]{1,32}$/.test(code)) { setError("Enter a name and a valid code (letters, numbers, hyphens or underscores)."); return; }
    if (!draft.from || !draft.to || draft.to < draft.from) { setError("End date must be on or after the start date."); return; }
    if (coupon && (!Number.isFinite(draft.amount) || draft.amount <= 0 || (draft.kind === "percent" && draft.amount > 100) || !Number.isFinite(draft.minimum) || draft.minimum < 0 || !Number.isInteger(draft.limit) || draft.limit < 1)) { setError("Check the discount, minimum spend and usage limit. The limit cannot be below existing usage."); return; }
    onSave({ ...draft, name: draft.name.trim(), code });
  }
  return <Dialog open title={coupon ? edit ? tr("Edit coupon") : tr("New coupon") : edit ? tr("Edit campaign") : tr("New campaign")} description="Changes are saved to the database. Coupons apply to standard purchase orders; campaign attribution is not connected." onClose={() => { if (!pending) onClose(); }}><form onSubmit={submit}><fieldset disabled={pending} className="space-y-4"><Field label={tr("Name")}><input className={inputClass} required maxLength={60} value={draft.name} onChange={e => update("name", e.target.value)} /></Field><Field label={coupon ? tr("Coupon code") : tr("Campaign code")} hint={edit ? tr("Codes cannot be changed after creation.") : undefined}><input className={inputClass} required readOnly={edit} maxLength={32} pattern={"[A-Za-z0-9_\\-]+"} value={draft.code} onChange={e => update("code", e.target.value.toUpperCase())} /></Field>
    {coupon ? <><Field label={tr("Discount type")}><select className={inputClass} value={draft.kind} onChange={e => update("kind", e.target.value as MarketingRecord["kind"])}><option value="percent"> <Tr k="Percentage discount" /> </option><option value="fixed"> {t("Fixed amount ({currency})", { currency: draft.currency })} </option></select></Field><Field label={draft.kind === "percent" ? tr("Discount (%)") : t("Discount ({currency})", { currency: draft.currency })}><input className={inputClass} required type="number" step="0.01" min="0.01" max={draft.kind === "percent" ? 100 : 999999} value={draft.amount} onChange={e => update("amount", Number(e.target.value))} /></Field><div className="grid grid-cols-2 gap-3"><Field label={t("Minimum spend ({currency})", { currency: draft.currency })}><input className={inputClass} required type="number" step="0.01" min="0" max="999999" value={draft.minimum} onChange={e => update("minimum", Number(e.target.value))} /></Field><Field label={tr("Usage limit")}><input className={inputClass} required type="number" min={1} max="999999" step="1" value={draft.limit} onChange={e => update("limit", Number(e.target.value))} /></Field></div></> : <Field label={tr("Channel")}><select className={inputClass} value={draft.channel} onChange={e => update("channel", e.target.value)}>{["Community", "Social media", "Email", "Partners"].map(c => <option key={c} value={c}>{t(c)}</option>)}</select></Field>}
    <div className="grid grid-cols-2 gap-3"><Field label={tr("Start date")}><input className={inputClass} type="date" required value={draft.from} onChange={e => update("from", e.target.value)} /></Field><Field label={tr("End date")}><input className={inputClass} type="date" required min={draft.from} value={draft.to} onChange={e => update("to", e.target.value)} /></Field></div>{(error || serverError) && <p role="alert" className="text-sm text-red-700">{t(error || serverError || "")}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}> <Tr k="Cancel" /> </Button><Button type="submit"> <Tr k="Save" /> </Button></div></fieldset></form></Dialog>;
}
