import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import type { DomesticTracking } from "../../types/operations";
import { CarrierTracking } from "../components/carrier-tracking";
import { Dialog, ErrorState, LoadingBlock } from "../components/ui";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";

export function OrderTrackingButton({ kind, id, number }: { kind: "domestic" | "international"; id: string; number: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const label = kind === "domestic" ? "Track domestic shipment" : "Track international shipment";
  return <>
    <button type="button" aria-haspopup="dialog" className="text-left text-sm font-medium text-indigo-600 hover:underline" onClick={() => setOpen(true)}>{t(label)}</button>
    {open && createPortal(
      <Dialog open size="lg" title={label} description={number} onClose={() => setOpen(false)}>
        {kind === "domestic" ? <DomesticTrackingResult id={id} /> : <CarrierTracking shipmentId={id} admin standalone />}
      </Dialog>,
      document.body,
    )}
  </>;
}

function DomesticTrackingResult({ id }: { id: string }) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ["admin", "domestic-tracking", id],
    queryFn: () => api<DomesticTracking>(`/api/admin/procurement/${encodeURIComponent(id)}/logistics`),
    refetchOnWindowFocus: false,
  });
  if (query.isPending) return <LoadingBlock rows={2} />;
  if (query.isError) return <ErrorState message="Tracking could not be loaded." onRetry={() => void query.refetch()} />;
  const { packages, trackingStatus } = query.data;
  return <div className="space-y-4 text-sm">
    {trackingStatus === "unavailable" && <ErrorState message="Tracking could not be loaded." onRetry={() => void query.refetch()} />}
    {trackingStatus === "not_ready" && <p>{t("Domestic tracking is not ready for this order yet.")}</p>}
    {trackingStatus === "empty" && !packages.length && <p>{t("No carrier scans yet.")}</p>}
    {packages.map((parcel, index) => <section key={parcel.trackingNumber ?? index} className="rounded-lg border border-line p-4">
      <h3 className="break-all font-semibold">{parcel.trackingNumber ?? t("Package {number}", { number: index + 1 })}</h3>
      <p className="text-xs text-slate-500">{[parcel.carrier, parcel.statusLabel].filter(Boolean).join(" · ")}</p>
      {parcel.events.length ? <ol className="mt-3 space-y-3 border-l border-indigo-200 pl-4">
        {parcel.events.map((step, i) => <li key={i}><dl className="space-y-1">
          {Object.entries(step).filter(([, value]) => value != null && value !== "").map(([key, value]) => <div key={key} className="flex flex-wrap gap-x-2">
            <dt className="text-slate-500">{t(key)}</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
          </div>)}
        </dl></li>)}
      </ol> : <p className="mt-3 text-slate-500">{t("No carrier scans yet.")}</p>}
    </section>)}
  </div>;
}
