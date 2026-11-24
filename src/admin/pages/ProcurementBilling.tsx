import { formatCnyRate } from "../../domain/exchange-rates";
import { useI18n as useAdminI18n } from "../lib/i18n";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { Button, Field, inputClass } from "../components/ui";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { ProductQuote } from "../../domain/product-pricing";
import type { ProcurementBill, ProcurementDetail } from "../../types/operations";
import type { PricingSettings } from "./ProductPricing";
import { previewMoney as money, PreviewBadge } from "./preview/shared";

export function ProcurementBilling({ order, writable, refresh }: { order: ProcurementDetail; writable: boolean; refresh: () => Promise<void> }) {
  const { t, locale } = useI18n(), [editing, setEditing] = useState(false);
  const active = order.bills.some(b => b.status !== "void");
  return <section className="space-y-3 border-t border-line pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{t("Purchase bills")}</h3>{writable && order.orderType!=="manual" && !active && order.status === "draft" && <Button size="sm" variant="secondary" onClick={() => setEditing(v => !v)}>{t(editing ? "Back" : "Prepare bill")}</Button>}</div>
    <p className="text-xs text-slate-500">{t("Bills record confirmed pricing. Customers can pay through the client API; issuing a bill does not charge a wallet or submit a purchase.")}</p>
    {!order.bills.length && !editing && <p className="text-sm text-slate-500">{t("No purchase bills yet.")}</p>}
    {editing && !active && <BillForm key={`${order.id}:${order.version}`} order={order} onSaved={async () => { setEditing(false); await refresh(); }} />}
    {order.bills.map(bill => <article key={bill.id} className="space-y-3 rounded-lg border border-line p-4">
      <div className="flex flex-wrap justify-between gap-2"><PreviewBadge>{t(bill.status === "issued" ? "Issued · Unpaid" : bill.status === "void" ? "Void" : "Paid")}</PreviewBadge><span className="text-xs text-slate-500">{new Date(bill.createdAt).toLocaleString(locale)} · {t("Pricing version")} {bill.policyVersion}</span></div>
      <p className="break-all font-mono text-xs text-slate-500">{bill.id}</p>
      {bill.lines.map((line, i) => <p className="text-sm" key={i}>{line.name} · {line.sku} × {line.quantity} — {money(line.goodsCents, bill.currency)} + {t("Service fee")} {money(line.serviceCents, bill.currency)}</p>)}
      <Breakdown value={bill} />
      {bill.estimated && <p className="text-sm text-amber-700">{t("Estimated manual order bill. Confirmed costs may require an additional payment.")}</p>}
      <p className="text-sm">{t("Amount paid")}: {money(bill.paidCents??0,bill.currency)} · {t("Amount due")}: {money(bill.dueCents??0,bill.currency)}</p>
      {!!bill.overpaidCents && <p className="text-sm text-amber-700">{t("Overpayment pending review")}: {money(bill.overpaidCents,bill.currency)}</p>}
      {bill.voidReason && <p className="break-words text-sm">{t("Void reason")}: {bill.voidReason}</p>}
      {writable && bill.status === "issued" && !bill.paidCents && <VoidBill orderId={order.id} bill={bill} refresh={refresh} />}
    </article>)}
  </section>;
}
function Breakdown({ value }: { value: Pick<ProcurementBill, "currency" | "goodsCents" | "serviceCents" | "shippingCents" | "totalCents"> }) {
  const { t } = useI18n();
  return <dl className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-sm">{([["Products", value.goodsCents], ["Service fee", value.serviceCents], ["Domestic freight", value.shippingCents], ["Bill total", value.totalCents]] as const).map(([label, amount]) => <div key={label} className="contents"><dt>{t(label)}</dt><dd className="text-right font-semibold">{money(amount, value.currency)}</dd></div>)}</dl>;
}
function BillForm({ order, onSaved }: { order: ProcurementDetail; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const [id, setId] = useState(() => crypto.randomUUID()), [costs, setCosts] = useState<Record<string, string>>({});
  const policy = useQuery({ queryKey: ["admin", "product-pricing"], queryFn: () => api<PricingSettings>("/api/admin/settings/product-pricing") });
  const request = () => ({ orderVersion: order.version, policyVersion: policy.data?.policy?.version, costs: order.items.map(i => ({ itemId: i.id, costCnyCents: Math.round(Number(costs[i.id]) * 100) })) });
  const preview = useMutation({ mutationFn: () => api<ProductQuote>(`/api/admin/procurement/${order.id}/bill-preview`, { method: "POST", body: JSON.stringify(request()) }) });
  // Issue exactly the previewed values. Edits clear the preview and use a new idempotency key.
  const issue = useMutation({ mutationFn: () => api(`/api/admin/procurement/${order.id}/bills`, { method: "POST", body: JSON.stringify({ id, orderVersion: order.version, policyVersion: preview.data!.policy.version, costs: preview.data!.lines.map(({ itemId, costCnyCents }) => ({ itemId, costCnyCents })) }) }), onSuccess: onSaved });
  const pending = preview.isPending || issue.isPending;
  return <form className="space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/30 p-4" onSubmit={e => { e.preventDefault(); if (!pending) preview.mutate(); }}>
    <p className="text-sm">{t("Enter confirmed unit purchase costs in CNY. Draft prices are not copied automatically.")}</p>
    {policy.isError && <p role="alert">{t(policy.error.message)} <Button type="button" onClick={() => policy.refetch()}>{t("Retry")}</Button></p>}
    {policy.data && (!policy.data.policy || policy.data.policy.currency !== policy.data.currency) && <p className="text-sm">{t("Configure product pricing before issuing a bill.")} <Link className="text-indigo-700 underline" to="/admin/settings?tab=product-pricing">{t("Product pricing")}</Link></p>}
    <fieldset disabled={pending} className="space-y-3">{order.items.map(item => <Field key={item.id} label={`${item.name} · ${item.sku} × ${item.quantity}`}><input className={inputClass} type="number" required min="0.01" max="999999.99" step="0.01" aria-label={`${t("Purchase unit cost (CNY)")} · ${item.name}`} placeholder={t("Purchase unit cost (CNY)")} value={costs[item.id] ?? ""} onChange={e => { setCosts({ ...costs, [item.id]: e.target.value }); preview.reset(); issue.reset(); setId(crypto.randomUUID()); }} /></Field>)}</fieldset>
    {preview.isError && <p role="alert" className="text-red-700">{t(preview.error.message)}</p>}
    <Button type="submit" variant="secondary" disabled={pending || !policy.data?.policy || policy.data.policy.currency !== policy.data.currency}>{t(preview.isPending ? "Loading…" : "Preview bill")}</Button>
    {preview.data && <><p className="text-xs text-slate-500">{t("Pricing version")} {preview.data.policy.version} · 1 CNY = {formatCnyRate(preview.data.policy.cnyPerCurrencyE4)} {preview.data.currency}</p><Breakdown value={preview.data} /><Button type="button" loading={issue.isPending} disabled={pending} onClick={() => issue.mutate()}>{t("Confirm and issue bill")}</Button></>}
    {issue.isError && <p role="alert" className="text-red-700">{t(issue.error.message)}</p>}
  </form>;
}
function VoidBill({ orderId, bill, refresh }: { orderId: string; bill: ProcurementBill; refresh: () => Promise<void> }) {
  const { t: tr } = useAdminI18n();
  const { t } = useI18n(), [open, setOpen] = useState(false), [reason, setReason] = useState("");
  const save = useMutation({ mutationFn: () => api(`/api/admin/procurement/${orderId}/bills/${bill.id}/void`, { method: "POST", body: JSON.stringify({ version: bill.version, reason }) }), onSuccess: refresh });
  if (!open) return <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>{t("Void unpaid bill")}</Button>;
  return <div className="space-y-2"><Field label={tr("Void reason")}><input className={inputClass} value={reason} maxLength={500} disabled={save.isPending} onChange={e => setReason(e.target.value)} /></Field><p className="text-xs text-slate-500">{t("The bill remains in history. Issue a new bill after voiding to change its amounts.")}</p>{save.isError && <p role="alert">{t(save.error.message)}</p>}<div className="flex gap-2"><Button size="sm" disabled={reason.trim().length < 2 || save.isPending} onClick={() => save.mutate()}>{t("Confirm void")}</Button><Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => setOpen(false)}>{t("Back")}</Button></div></div>;
}
