import { formatCnyRate } from "../../domain/exchange-rates";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Field, inputClass } from "../components/ui";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { ProductPolicy } from "../../domain/product-pricing";
import { RowsSkeleton } from "./shared";
import { useToast } from "../components/toast";

export type PricingSettings = { policy: ProductPolicy | null; currency: string; exchangeRate: { cnyPerUnitE4: number; version: number } | null };
export function ProductPricing({ onDirty }: { onDirty: (dirty: boolean) => void }) {
  const { t } = useI18n();
  const query = useQuery({ queryKey: ["admin", "product-pricing"], queryFn: () => api<PricingSettings>("/api/admin/settings/product-pricing") });
  if (query.isPending) return <RowsSkeleton rows={3} />;
  if (query.isError) return <div role="alert"><p>{t(query.error.message)}</p><Button onClick={() => query.refetch()}>{t("Retry")}</Button></div>;
  return <PricingForm key={`${query.data.policy?.version ?? 0}:${query.data.exchangeRate?.version ?? 0}`} settings={query.data} onDirty={onDirty} />;
}
function PricingForm({ settings, onDirty }: { settings: PricingSettings; onDirty: (dirty: boolean) => void }) {
  const { t } = useI18n(), client = useQueryClient(), toast = useToast(), policy = settings.policy;
  const [fields, setFields] = useState({ markupBps: String((policy?.markupBps ?? 0) / 100), fixedCnyCents: String((policy?.fixedCnyCents ?? 0) / 100), serviceBps: String((policy?.serviceBps ?? 0) / 100), serviceCnyCents: String((policy?.serviceCnyCents ?? 0) / 100) });
  const save = useMutation({ mutationFn: () => api("/api/admin/settings/product-pricing", { method: "PUT", body: JSON.stringify({ ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, Math.round(Number(value) * 100)])), currency: settings.currency, version: policy?.version ?? 0 }) }), onSuccess: async () => { onDirty(false); toast({ title: t("Product pricing saved."), tone: "success" }); await client.invalidateQueries({ queryKey: ["admin", "product-pricing"] }); } });
  return <form className="max-w-3xl space-y-5 rounded-lg border border-line bg-white p-5" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
    <div><h2 className="font-semibold">{t("Product pricing")}</h2><p className="mt-2 text-sm text-slate-500">{t("Selling price = purchase cost + percentage markup + fixed markup. Service fees use the selling price. Fixed fees apply per item; domestic freight is converted without markup.")}</p></div>
    <p className="text-sm">{t("Customer currency")}: <strong>{settings.currency}</strong> · {t("Pricing version")}: {policy?.version ?? t("Not configured")}</p>
    <p className="text-sm text-slate-500">{t("Exchange rates")}: {settings.exchangeRate ? `1 CNY = ${formatCnyRate(settings.exchangeRate.cnyPerUnitE4)} ${settings.currency}` : t("Configure an enabled exchange rate first.")} · {t("Managed in Exchange rates.")}</p>
    <fieldset disabled={save.isPending} className="grid gap-4 sm:grid-cols-2">
      {([ ["markupBps", "Product markup (%)", 0, 100, "0.01"], ["fixedCnyCents", "Fixed markup per item (CNY)", 0, 999999.99, "0.01"], ["serviceBps", "Service fee (%)", 0, 100, "0.01"], ["serviceCnyCents", "Fixed service fee per item (CNY)", 0, 999999.99, "0.01"] ] as const).map(([key, label, min, max, step]) => <Field key={key} label={label}><input className={inputClass} type="number" required min={min} max={max} step={step} value={fields[key]} onChange={e => { setFields({ ...fields, [key]: e.target.value }); onDirty(true); }} /></Field>)}
    </fieldset>
    <p className="text-xs text-slate-500">{t("New bills use these rules. Existing bill snapshots stay unchanged. No wallet payment is triggered.")}</p>
    {save.isError && <p role="alert" className="text-red-700">{t(save.error.message)}</p>}
    <Button type="submit" loading={save.isPending} disabled={!settings.exchangeRate}>{t("Save product pricing")}</Button>
  </form>;
}
