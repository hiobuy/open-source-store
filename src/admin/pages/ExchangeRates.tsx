import { formatCnyRate, cnyPerUnitFromE8 } from "../../domain/exchange-rates";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Field, inputClass } from "../components/ui";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { RowsSkeleton } from "./shared";

type Rate = { currency: string; cnyPerUnitE4: number; enabled: boolean; version: number; source: string; updatedAt: number; updatedBy: string };
type Settings = { settlementCurrency: string; currencies: { code: string; englishName: string }[]; items: Rate[] };
export function ExchangeRates({ canWrite, onDirty }: { canWrite: boolean; onDirty: (dirty: boolean) => void }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState("USD"), [dirty, setDirty] = useState(false);
  const query = useQuery({ queryKey: ["admin", "exchange-rates"], queryFn: () => api<Settings>("/api/admin/settings/exchange-rates") });
  if (query.isPending) return <RowsSkeleton rows={4} />;
  if (query.isError) return <div role="alert">{t(query.error.message)} <Button onClick={() => query.refetch()}>{t("Retry")}</Button></div>;
  const current = query.data.items.find(row => row.currency === selected);
  return <section className="max-w-4xl space-y-5">
    <div><h2 className="font-semibold">{t("Exchange rates")}</h2><p className="mt-2 text-sm text-slate-500">{t("Rates are target currency units per 1 CNY. Product and freight quotes share these rates. Display currency does not change settlement or payment.")}</p></div>
    {query.data.items.some(row => row.source === "legacy_conflict") && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t("Legacy product and freight rates differ. Confirm and save a unified rate before creating new quotes.")}</p>}
    <Field label={t("Currency")}><select className={inputClass} value={selected} onChange={event => { if (dirty && !window.confirm(t("You have unsaved changes. Leave this tab without saving?"))) return; setSelected(event.target.value); setDirty(false); onDirty(false); }}>{query.data.currencies.map(currency => <option key={currency.code} value={currency.code}>{currency.code}{query.data.items.find(row => row.currency === currency.code)?.enabled ? "" : ` · ${t("Not enabled")}`}</option>)}</select></Field>
    <RateForm key={`${selected}:${current?.version ?? 0}`} currency={selected} rate={current} locked={selected === "CNY" || selected === "USD" || selected === query.data.settlementCurrency} canWrite={canWrite} onDirty={value => { setDirty(value); onDirty(value); }} />
    <RateHistory key={selected} currency={selected} />
  </section>;
}
function RateForm({ currency, rate, locked, canWrite, onDirty }: { currency: string; rate?: Rate; locked: boolean; canWrite: boolean; onDirty: (dirty: boolean) => void }) {
  const { t } = useI18n(), client = useQueryClient();
  const [value, setValue] = useState(rate ? formatCnyRate(rate.cnyPerUnitE4) : ""), [enabled, setEnabled] = useState(locked || rate?.enabled || false);
  const [saved, setSaved] = useState(false);
  const save = useMutation({ mutationFn: () => {
    if (!/^\d+(\.\d{1,8})?$/.test(value)) throw new Error("Enter a positive rate with up to eight decimal places.");
    const [whole, decimal = ""] = value.split(".");
    const unitsPerCnyE8 = Number(whole) * 100000000 + Number(decimal.padEnd(8, "0"));
    const cnyPerUnitE4 = cnyPerUnitFromE8(unitsPerCnyE8);
    if (!Number.isSafeInteger(cnyPerUnitE4) || cnyPerUnitE4 < 1 || cnyPerUnitE4 > 999999999) throw new Error("Enter a positive rate with up to eight decimal places.");
    return api(`/api/admin/settings/exchange-rates/${currency}`, { method: "PUT", body: JSON.stringify({ unitsPerCnyE8, enabled, version: rate?.version ?? 0 }) });
  }, onSuccess: async () => { onDirty(false); setSaved(true); await Promise.all([client.invalidateQueries({ queryKey: ["admin", "exchange-rates"] }), client.invalidateQueries({ queryKey: ["admin", "exchange-rate-history", currency] }), client.invalidateQueries({ queryKey: ["admin", "settings"] }), client.invalidateQueries({ queryKey: ["admin", "product-pricing"] })]); } });
  return <form className="space-y-4 rounded-lg border border-line bg-white p-5" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
    <fieldset disabled={!canWrite || save.isPending} className="space-y-4">
      <Field label={`1 CNY = ${currency}`}><input className={inputClass} value={value} required inputMode="decimal" readOnly={currency === "CNY"} onChange={event => { setValue(event.target.value); onDirty(true); setSaved(false); }} /></Field>
      {Number(value) > 0 && Number.isSafeInteger(Math.round(Number(value) * 100000000)) && Math.round(Number(value) * 100000000) > 0 && cnyPerUnitFromE8(Math.round(Number(value) * 100000000)) > 0 && <p className="text-xs text-slate-500">{t("Effective rate")}: 1 CNY = {formatCnyRate(cnyPerUnitFromE8(Math.round(Number(value) * 100000000)))} {currency} · {t("Converted using existing settlement precision.")}</p>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} disabled={locked} onChange={event => { setEnabled(event.target.checked); onDirty(true); setSaved(false); }} />{t("Enabled")}</label>
      <p className="text-xs text-slate-500">{t("CNY stays at 1. Settlement currencies cannot be disabled. Existing bills and paid orders retain their snapshots.")}</p>
      {rate && <p className="text-xs text-slate-500">{t("Version")}: {rate.version} · {new Date(rate.updatedAt).toLocaleString()}</p>}
      {canWrite && <Button type="submit" loading={save.isPending}>{t("Save changes")}</Button>}
    </fieldset>
    {saved && <p role="status">{t("Saved")}</p>}
    {save.isError && <div role="alert" className="text-sm text-red-700">{t(save.error.message)} <Button type="button" onClick={() => client.invalidateQueries({ queryKey: ["admin", "exchange-rates"] })}>{t("Reload")}</Button></div>}
  </form>;
}
function RateHistory({ currency }: { currency: string }) {
  const { t } = useI18n(); const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["admin", "exchange-rate-history", currency, page], queryFn: () => api<{ items: Rate[] }>(`/api/admin/settings/exchange-rates/${currency}/history?page=${page}`) });
  return <div className="space-y-3 rounded-lg border border-line bg-white p-5"><h3 className="font-semibold">{t("Rate history")}</h3>
    {query.isPending ? <RowsSkeleton rows={2} /> : query.isError ? <p role="alert">{t(query.error.message)} <Button onClick={() => query.refetch()}>{t("Retry")}</Button></p> : <>
      {!query.data.items.length && <p className="text-sm text-slate-500">{t("No rate history yet.")}</p>}
      {query.data.items.map(row => <div key={row.version} className="flex flex-wrap justify-between gap-2 border-b border-line pb-2 text-sm"><span>v{row.version} · 1 CNY = {formatCnyRate(row.cnyPerUnitE4)} {currency} · {t(row.enabled ? "Enabled" : "Not enabled")}</span><span className="break-all text-xs text-slate-500">{new Date(row.updatedAt).toLocaleString()} · {row.updatedBy}</span></div>)}
      <div className="flex items-center gap-3"><Button disabled={page === 1} onClick={() => setPage(page - 1)}>{t("Previous")}</Button><span>{page}</span><Button disabled={query.data.items.length < 20} onClick={() => setPage(page + 1)}>{t("Next")}</Button></div>
    </>}
  </div>;
}
