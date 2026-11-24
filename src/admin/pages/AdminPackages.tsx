import { adminPage, adminPageSize } from "../../domain/admin-pagination";
import { AdminListViewport, AdminPagination } from "./AdminListLayout";
import { formatMoney } from "../../domain/locale";
import { warehousePackageLabel } from "../../domain/warehouse-packages";
import { useI18n as useAdminI18n } from "../lib/i18n";
import { AlertTriangle, Boxes, Download, Info, Package, SlidersHorizontal, Truck, RefreshCw, ShoppingBag, ExternalLink } from "lucide-react";
import { PackageDrawer } from "./PackageDrawer";
import { ProductImage } from "../components/ProductImage";
import { exportPreviewCsv } from "./preview/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { formatDateTime } from "../../domain/dates";
import { PackageTabs, PackageTimes, PackageOwner, PackageMeasurements, PackageStorage } from "./PackageListParts";
import { CARGO_ATTRIBUTES, cargoLabel, type CargoAttribute } from "../../domain/status";
import { useToast } from "../components/toast";
import { Button, Dialog, ErrorState, SearchInput } from "../components/ui";
import { Checkbox } from "../components/ui/checkbox";
import { ApiError, api } from "../lib/api";
import { cn } from "../lib/utils";
import { AdminHeader, ListEmpty, ListFrame, RowsSkeleton, StatusMark, TableShell, filterControl, useDemoPreview, type AdminPackage } from "./shared";

const grid = "grid-cols-[1.25rem_minmax(175px,1.2fr)_minmax(235px,1.6fr)_minmax(130px,0.9fr)_110px_130px_minmax(165px,max-content)_100px]";
const primary = [
  { key: "all", label: "All packages" },
  { key: "pending", label: "Awaiting warehouse receipt" },
  { key: "in_warehouse", label: "In storage" },
  { key: "consolidated", label: "Allocated for packing" },
  { key: "wait_ship", label: "Awaiting dispatch" },
  { key: "shipped", label: "Dispatched from warehouse" },
  { key: "attention", label: "Exceptions and unclaimed" },
];
const more = [
  { key: "delivered", label: "Delivered" },
  { key: "transferring", label: "Transferring" },
  { key: "discarded", label: "Discarded" },
  { key: "unclaimed", label: "Unclaimed" },
  { key: "archived", label: "Archived" },
];

type PackagePage = { items: AdminPackage[]; page: number; pageSize: number; total: number; counts: Record<string, number> };
type SyncLog = {
  label: string;
  canRetry: boolean;
  remoteId: string | null;
  externalRef: string | null;
  reason: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attemptCount: number;
  requestId: string | null;
  updatedAt: string | null;
  history: { id: string; attempt: number; httpStatus: number | null; outcome: string; errorCode: string | null; errorMessage: string | null; requestId: string | null; createdAt: string }[];
};
type SyncReport = {
  synced?: number;
  checked?: number;
  updated?: number;
  unchanged?: number;
  failed: number;
  skipped?: number;
  needsReview: number;
  items: { id: string; publicId: string; outcome: string; message: string }[];
};

const syncTone: Record<string, string> = {
  "Not Connected": "bg-slate-100 text-slate-600",
  Pending: "bg-amber-50 text-amber-800",
  Syncing: "bg-sky-50 text-sky-800",
  Synced: "bg-emerald-50 text-emerald-800",
  Failed: "bg-red-50 text-red-700",
  "Needs review": "bg-orange-50 text-orange-800",
  "Not synced": "bg-white text-slate-600 ring-1 ring-slate-200",
};

