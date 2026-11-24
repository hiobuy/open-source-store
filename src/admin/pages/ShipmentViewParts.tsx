import type { DisplayStatus } from "../../domain/status";
import { cn } from "../lib/utils";
import { Box, CreditCard, Plus, Truck, UserRound } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { formatMoney } from "../../domain/locale";
import { packingVolume, packingChargeableWeight } from "../../domain/admin-shipment-view";
import { formatCnyFen } from "../../domain/freight";
import { Weight } from "../components/ui";
import type { ShipmentView } from "./shipment-types";

export function ShipmentPacking({ item }: { item: ShipmentView }) {
  const { t, locale } = useI18n();
  const volume = packingVolume(item);
  const chargeable = packingChargeableWeight(item);
  return <dl className="space-y-2 text-xs text-slate-500 [&_dd]:text-right [&_dd]:font-medium [&_dd]:text-slate-600">
    <div className="flex justify-between gap-4"><dt>{t("Carton count")}</dt><dd>{item.cartons.length ? t("{count} cartons", { count: item.cartons.length }) : t("Awaiting packing")}</dd></div>
    <div className="flex justify-between gap-4"><dt>{t("Actual weight")}</dt><dd>{item.finalWeightGrams == null ? t("Awaiting measurement") : <Weight grams={item.finalWeightGrams} />}</dd></div>
    <div className="flex justify-between gap-2"><dt className="shrink-0">{t("Total volume")}</dt><dd title={volume == null ? t("Complete packed carton dimensions are not available.") : undefined}>{volume == null ? t("No measurement") : `${volume.toLocaleString(locale, { maximumFractionDigits: 6 })} m³`}</dd></div>
    <div className="flex justify-between gap-2 border-t border-dashed border-line pt-2"><dt>{t("Chargeable weight (reference)")}</dt><dd className="whitespace-nowrap" title={t(chargeable == null ? "Complete packed carton weights and dimensions are not available." : "Sum of each carton's greater actual or volumetric weight, using 5000 cm³/kg; reference only.")}>{chargeable == null ? t("No measurement") : <Weight grams={chargeable} />}</dd></div>
  </dl>;
}

export function ShipmentAddress({ item }: { item: ShipmentView }) {
  const { t, locale } = useI18n();
  const address = item.destination;
  return <div className="space-y-1 text-xs leading-5 wrap-anywhere text-slate-500">{address ? <>
    <p className="font-medium text-ink">{address.name}</p><p>{t("Phone")}: {address.phone || "—"}</p>
    <p>{[address.addressLine1, address.addressLine2].filter(Boolean).join(", ")}</p>
    <p>{[address.district, address.city, address.state].filter(Boolean).join(", ")}</p>
    <p>{t("Postal code")}: {address.postalCode}</p><p>{new Intl.DisplayNames([locale], { type: "region" }).of(address.countryCode)}</p>
  </> : <p>{t("No destination")}</p>}
    <p className="mt-3 flex items-start gap-2 border-t border-dashed border-line pt-2"><Truck size={14} className="mt-1 shrink-0" />{item.shippingMethod?.routeName ?? t("Not assigned")}</p>
  </div>;
}

export function ShipmentFreight({ item }: { item: ShipmentView }) {
  const { t } = useI18n();
  const billed = item.charges.some(charge => ["DUE", "PAID"].includes(charge.status));
  return <div><p className="font-semibold tabular-nums text-ink">{billed ? <ShipmentAmount amount={item.amountFen} currency={item.charges.find(charge => ["DUE", "PAID"].includes(charge.status))?.currency} /> : t("Awaiting quote")}</p><p className={cn("mt-2 text-xs", item.customerPayment === "Customer paid" ? "text-emerald-700" : item.customerPayment === "Customer due" ? "text-amber-700" : "text-slate-500")}>{t(item.customerPayment ?? "Customer not billed")}</p></div>;
}

