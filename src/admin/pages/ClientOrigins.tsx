import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { Button, ErrorState, LoadingBlock, inputClass } from "../components/ui";

type Settings = { origins: string[]; source: string };
const endpoint = "/api/admin/settings/client-origins";
export function ClientOrigins({ canWrite, onDirty }: { canWrite: boolean; onDirty: (value: boolean) => void }) {
  const { t } = useI18n();
  const cache = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => { onDirty(draft !== null); return () => onDirty(false); }, [draft, onDirty]);
  const query = useQuery({ queryKey: ["admin", "client-origins"], queryFn: () => api<Settings>(endpoint) });
  const save = useMutation({
    mutationFn: () => api<Settings>(endpoint, { method: "PUT", body: JSON.stringify({ origins: (draft ?? "").split(/[\n,]/).map(s => s.trim()).filter(Boolean) }) }),
    onSuccess: data => { cache.setQueryData(["admin", "client-origins"], data); setDraft(null); },
  });
  if (query.isLoading) return <LoadingBlock rows={3} />;
  if (!query.data) return <ErrorState message={t("Could not load settings.")} onRetry={() => void query.refetch()} />;
  return <form className="max-w-3xl space-y-4" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
    <h2>{t("Client origins")}</h2>
    <p>{t("One origin per line. HTTPS supports ports; HTTP is allowed only for localhost. Saving replaces environment defaults. An empty list disables cross-origin access.")}</p>
    <textarea aria-label={t("Client origins")} className={inputClass + " min-h-40"} disabled={!canWrite || save.isPending} value={draft ?? query.data.origins.join("\n")} onChange={e => setDraft(e.target.value)} placeholder={"https://app.example.com:8443\nhttp://localhost:5173"} />
    {save.error && <p role="alert">{save.error.message}</p>}
    {save.isSuccess && draft === null && <p role="status">{t("Saved")}</p>}
    <Button type="submit" disabled={!canWrite || draft === null} loading={save.isPending}>{t("Save")}</Button>
  </form>;
}