export function AdminPackages() {
  const { t: tr } = useAdminI18n();
  const demo = useDemoPreview();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [logId, setLogId] = useState<string | null>(null);
  const [report, setReport] = useState<SyncReport | null>(null);
  const status = params.get("status") ?? "all";
  const q = params.get("q") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const cargo = params.get("cargo") ?? "";
  const link = params.get("link") ?? "all";
  const condition = params.get("condition") ?? "all";
  const page = adminPage(params.get("page"));
  const pageSize = adminPageSize(params.get("pageSize"));
  const [filtersOpen, setFiltersOpen] = useState(Boolean(from || to || cargo || condition !== "all" || link !== "all"));
  const activeId = params.get("package");
  const detailTab = ["overview", "orders", "activity"].includes(params.get("packageTab") ?? "") ? params.get("packageTab")! : "overview";
  function openPackage(id: string, tab = "overview") {
    const next = new URLSearchParams(params); next.set("package", id); next.set("packageTab", tab); setParams(next);
  }
  function closePackage() {
    const next = new URLSearchParams(params); next.delete("package"); next.delete("packageTab"); setParams(next, { replace: true });
  }
  const query = useQuery({
    queryKey: ["admin", "packages", status, q, from, to, cargo, link, condition, page, pageSize],
    queryFn: () => api<PackagePage>(`/api/admin/packages?${listQuery({ status, q, from, to, cargo, link, condition, page, pageSize })}`),
    placeholderData: keepPreviousData,
  });
  useEffect(() => { setSelected([]); }, [status, q, from, to, page, pageSize, link, cargo, condition]);
  const items = query.data?.items ?? [];
  const eligible = demo ? [] : items.filter((pkg) => pkg.canSync || pkg.canPull);
  const allEligibleSelected = eligible.length > 0 && eligible.every((pkg) => selected.includes(pkg.id));
  const someSelected = eligible.some((pkg) => selected.includes(pkg.id));
  const log = useQuery({
    queryKey: ["admin", "package-sync", logId],
    queryFn: () => api<SyncLog>(`/api/admin/packages/${logId}/sync`),
    enabled: Boolean(logId),
  });
  const syncSelected = useMutation({
    mutationFn: () => api<SyncReport>("/api/admin/packages/sync", { method: "POST", body: JSON.stringify({ ids: selected }) }),
    onSuccess: async (result) => {
      setSelected([]);
      setReport(result);
      await queryClient.invalidateQueries({ queryKey: ["admin", "packages"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "fulfillment-sync"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "package-sync"] });
      toast({ title: `${result.synced ?? 0} notices submitted, ${result.failed} failed, ${result.needsReview} need review.`, tone: result.failed || result.needsReview ? "danger" : "success" });
    },
    onError: (reason) => toast({ title: tr(reason instanceof ApiError ? reason.message : "Could not submit the selected notices."), tone: "danger" }),
  });
  const pullSelected = useMutation({
    mutationFn: (scope: "selected" | "linked") => {
      const ids = selected.filter((id) => items.some((pkg) => pkg.id === id && pkg.canPull));
      return api<SyncReport>("/api/admin/packages/pull", { method: "POST", body: JSON.stringify(scope === "linked" ? { scope } : { scope, ids }) });
    },
    onSuccess: async (result) => {
      setSelected([]);
      setReport(result);
      await queryClient.invalidateQueries({ queryKey: ["admin", "packages"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "package-sync"] });
      toast({ title: `${result.checked ?? 0} checked, ${result.updated ?? 0} updated, ${result.unchanged ?? 0} unchanged, ${result.failed} failed, ${result.needsReview} need review.`, tone: result.failed || result.needsReview ? "danger" : "success" });
    },
    onError: (reason) => toast({ title: tr(reason instanceof ApiError ? reason.message : "Could not pull status from HioBuy."), tone: "danger" }),
  });

  const pageIds = items.map((pkg) => pkg.id).join(",");
  useEffect(() => {
    const visible = new Set(pageIds ? pageIds.split(",") : []);
    setSelected((current) => {
      const next = current.filter((id) => visible.has(id));
      return next.length === current.length ? current : next;
    });
  }, [pageIds]);

  function update(patch: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
    }
    next.delete("page");
    setParams(next);
  }

  function toggle(id: string, on: boolean) {
    setSelected((current) => (on ? (current.includes(id) ? current : [...current, id]) : current.filter((item) => item !== id)));
  }

  function withCounts(tabs: { key: string; label: string }[]) {
    return tabs.map((item) => ({ ...item, count: query.data?.counts[item.key] ?? 0 }));
  }

  return (
    <div>
      <AdminHeader
        title={tr("Warehouse packages")}
        meta={tr("Purchase and forwarding parcels, with goods and order links in one place.")}
        action={<><Button size="sm" variant="secondary" disabled={!items.length || query.isFetching} onClick={() => exportPreviewCsv("warehouse-packages.csv", [["Package", "Domestic tracking number", "Customer", "Status", "Weight (g)", "Bin location", "Received at"].map(label => tr(label)), ...items.map(pkg => [pkg.publicId, pkg.domesticTrackingNumber, pkg.owner?.memberCode ?? "", tr(warehousePackageLabel(pkg.displayStatus)), pkg.weightGrams ?? "", pkg.binLocation ?? "", pkg.receivedAt ?? ""])])}><Download size={15} />{tr("Export current page")}</Button></>}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">{[
        { key: "all", label: "All packages", hint: "All parcels in this view", icon: Package },
        { key: "in_warehouse", label: "Packages in warehouse", hint: "Received or allocated for consolidation", icon: Boxes },
        { key: "pending", label: "Awaiting warehouse receipt", hint: "Pre-alert saved; awaiting warehouse receipt", icon: Truck },
        { key: "attention", label: "Needs attention", hint: "Exceptions and unclaimed parcels", icon: AlertTriangle },
      ].map(metric => <button key={metric.key} type="button" aria-pressed={status === metric.key} onClick={() => update({ status: metric.key })} className={cn("rounded-xl border bg-white p-4 text-left transition hover:border-indigo-300 sm:p-5", status === metric.key ? "border-indigo-300 ring-1 ring-indigo-100" : "border-line")}>
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500"><span>{tr(metric.label)}</span><metric.icon size={19} className="shrink-0 text-slate-400" /></div>
        <p className={cn("mt-4 text-3xl font-semibold tabular-nums tracking-tight", metric.key === "attention" ? "text-red-600" : metric.key === "pending" ? "text-amber-600" : "text-ink")}>{query.isPending || query.isError ? "—" : query.data?.counts[metric.key] ?? (metric.key === "in_warehouse" ? (query.data?.counts.received ?? 0) + (query.data?.counts.consolidated ?? 0) : 0)}</p>
        <p className="mt-2 text-xs text-slate-400">{tr(metric.hint)}</p>
      </button>)}</div>
      {report ? (
        <div className="mb-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-[13px]">
          <p className="font-medium text-ink">{report.checked != null ? `${report.checked} checked · ${report.updated ?? 0} updated · ${report.unchanged ?? 0} unchanged · ${report.failed} failed · ${report.needsReview} need review` : `${report.synced ?? 0} notices submitted · ${report.failed} failed · ${report.needsReview} need review · ${report.skipped ?? 0} skipped`}</p>
          <ul className="mt-2 space-y-1 text-slate-600">
            {report.items.map((item) => (
              <li key={item.id}><span className="font-medium text-ink">{item.publicId}</span> · {item.outcome === "needs_review" ? tr("Needs review") : item.outcome} — {item.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <ListFrame
        toolbar={
          <>
            <div className="w-full"><PackageTabs value={status} tabs={withCounts(primary)} more={withCounts(more)} onChange={key => update({ status: key })} /></div>
            <div className="flex w-full items-center overflow-hidden rounded-lg border border-line sm:max-w-xl sm:flex-1"><span className="hidden shrink-0 border-r border-line bg-slate-50 px-4 py-3 text-sm text-slate-700 lg:block">{tr("Package search")}</span><SearchInput key={q} className="mb-0 min-w-0 flex-1 [&_input]:rounded-none [&_input]:border-0 [&_input]:shadow-none" defaultValue={q} placeholder={tr("Package, tracking, customer, order or product")} label={tr("Search packages")} onSearch={(next) => update({ q: next })} /></div>
            <Button variant="secondary" size="sm" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={14} />{tr("More filters")}</Button>
            <Button variant="ghost" size="sm" onClick={() => update({ q: "", from: "", to: "", cargo: "", link: "all", condition: "all" })}>{tr("Reset")}</Button>
            <Button className="sm:ml-auto" variant="secondary" disabled={demo} loading={pullSelected.isPending && pullSelected.variables === "linked"} onClick={() => pullSelected.mutate("linked")}><RefreshCw size={17} />{tr("Sync warehouse")}</Button>
            {filtersOpen && <div className="flex w-full flex-wrap gap-2 border-t border-line pt-3">
            <div className={cn("flex h-8 items-center gap-1 rounded-md border bg-white px-2", from || to ? "border-slate-400" : "border-slate-200")}>
              <input className="h-7 w-[7.6rem] bg-transparent text-[13px] text-slate-700 outline-none" type="date" aria-label="Created from" value={from} onChange={(event) => update({ from: event.target.value })} />
              <span className="text-slate-300" aria-hidden="true">–</span>
              <input className="h-7 w-[7.6rem] bg-transparent text-[13px] text-slate-700 outline-none" type="date" aria-label="Created to" value={to} onChange={(event) => update({ to: event.target.value })} />
            </div>
            <select className={cn(filterControl, "w-36", cargo && "border-slate-400")} aria-label={tr("Cargo type")} value={cargo} onChange={(event) => update({ cargo: event.target.value })}>
              <option value="">{tr("Any cargo")}</option>
              {CARGO_ATTRIBUTES.map((item) => (
                <option key={item} value={item}>{cargoLabel(item)}</option>
              ))}
            </select>
            <select className={cn(filterControl, "w-36", condition !== "all" && "border-slate-400")} aria-label={tr("Condition")} value={condition} onChange={(event) => update({ condition: event.target.value })}>
              <option value="all">{tr("Any condition")}</option>
              <option value="exception">{tr("Exceptions")}</option>
              <option value="normal">{tr("Normal")}</option>
            </select>
            <select className={cn(filterControl, "w-36", link !== "all" && "border-slate-400")} aria-label="HioBuy sync" value={link} onChange={(event) => update({ link: event.target.value })}>
              <option value="all">{tr("Any sync")}</option>
              <option value="synced">{tr("Synced")}</option>
              <option value="pending">{tr("Pending")}</option>
              <option value="failed">{tr("Failed")}</option>
              <option value="needs_review">{tr("Needs review")}</option>
              <option value="not_synced">{tr("Not linked")}</option>
            </select>
            </div>}
          </>
        }
      >
        <div className="flex items-start gap-2 border-b border-indigo-100 bg-violet-50/70 px-5 py-4 text-[13px] leading-5 text-violet-400"><Info size={16} className="mt-0.5 shrink-0" /><span>{tr("A pre-alert is not warehouse receipt. Order links show the goods allocated to each parcel.")}</span></div>
        {selected.length ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2">
            <p className="text-[13px] text-slate-600">{selected.length}{tr("selected on this page")}{selected.length > 25 && <span className="ml-2 text-amber-700">{tr("Select up to 25 records for batch operations.")}</span>}</p>
            <div className="flex items-center gap-2">
              <Button size="sm" loading={pullSelected.isPending && pullSelected.variables === "selected"} disabled={selected.length > 25 || !selected.some((id) => items.some((pkg) => pkg.id === id && pkg.canPull))} onClick={() => pullSelected.mutate("selected")}>{tr("Sync selected")}</Button>
              <Button variant="secondary" size="sm" loading={syncSelected.isPending} disabled={selected.length > 25 || !selected.some((id) => items.some((pkg) => pkg.id === id && pkg.canSync))} onClick={() => syncSelected.mutate()}>{tr("Submit notice")}</Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected([])}>{tr("Clear selection")}</Button>
            </div>
          </div>
        ) : null}
        <AdminListViewport label={tr("Warehouse packages")} busy={query.isFetching} resetKey={JSON.stringify([status, q, from, to, cargo, link, condition, page, pageSize])}>
        {query.isLoading ? <RowsSkeleton /> : null}
        {query.error ? <div className="p-4"><ErrorState message={tr("Could not load packages.")} onRetry={() => void query.refetch()} /></div> : null}
        {query.data && query.data.items.length === 0 ? <ListEmpty title={tr("Nothing in this view")} body={tr("Try another status, a wider date range, or clear the search.")} /> : null}
        {query.data && query.data.items.length > 0 ? (
          <div className={cn("transition-opacity", query.isPlaceholderData && "opacity-60")}>
            <ul className="divide-y divide-slate-100 lg:hidden">
              {items.map(pkg => <li key={pkg.id} className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  <Checkbox className="mt-1" aria-label={`${tr("Select")} ${pkg.publicId}`} checked={selected.includes(pkg.id)} disabled={demo || (!pkg.canSync && !pkg.canPull)} onCheckedChange={checked => toggle(pkg.id, checked === true)} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => openPackage(pkg.id)}><span className="block break-all text-xs font-semibold text-slate-700">{pkg.domesticTrackingNumber || pkg.publicId}</span><span className="mt-1 block text-xs text-slate-400">{pkg.publicId}</span></button>
                  <StatusMark className="text-[10px] font-normal" label={warehousePackageLabel(pkg.displayStatus)} tone={pkg.displayStatus.tone} />
                </div>
                <PackageGoodsSummary pkg={pkg} onOpen={() => openPackage(pkg.id, "orders")} />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500"><PackageOwner owner={pkg.owner} /><PackageMeasurements pkg={pkg} /></div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><PackageStorage pkg={pkg} /><PackageTimes pkg={pkg} /></div>
                <div className="flex flex-wrap items-center justify-between gap-2"><SyncBadge label={pkg.syncLabel} problem={Boolean(pkg.syncReason)} onOpen={() => setLogId(pkg.id)} /><button className="text-sm font-medium text-indigo-600" onClick={() => openPackage(pkg.id)}>{tr("View details")}</button></div>
              </li>)}
            </ul>
            <div className="admin-package-table hidden lg:block">
              <TableShell bare scrollWithinParent grid={grid} minWidth={1180}
                head={["Tracking / package status", "Order links / goods", "Customer", "Weight / dimensions", "Storage / bin", "Receipt / packing / dispatch", "Actions"]}
                leading={<Checkbox aria-label={tr("Select packages on this page")} checked={allEligibleSelected ? true : someSelected ? "indeterminate" : false} disabled={!eligible.length} onCheckedChange={checked => setSelected(checked === true ? eligible.map(pkg => pkg.id) : [])} />}>
                {items.map(pkg => <li key={pkg.id} className={`grid ${grid} items-start gap-x-5 px-5 py-6 text-xs leading-[1.65] transition-colors hover:bg-slate-50/60`}>
                  <Checkbox className="mt-1" aria-label={`${tr("Select")} ${pkg.publicId}`} checked={selected.includes(pkg.id)} disabled={demo || (!pkg.canSync && !pkg.canPull)} onCheckedChange={checked => toggle(pkg.id, checked === true)} />
                  <div className="min-w-0 space-y-2"><button className="break-all text-left text-xs font-semibold text-slate-700 hover:text-indigo-600" onClick={() => openPackage(pkg.id)}>{pkg.domesticTrackingNumber || pkg.publicId}</button><div className="flex flex-wrap gap-1.5"><span className="rounded-md bg-slate-50 px-2 py-1"><StatusMark className="text-[10px] font-normal" label={warehousePackageLabel(pkg.displayStatus)} tone={pkg.displayStatus.tone} /></span>{!!pkg.purchaseLinks?.length && <span className="rounded bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-500">{tr("Purchase arrival")}</span>}{pkg.conditionStatus === "EXCEPTION" && <ConditionMark status={pkg.conditionStatus} />}</div><CargoLine attributes={pkg.cargoAttributes} /></div>
                  <PackageGoodsSummary pkg={pkg} onOpen={() => openPackage(pkg.id, "orders")} />
                  <PackageOwner owner={pkg.owner} />
                  <PackageMeasurements pkg={pkg} />
                  <PackageStorage pkg={pkg} />
                  <PackageTimes pkg={pkg} />
                  <div className="flex flex-col items-start gap-3"><button className="font-medium text-indigo-600 hover:underline" onClick={() => openPackage(pkg.id)}>{tr("View details")}</button><button className="text-xs text-slate-500 hover:text-indigo-600" onClick={() => openPackage(pkg.id, "orders")}>{tr("Order links")}</button><SyncBadge label={pkg.syncLabel} problem={Boolean(pkg.syncReason)} onOpen={() => setLogId(pkg.id)} /></div>
                </li>)}
              </TableShell>
            </div>

          </div>
        ) : null}
        </AdminListViewport>
        <AdminPagination page={query.data?.page ?? page} pageSize={pageSize} total={query.data?.total ?? 0} disabled={query.isFetching || query.isError}
          onChange={next => { setSelected([]); const nextParams = new URLSearchParams(params); nextParams.set("page", String(next)); setParams(nextParams); }}
          onPageSizeChange={size => { setSelected([]); update({ pageSize: String(size) }); }} />
      </ListFrame>
      {activeId && <PackageDrawer key={activeId} id={activeId} tab={detailTab} onTab={tab => openPackage(activeId, tab)} onClose={closePackage} />}
      <Dialog open={logId != null} title={log.data?.reason ? "Sync problem" : "Latest sync"} description={log.data?.reason ? undefined : "This is the most recent attempt for this package."} onClose={() => setLogId(null)}>
        {log.isLoading ? <p className="text-[13px] text-slate-500">{tr("Loading the latest attempt.")}</p> : null}
        {log.data ? (
          <div className="space-y-2 text-[13px] text-slate-600">
            {log.data.reason ? <p className="font-medium text-red-700">{log.data.reason}</p> : null}
            <p><span className="font-medium text-ink">{log.data.label}</span>{log.data.updatedAt ? <span> · {formatDateTime(log.data.updatedAt)}</span> : null}</p>
            <p>{tr("HioBuy reference")}{log.data.externalRef ?? "—"}{log.data.remoteId ? ` · remote ${log.data.remoteId}` : ""}</p>
            <p>{tr("Attempts")}{log.data.attemptCount}{log.data.requestId ? ` · request ${log.data.requestId}` : ""}{log.data.errorCode ? ` · ${log.data.errorCode}` : ""}</p>
            {log.data.history.length ? (
              <ul className="space-y-1">
                {log.data.history.map((attempt) => (
                  <li key={attempt.id}>{tr("Attempt")}{attempt.attempt}: {attempt.outcome}{attempt.httpStatus ? ` · HTTP ${attempt.httpStatus}` : ""}{attempt.errorMessage ? ` — ${attempt.errorMessage}` : ""}</li>
                ))}
              </ul>
            ) : (
              <p>{tr("No sync attempt yet. The local package is still saved.")}</p>
            )}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function SyncBadge({ label, problem, onOpen }: { label?: string; problem?: boolean; onOpen: () => void }) {
  const { t: tr } = useAdminI18n();
  const text = label || "Not Connected";
  return (
    <button type="button" className={cn("relative z-20 inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", syncTone[text] ?? "bg-slate-100 text-slate-600")} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpen(); }}>
      <span className="truncate">{tr(text)}</span>
      {problem ? <span className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full bg-red-600 text-[9px] leading-none font-bold text-white" aria-label={tr("Problem")}>!</span> : null}
    </button>
  );
}

function ConditionMark({ status }: { status: string }) {
  const { t: tr } = useAdminI18n();
  if (status === "EXCEPTION") return <span className="inline-flex w-fit items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-red-600/15 ring-inset">{tr("Exception")}</span>;
  return <span className="text-[12px] text-slate-400">{tr("Normal")}</span>;
}

function CargoLine({ attributes }: { attributes: CargoAttribute[] }) {
  const { t: tr } = useAdminI18n();
  if (attributes.length === 0) return <span className="text-[12px] text-slate-300">—</span>;
  const special = attributes.some((item) => item !== "GENERAL");
  return <span className={cn("inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold", special ? "border-amber-200 bg-amber-50 text-amber-800" : "border-indigo-100 bg-indigo-50 text-indigo-800")}>{attributes.map(value => tr(cargoLabel(value))).join(", ")}</span>;
}

function listQuery(input: { status: string; q: string; from: string; to: string; cargo: string; link: string; condition: string; page: number; pageSize: number }) {
  const query = new URLSearchParams();
  if (input.status !== "all") query.set("status", input.status);
  if (input.q) query.set("q", input.q);
  if (input.from) query.set("from", input.from);
  if (input.to) query.set("to", input.to);
  if (input.cargo) query.set("cargo", input.cargo);
  if (input.link !== "all") query.set("link", input.link);
  if (input.condition !== "all") query.set("condition", input.condition);
  query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
  return query.toString();
}

function PackageGoodsSummary({ pkg, onOpen }: { pkg: AdminPackage; onOpen: () => void }) {
  const { t, locale } = useAdminI18n();
  const links = pkg.purchaseLinks ?? [];
  const goods = links.length ? links.map(link => ({ id: link.id, name: link.name, imageUrl: link.imageUrl, quantity: link.allocatedQuantity, price: link.saleCurrency && link.saleUnitCents != null ? formatMoney(link.saleUnitCents, link.saleCurrency, locale) : null, variant: link.variantLabel || link.sku })) : (pkg.goodsItems ?? []).map((item, index) => ({ ...item, id: String(index), price: null, variant: "" }));
  return <div className="min-w-0 space-y-2">
    {!!links.length && <button onClick={onOpen} className="inline-flex items-center gap-2 break-all text-left text-xs font-medium text-indigo-600 hover:underline"><ShoppingBag size={14} />{[...new Set(links.map(link => link.orderNumber))].slice(0,2).join(" · ")}<ExternalLink size={13} /></button>}
    {goods.slice(0,2).map(item => <div key={item.id} className="flex gap-2.5"><div className="[&>button]:size-14 [&>span]:size-14"><ProductImage url={item.imageUrl} name={item.name} /></div><div className="min-w-0"><p className="line-clamp-2 text-xs font-medium text-ink" title={item.name}>{item.name}</p>{item.variant && <p className="truncate text-[11px] text-slate-400">{item.variant}</p>}<p className="mt-1 text-xs text-slate-500">{t(links.length ? "Allocated here" : "Quantity")} <strong className="text-sm font-bold text-ink">× {item.quantity}</strong> · {t("Unit price")} <strong className="text-xs font-semibold text-ink">{item.price ?? "—"}</strong></p></div></div>)}
    {!goods.length && <p className="text-xs font-medium text-slate-500">{pkg.productName || t("No goods details yet.")}</p>}
    {goods.length > 2 && <button onClick={onOpen} className="text-xs text-indigo-600">{t("View all goods")} ({goods.length})</button>}
    {!links.length && <p className="text-xs text-slate-400">{t(pkg.purchaseLinks == null ? "Purchase links unavailable" : "No linked purchase")}</p>}
  </div>;
}
