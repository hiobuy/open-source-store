import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { Button, ErrorState, Field, LoadingBlock, inputClass } from "../components/ui";

type Settings = { ttlSeconds: number; generation: string };
const endpoint = "/api/admin/settings/product-search-cache";
const queryKey = ["admin", "product-search-cache"];
export function ProductSearchCache({ canWrite, onDirty }: { canWrite: boolean; onDirty: (value: boolean) => void }) {
  const { t } = useI18n();
  const cache = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => { onDirty(draft !== null); return () => onDirty(false); }, [draft, onDirty]);
  const query = useQuery({ queryKey, queryFn: () => api<Settings>(endpoint) });
  const save = useMutation({
    mutationFn: () => api<Settings>(endpoint, { method: "PUT", body: JSON.stringify({ ttlSeconds: Number(draft) * 60 }) }),
    onSuccess: data => { cache.setQueryData(queryKey, data); setDraft(null); },
  });
  if (query.isLoading) return <LoadingBlock rows={3} />;
  if (!query.data) return <ErrorState message={t("Could not load settings.")} onRetry={() => void query.refetch()} />;
  return <form className="max-w-3xl space-y-4" onSubmit={e => { e.preventDefault(); if (canWrite && draft !== null) save.mutate(); }}>
    <h2 className="font-medium">{t("Product search cache")}</h2>
    <p className="text-sm text-slate-500">{t("Reuse keyword search results with the same platform, language, page, filters and sorting. Product details and checkout pricing remain unchanged.")}</p>
    <Field label={t("Cache duration (minutes)")} hint={t("Default: 5 minutes. Set 0 to disable; maximum 1440 minutes. Saving immediately invalidates previous cached results.")}>
      <input className={inputClass} type="number" required min={0} max={1440} step={1} disabled={!canWrite || save.isPending} value={draft ?? query.data.ttlSeconds / 60} onChange={e => setDraft(e.target.value)} />
    </Field>
    {save.error && <p role="alert">{save.error.message}</p>}
    {save.isSuccess && draft === null && <p role="status">{t("Saved")}</p>}
    <Button type="submit" disabled={!canWrite || draft === null} loading={save.isPending}>{t("Save")}</Button>
  </form>;
}