export function ShipmentCost({ item }: { item: ShipmentView }) {
  const { t } = useI18n();
  const earning = item.earning;
  const profit = earning.status === "unavailable" ? null : earning.grossProfitUsdFen;
  return <div className="space-y-2 text-xs text-slate-500">
    <div>{t("HioBuy logistics order")}<p className="mt-0.5 break-all font-medium text-slate-700">{item.hiobuyOrderSn ?? t("Pending sync")}</p></div>
    <div>{t("Logistics cost")}<div className="font-semibold tabular-nums text-ink">
      {earning.hiobuyCostUsdFen != null && <p><ShipmentAmount amount={earning.hiobuyCostUsdFen} currency="USD" /></p>}
      {earning.hiobuyCostCnyFen != null ? <p className={earning.hiobuyCostUsdFen == null ? undefined : "font-normal text-slate-500"}>{formatCnyFen(earning.hiobuyCostCnyFen)}</p> : earning.hiobuyCostUsdFen == null && t("Awaiting quote")}
    </div><p className={cn("mt-1", item.hiobuyPaymentStatus === "PAID" ? "text-emerald-700" : item.hiobuyPaymentStatus === "UNPAID" || item.hiobuyPaymentStatus === "PARTIAL" ? "text-amber-700" : "text-slate-500")}>{t(item.hiobuyPayment ?? "HioBuy —")}</p></div>
    <div className="border-t border-dashed border-line pt-2">{t(earning.status === "finalized" || earning.status === "adjusted" ? "Shipping gross profit" : "Provisional profit")}<p className={cn("mt-1 font-semibold tabular-nums", profit == null ? "text-slate-400" : profit < 0 ? "text-red-600" : "text-emerald-700")}>{profit == null ? "—" : <ShipmentAmount amount={profit} currency="USD" />}</p></div>
  </div>;
}

export function ShipmentTimes({ item }: { item: ShipmentView }) {
  const { t, locale } = useI18n();
  const formatter = new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const rows = [
    { label: "Created", value: item.createdAt, icon: Plus },
    { label: "Packed", value: item.times?.packedAt, icon: Box },
    { label: "Customer payment time", value: item.earning.paidAt, icon: UserRound },
    { label: "Logistics payment time", value: item.times?.hiobuyPaidAt, icon: CreditCard },
    { label: "Shipped", value: item.times?.shippedAt, icon: Truck },
  ];
  return <dl className="space-y-2 text-[11px] leading-4">{rows.map(row => <div key={row.label} title={t(row.label)} className="flex items-center gap-1.5 whitespace-nowrap"><dt className="flex shrink-0 items-center gap-1 text-slate-400"><row.icon size={13} aria-hidden="true" /><span className="sr-only">{t(row.label)}</span></dt><dd className={row.value ? "text-slate-600 tabular-nums" : "text-slate-400"}>{row.value ? <time dateTime={row.value}>{formatter.format(new Date(row.value))}</time> : t("No timestamp")}</dd></div>)}</dl>;
}

export function ShipmentAmount({ amount, currency }: { amount: number; currency?: string }) {
  const i18n = useI18n();
  return <>{formatMoney(amount, currency ?? i18n.currency, i18n.locale)}</>;
}

export function ShipmentBadge({ status }: { status: DisplayStatus }) {
  const { t } = useI18n();
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs", ({ info: "bg-violet-50 text-violet-600", warning: "bg-amber-50 text-amber-700", success: "bg-emerald-50 text-emerald-700", danger: "bg-red-50 text-red-600", neutral: "bg-slate-100 text-slate-500" })[status.tone])}><span className="size-1.5 rounded-full bg-current" />{t(status.label)}</span>;
}

export function ShipmentOwner({ item }: { item: ShipmentView }) {
  const { t } = useI18n();
  const name = item.owner?.name ?? t("Unknown");
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return <div className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-violet-50 text-xs font-semibold text-violet-600">{initials}</span><div className="min-w-0"><p className="break-words text-sm font-medium text-ink">{name}</p><p className="mt-1 text-xs text-slate-400">{item.owner?.memberCode ?? "—"}</p></div></div>;
}
