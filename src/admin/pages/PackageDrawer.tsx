import { WarehouseServiceCatalogCard } from "./WarehouseServiceCatalogCard";
import { formatMoney } from "../../domain/locale";
import { storageDurationDays, receiptPlaceholder, warehousePackageLabel } from "../../domain/warehouse-packages";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Package } from "lucide-react";
import { Link } from "react-router";
import { api, adminHref } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { cn } from "../lib/utils";
import { formatDateTime, formatWarehouseReceipt } from "../../domain/dates";
import { Button, Card, DataRow, Dialog, Dimensions, ErrorState, LoadingBlock, PhotoGallery, Weight } from "../components/ui";
import { TimelineList } from "../components/timeline";
import { PackageGoodsDetails } from "../components/PackageGoodsDetails";
import { ProductImage } from "../components/ProductImage";
import type { PackageItem } from "../../types/api";
import type { PackagePurchaseLink } from "../../types/admin-packages";
import { StatusMark, type AdminPackage } from "./shared";

export function PackagePurchaseItems({ links }: { links: PackagePurchaseLink[] | null | undefined }) {
  const { t, locale } = useI18n();
  if (links == null) return <p className="text-sm text-slate-500">{t("Purchase links are unavailable for this view.")}</p>;
  if (!links.length) return <div className="rounded-lg border border-dashed border-line p-5 text-sm text-slate-500">{t("No linked purchase order. Package goods are shown in the overview.")}</div>;
  const groups = [...new Set(links.map(link => link.orderId))].map(orderId => links.filter(link => link.orderId === orderId));
  return <div className="space-y-3">{groups.map(group => <article key={group[0].orderId} className="rounded-xl border border-line bg-white p-4">
    <Link to={adminHref(`/admin/procurement?order=${encodeURIComponent(group[0].orderId)}`)} className="inline-flex items-center gap-2 break-all text-sm font-semibold text-indigo-600 hover:underline">{group[0].orderNumber}<ExternalLink size={13} /></Link>
    <ul className="mt-3 divide-y divide-slate-100">{group.map(link => <li key={link.id} className="py-3 first:pt-0 last:pb-0">
      <div className="flex gap-3"><ProductImage url={link.imageUrl} name={link.name} /><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{link.name}</p><p className="mt-1 break-words text-xs text-slate-500">{link.variantLabel || link.sku}</p><p className="mt-2 text-xs text-slate-500">{t("Order quantity")}: {link.orderedQuantity} · {t("Unit price")}: {link.saleCurrency && link.saleUnitCents != null ? formatMoney(link.saleUnitCents, link.saleCurrency, locale) : "—"}</p></div></div>
      <div className="mt-3 flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"><span className="text-slate-500">{t("Allocated here / received here")}</span><span className="font-medium tabular-nums">{link.allocatedQuantity} / {link.receivedQuantity}</span></div>
    </li>)}</ul>
  </article>)}<p className="text-xs leading-5 text-slate-500">{t("Orders link to individual goods and quantities. A pre-alert does not count as warehouse receipt. Open the order for procurement and payment details.")}</p></div>;
}

