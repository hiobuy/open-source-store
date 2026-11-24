import { WarehouseServiceCatalogCard } from "./WarehouseServiceCatalogCard";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { Link } from "react-router";
import { api, adminHref } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { cn } from "../lib/utils";
import { formatDateTime } from "../../domain/dates";
import { shipmentViewStatus } from "../../domain/admin-shipment-view";
import { Button, Card, DataRow, Dialog, Dimensions, ErrorState, LoadingBlock, PhotoGallery, Weight } from "../components/ui";
import { TimelineList } from "../components/timeline";
import { CarrierTracking } from "../components/carrier-tracking";
import type { ShipmentDetailView } from "./shipment-types";
import { allows, useAdminAccess } from "./shared";
import { ShipmentBadge, ShipmentAmount, ShipmentAddress, ShipmentCost, ShipmentFreight, ShipmentPacking, ShipmentTimes } from "./ShipmentViewParts";

export function ShipmentDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState("overview");
  const content = useRef<HTMLDivElement>(null);
  const query = useQuery({ queryKey: ["admin", "shipment", id], queryFn: () => api<ShipmentDetailView>(`/api/admin/shipments/${id}`) });
  const access = useAdminAccess();
  const item = query.data;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = content.current?.closest<HTMLElement>('[role="dialog"]');
    const controls = () => [...(panel?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),[tabindex="0"]') ?? [])].filter(el => el.getClientRects().length);
    controls()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const nodes = controls(), first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    panel?.addEventListener("keydown", trap);
    return () => { panel?.removeEventListener("keydown", trap); previous?.focus(); };
  }, [id]);
  const status = item ? item.viewStatus ?? shipmentViewStatus(item) : null;
  const services = item?.services ?? [];
  return <Dialog open drawer eyebrow="Shipment details" title={item?.publicId ?? t("Shipment details")} description={item ? `${item.owner?.name ?? t("Unknown")} · ${item.owner?.memberCode ?? "—"} · ${formatDateTime(item.createdAt)}` : undefined} onClose={onClose}
    tabs={<nav className="flex gap-6" aria-label={t("Shipment details")}>{[{ key: "overview", label: "Order overview" }, { key: "packages", label: "Linked packages" }, { key: "activity", label: "Activity" }].map(entry => <button key={entry.key} type="button" aria-pressed={tab === entry.key} onClick={() => setTab(entry.key)} className={cn("border-b-2 py-3 text-sm", tab === entry.key ? "border-indigo-600 font-semibold text-indigo-600" : "border-transparent text-slate-500")}>{t(entry.label)}</button>)}</nav>}
    footer={<><Button variant="secondary" onClick={onClose}>{t("Close")}</Button><Button variant="secondary" to={adminHref(`/admin/shipments/${id}`)}>{t("Open full details")}</Button>{item?.canPayHioBuy && allows(access.data, "shipments.pay") && <Button to={adminHref(`/admin/shipments/${id}?pay=1`)}>{t("Pay logistics cost")}</Button>}</>}>
    <div ref={content} className="space-y-5">{query.isPending ? <LoadingBlock rows={6} /> : query.isError || !item ? <ErrorState message={t("This shipment could not be found.")} onRetry={() => void query.refetch()} /> : <>
      <div className="flex items-center gap-3">{status && <ShipmentBadge status={status} />}<span className="text-xs text-slate-500">{t(item.syncFailed ? "Sync failed" : item.syncLabel ?? "Not linked")}</span></div>
      {tab === "activity" ? <><Card><h3 className="mb-4 font-semibold">{t("Activity")}</h3>{item.timeline?.length ? <TimelineList events={item.timeline.map(event => ({ ...event, title: t(event.title), detail: t(event.detail) }))} /> : <p className="text-sm text-slate-500">{t("No activity recorded yet.")}</p>}</Card><Card><ShipmentTimes item={item} /></Card></> : tab === "packages" ? <Card>
        <h3 className="mb-4 font-semibold">{t("Linked warehouse packages")} <span className="text-sm font-normal text-slate-400">{item.packages.length}</span></h3>
        <ul className="space-y-3">{item.packages.map(pkg => <li key={pkg.id}><Link to={adminHref(`/admin/packages?package=${encodeURIComponent(pkg.id)}`)} className="block rounded-xl border border-line p-4 hover:border-indigo-300"><p className="break-all text-sm font-semibold">{pkg.domesticTrackingNumber ?? pkg.publicId}</p><div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500"><Dimensions length={pkg.lengthMm} width={pkg.widthMm} height={pkg.heightMm} /><span>{pkg.weightGrams == null ? t("Awaiting measurement") : <Weight grams={pkg.weightGrams} />}</span><span>{pkg.cargoAttributes.map(attribute => t(attribute)).join(" · ")}</span></div><p className="mt-2 text-xs text-slate-400">{pkg.publicId} · {t("Linked to this shipment")}</p></Link></li>)}</ul>
        {!item.packages.length && <p className="py-8 text-center text-sm text-slate-500">{t("No linked warehouse packages.")}</p>}
      </Card> : <>
        <Card><h3 className="mb-4 font-semibold">{t("Transport information")}</h3><dl className="space-y-2 text-sm"><DataRow label={t("Shipping method")} value={item.shippingMethod?.routeName ?? "—"} /><DataRow label={t("HioBuy shipment")} value={item.hiobuyOrderSn ?? t("Pending sync")} /><DataRow label={t("International tracking number")} value={item.trackingNumber ?? t("Generated after dispatch")} /></dl>
          <div className="mt-5 border-t border-line pt-5"><h3 className="mb-4 font-semibold">{t("Packing information")}</h3><ShipmentPacking item={item} />{item.packingInstruction && <p className="mt-3 text-sm text-slate-500">{t("Packing instruction")}: {t(item.packingInstruction)}</p>}{item.packingNote && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-500">{item.packingNote}</p>}</div>
          <div className="mt-5 border-t border-line pt-5"><h3 className="mb-4 font-semibold">{t("Packing photos and video")}</h3>{item.photos.some(photo => photo.url) ? <PhotoGallery photos={item.photos.filter(photo => photo.url)} /> : <div className="flex items-center gap-3 rounded-lg border border-dashed border-line bg-slate-50 p-5 text-slate-400"><Package size={28} /><div><p className="text-sm">{t("No packing photos yet.")}</p><p className="mt-1 text-xs">{t("Photos appear after warehouse packing and upload.")}</p></div></div>}</div>
          <div className="mt-5"><div className="mb-3 flex justify-between gap-3 text-sm"><h3 className="font-semibold">{t("Linked package services")}</h3><span className="text-slate-400">{services.filter(service => service.status === "COMPLETED").length} / {services.length}</span></div>{services.length ? services.map(service => <div key={service.id} className="flex justify-between gap-3 border-t border-dashed border-line py-3 text-sm"><div><p>{service.serviceName}</p>{service.note && <p className="mt-1 text-xs text-slate-500">{service.note}</p>}{service.completedAt && <p className="mt-1 text-xs text-slate-400">{formatDateTime(service.completedAt)}</p>}</div><span className="text-xs text-slate-500">{t(({ REQUESTED: "Pending", PROCESSING: "Processing", COMPLETED: "Completed", FAILED: "Failed", CANCELLED: "Cancelled" } as Record<string, string>)[service.status] ?? service.status)}</span></div>) : <p className="text-xs text-slate-500">{t("No package service requests.")}</p>}</div>
        </Card>
          <WarehouseServiceCatalogCard stage="OUTBOUND" />
        <Card><h3 className="mb-4 font-semibold">{t("Destination address / route")}</h3><ShipmentAddress item={item} /></Card>
        <Card><h3 className="mb-4 font-semibold">{t("Customer freight")}</h3><ShipmentFreight item={item} /><dl className="mt-3 divide-y divide-slate-100">{item.charges.map(charge => <DataRow key={charge.id} label={`${charge.name} · ${t(charge.status)}`} value={<ShipmentAmount amount={charge.amountFen} currency={charge.currency} />} />)}</dl></Card>
        {allows(access.data, "earnings.read") && <Card><ShipmentCost item={item} /></Card>}
        <CarrierTracking shipmentId={item.id} admin />
      </>}
    </>}</div>
  </Dialog>;
}
