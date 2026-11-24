import { useI18n } from "../lib/i18n";
import { Dimensions, Weight } from "../components/ui";
import { storageDurationDays, receiptPlaceholder } from "../../domain/warehouse-packages";
import { formatWarehouseReceipt } from "../../domain/dates";
import { cn } from "../lib/utils";
import type { AdminPackage } from "./shared";

export function PackageOwner({ owner }: { owner: AdminPackage["owner"] }) {
  const { t } = useI18n();
  if (!owner) return <span className="text-slate-400">{t("Unknown")}</span>;
  const initials = owner.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return <div className="flex min-w-0 items-center gap-2.5"><span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-indigo-500">{initials}</span><div className="min-w-0"><p className="truncate text-xs text-ink" title={owner.name}>{owner.name}</p><p className="mt-1 text-xs text-slate-400">{owner.memberCode}</p></div></div>;
}

type Tab = { key: string; label: string; count: number };
export function PackageTabs({ value, tabs, more, onChange }: { value: string; tabs: Tab[]; more: Tab[]; onChange: (key: string) => void }) {
  const { t } = useI18n();
  return <div className="flex min-w-0 items-center gap-3">
    <div className="flex min-w-0 flex-1 gap-5 overflow-x-auto" role="tablist" aria-label={t("Warehouse packages")}>
      {tabs.map(tab => <button key={tab.key} role="tab" aria-selected={value === tab.key} onClick={() => onChange(tab.key)} className={cn("flex shrink-0 items-center gap-2 whitespace-nowrap border-b-[3px] py-4 text-sm", value === tab.key ? "border-slate-800 font-semibold text-ink" : "border-transparent text-slate-400 hover:text-ink")}>
        {t(tab.label)}<span className={cn("rounded px-1.5 py-0.5 text-xs font-medium tabular-nums", value === tab.key ? "bg-indigo-100 text-indigo-600" : tab.key === "attention" ? "bg-orange-50 text-orange-600" : "bg-slate-100 text-slate-400")}>{tab.count}</span>
      </button>)}
    </div>
    <select aria-label={t("More package statuses")} className="w-20 shrink-0 bg-transparent text-xs text-slate-500" value={more.some(tab => tab.key === value) ? value : ""} onChange={event => { if (event.target.value) onChange(event.target.value); }}>
      <option value="" disabled>{t("More")}</option>{more.map(tab => <option key={tab.key} value={tab.key}>{t(tab.label)} ({tab.count})</option>)}
    </select>
  </div>;
}

export function PackageTimes({ pkg }: { pkg: AdminPackage }) {
  const { t, locale } = useI18n();
  const date = (value: string) => new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
  return <dl className="space-y-2 text-[11px] leading-4">{[
    { label: "Warehouse receipt", at: pkg.receivedAt },
    { label: "Packing", at: pkg.packedAt },
    { label: "Dispatch", at: pkg.shippedAt },
  ].map(row => <div key={row.label} className="flex items-center gap-1.5 whitespace-nowrap"><dt className="shrink-0 text-slate-400">{t(row.label)}</dt><dd className={cn("shrink-0 tabular-nums", row.at ? "text-slate-700" : "text-slate-400")}>{row.at ? <time dateTime={row.at}>{row.label === "Warehouse receipt" ? formatWarehouseReceipt(row.at, locale) : date(row.at)}</time> : t("No timestamp")}</dd></div>)}</dl>;
}

export function PackageMeasurements({ pkg }: { pkg: AdminPackage }) {
  const { t } = useI18n();
  return <div className="space-y-2"><p className="font-semibold">{pkg.weightGrams == null ? t("Awaiting measurement") : <Weight grams={pkg.weightGrams} />}</p>
    <p className="text-xs text-slate-500">{t("Dimensions")}: {pkg.lengthMm && pkg.widthMm && pkg.heightMm ? <Dimensions length={pkg.lengthMm} width={pkg.widthMm} height={pkg.heightMm} /> : t("Awaiting measurement")}</p></div>;
}

export function PackageStorage({ pkg }: { pkg: AdminPackage }) {
  const { t } = useI18n();
  const days = storageDurationDays(pkg);
  return <div className="space-y-2 text-xs text-slate-500"><p className="font-medium text-ink">{t("Configured receiving warehouse")}: {pkg.receivingWarehouse || t("Not recorded")}</p>
    <p>{t("Bin location")}: {pkg.binLocation || t("Not recorded")}</p>
    <p>{t("Time in storage")}: {days == null ? t(receiptPlaceholder(pkg.packageStatus)) : t("{count} days", { count: days })}</p>
    {pkg.freeStorageRemainingDays != null && ["RECEIVED", "CONSOLIDATED"].includes(pkg.packageStatus) && <p className={pkg.storageWarning ? "text-amber-700" : undefined}>{t("Free storage remaining")}: {pkg.freeStorageRemainingDays} {t("days")}</p>}</div>;
}