export function PackageDrawer({ id, tab, onTab, onClose }: { id: string; tab: string; onTab: (tab: string) => void; onClose: () => void }) {
  const { t, locale } = useI18n();
  const query = useQuery({ queryKey: ["admin", "package", id], queryFn: () => api<AdminPackage & PackageItem>(`/api/admin/packages/${id}`) });
  const item = query.data;
  const days = item ? storageDurationDays(item) : null;
  // Keep keyboard focus in this drawer and restore the opener on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = document.querySelector<HTMLElement>('[role="dialog"]');
    const controls = () => [...(panel?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? [])].filter(el => el.getClientRects().length);
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
  const tabs = [{ key: "overview", label: "Package overview" }, { key: "orders", label: "Order links" }, { key: "activity", label: "Activity" }];
  return <Dialog open drawer eyebrow="Package details" title={item?.publicId ?? t("Package details")} description={item ? `${item.owner?.name ?? t("Unknown")} · ${item.owner?.memberCode ?? "—"} · ${formatDateTime(item.createdAt)}` : undefined} onClose={onClose}
    tabs={<nav aria-label={t("Package details")} className="flex gap-6">{tabs.map(entry => <button key={entry.key} type="button" aria-pressed={tab === entry.key} onClick={() => onTab(entry.key)} className={cn("border-b-2 py-3 text-sm", tab === entry.key ? "border-indigo-600 font-semibold text-indigo-600" : "border-transparent text-slate-500 hover:text-ink")}>{t(entry.label)}</button>)}</nav>}
    footer={<><span className="mr-auto text-xs text-slate-500">{t("A pre-alert is not warehouse receipt.")}</span><Button variant="secondary" onClick={onClose}>{t("Close")}</Button><Button to={adminHref(`/admin/packages/${id}`)}>{t("Open full details")}</Button></>}>
    {query.isPending ? <LoadingBlock rows={5} /> : query.isError || !item ? <ErrorState message={t("This package could not be found.")} onRetry={() => void query.refetch()} /> : <div className="space-y-4">
      {tab === "orders" ? <PackagePurchaseItems links={item.purchaseLinks} /> : tab === "activity" ? <Card><h3 className="mb-4 text-sm font-semibold">{t("Activity")}</h3>{item.timeline?.length ? <TimelineList events={item.timeline} /> : <p className="text-sm text-slate-500">{t("No activity recorded yet.")}</p>}</Card> : <>
        {item.exception && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">{item.exception.type}</p><p className="mt-1">{item.exception.description}</p></div>}
        <Card><div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{t("Package information")}</h3><StatusMark label={warehousePackageLabel(item.displayStatus)} tone={item.displayStatus.tone} /></div><dl className="divide-y divide-slate-100">
          <DataRow label={t("Domestic tracking number")} value={<span className="break-all tabular-nums">{item.domesticTrackingNumber}</span>} />
          <DataRow label={t("Courier")} value={item.courier || "—"} />
          <DataRow label={t("Customer")} value={`${item.owner?.name ?? "—"} · ${item.owner?.memberCode ?? "—"}`} />
          <DataRow label={t("Configured receiving warehouse")} value={item.receivingWarehouse || t("Not recorded")} />
          <DataRow label={t("Bin location")} value={item.binLocation || t("Not assigned")} />
          <DataRow label={t("Time in storage")} value={days == null ? t(receiptPlaceholder(item.packageStatus)) : t("{count} days", { count: days })} />
          <DataRow label={t("Received at")} value={item.receivedAt ? formatWarehouseReceipt(item.receivedAt, locale) : t(receiptPlaceholder(item.packageStatus))} />
        </dl></Card>
        <div className="grid gap-4 sm:grid-cols-2"><Card><h3 className="mb-3 text-sm font-semibold">{t("Warehouse measurement")}</h3><dl className="divide-y divide-slate-100"><DataRow label={t("Actual weight")} value={item.weightGrams == null ? t("Awaiting measurement") : <Weight grams={item.weightGrams} />} /><DataRow label={t("Dimensions")} value={<Dimensions length={item.lengthMm} width={item.widthMm} height={item.heightMm} />} /></dl><p className="mt-3 text-xs text-slate-500">{item.freeStorageRemainingDays == null ? t(receiptPlaceholder(item.packageStatus)) : `${t("Free storage remaining")}: ${item.freeStorageRemainingDays} ${t("days")}`}</p></Card>
          <Card><h3 className="mb-3 text-sm font-semibold">{t("Warehouse photos")}</h3>{item.photos.some(photo => photo.url) ? <PhotoGallery photos={item.photos.filter(photo => photo.url)} /> : <div className="flex items-center gap-3 rounded-lg border border-dashed border-line p-4 text-xs text-slate-500"><Package size={24} /><span>{t("No warehouse photos yet.")}</span></div>}</Card></div>
          <WarehouseServiceCatalogCard stage="INBOUND" />
        <Card><h3 className="text-sm font-semibold">{t("Package goods")}</h3>{item.purchaseLinks?.length ? <PackagePurchaseItems links={item.purchaseLinks} /> : <PackageGoodsDetails item={item} />}</Card>
        {item.notes && <Card><h3 className="mb-2 text-sm font-semibold">{t("Notes")}</h3><p className="whitespace-pre-wrap break-words text-sm text-slate-600">{item.notes}</p></Card>}
      </>}
    </div>}
  </Dialog>;
}
