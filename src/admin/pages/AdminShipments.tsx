import { adminPage, adminPageSize } from "../../domain/admin-pagination";
import { AdminListViewport, AdminPagination } from "./AdminListLayout";
import { useI18n as useAdminI18n } from "../lib/i18n";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { COUNTRIES } from "../../domain/countries";
import { CreditCard, Download, Globe, Info, Package, Truck } from "lucide-react";
import { shipmentViewTabs, shipmentViewStatus } from "../../domain/admin-shipment-view";
import type { ShipmentView } from "./shipment-types";
import { ShipmentDrawer } from "./ShipmentDrawer";
import { ShipmentList } from "./ShipmentList";
import { exportPreviewCsv } from "./preview/shared";
import { useToast } from "../components/toast";
import { Button, Dialog, ErrorState, SearchInput } from "../components/ui";
import { ApiError, api } from "../lib/api";
import { cn } from "../lib/utils";
import { AdminHeader, ListEmpty, RowsSkeleton, allows, filterControl, useAdminAccess } from "./shared";

type SyncReport = { checked?: number; updated?: number; unchanged?: number; failed: number; needsReview: number; items: { id: string; publicId: string; outcome: string; message: string }[] };

type ShipmentPage = { items: ShipmentView[]; page: number; pageSize: number; total: number; counts: Record<string, number> };

export function AdminShipments() {
  const { t: tr, currency, locale } = useAdminI18n();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const access = useAdminAccess();
  const canReadCosts = allows(access.data, "earnings.read");
  const orderId = params.get("shipment");
  function openOrder(id: string | null) { const next = new URLSearchParams(params); if (id) next.set("shipment", id); else next.delete("shipment"); setParams(next); }
  const canPay = allows(access.data, "shipments.pay");
  const canOperate = allows(access.data, "shipments.write");
  const status = params.get("status") ?? "all";
  const q = params.get("q") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const country = params.get("country") ?? "";
  const link = params.get("link") ?? "all";
  const page = adminPage(params.get("page"));
  const pageSize = adminPageSize(params.get("pageSize"));
  const query = useQuery({
    queryKey: ["admin", "shipments", status, q, from, to, country, link, page, pageSize],
    queryFn: () => api<ShipmentPage>(`/api/admin/shipments?${listQuery({ status, q, from, to, country, link, page, pageSize })}`),
    placeholderData: keepPreviousData,
  });
  const [searchRevision, setSearchRevision] = useState(0);
  function clearFilters() {
    setSelected([]);
    setSearchRevision(n => n + 1);
    update({ status: "all", q: "", from: "", to: "", country: "", link: "all" });
  }
  useEffect(() => { setSelected([]); }, [status, q, from, to, page, pageSize, link, country]);
  const items = query.data?.items ?? [];
  const pullable = items.filter((item) => item.canPull);
  const pull = useMutation({
    mutationFn: (scope: "selected" | "linked") => {
      const ids = selected.filter((id) => items.some((item) => item.id === id && item.canPull));
      return api<SyncReport>("/api/admin/shipments/pull", { method: "POST", body: JSON.stringify(scope === "linked" ? { scope } : { scope, ids }) });
    },
    onSuccess: async (result) => {
      setSelected([]);
      setReport(result);
      await queryClient.invalidateQueries({ queryKey: ["admin", "shipments"] });
      toast({ title: `${result.checked ?? 0} checked, ${result.updated ?? 0} updated, ${result.unchanged ?? 0} unchanged, ${result.failed} failed, ${result.needsReview} need review.`, tone: result.failed || result.needsReview ? "danger" : "success" });
    },
    onError: (reason) => toast({ title: tr(reason instanceof ApiError ? reason.message : "Could not pull shipment status."), tone: "danger" }),
  });
  const payable = items.filter((item) => item.canPayHioBuy);
  const payIds = selected.filter((id) => payable.some((item) => item.id === id));
  const pay = useMutation({
    mutationFn: () => api<{ paid: number; failed: number; skipped: number; items: { id: string; ok: boolean; message: string }[] }>("/api/admin/shipments/hiobuy-pay", { method: "POST", body: JSON.stringify({ ids: payIds }) }),
    onSuccess: async (result) => {
      setPayOpen(false);
      setSelected([]);
      await queryClient.invalidateQueries({ queryKey: ["admin", "shipments"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      toast({ title: `${result.paid} paid, ${result.failed} failed, ${result.skipped} not attempted.`, tone: result.failed || result.skipped ? "danger" : "success" });
    },
    onError: (reason) => toast({ title: tr(reason instanceof ApiError ? reason.message : "Could not pay HioBuy."), tone: "danger" }),
  });
  const pageIds = items.map((item) => item.id).join(",");
  useEffect(() => {
    const visible = new Set(pageIds ? pageIds.split(",") : []);
    setSelected((current) => current.filter((id) => visible.has(id)));
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


  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-slate-400">INTERNATIONAL SHIPMENTS</p>
      <AdminHeader title={tr("Logistics orders")} meta={tr("From consolidation to delivery: freight, payments and fulfillment at a glance.")} action={<>
        <Button size="sm" variant="secondary" disabled={!items.length || query.isFetching} onClick={() => exportPreviewCsv("shipments.csv", [["Logistics order", "Customer", "Status", "International tracking number", "Customer freight", "Currency", "Created"].map(label => tr(label)), ...items.filter(item => !selected.length || selected.includes(item.id)).map(item => [item.publicId, item.owner?.name ?? "", tr((item.viewStatus ?? shipmentViewStatus(item)).label), item.trackingNumber ?? "", item.charges.length ? (item.amountFen / 100).toFixed(2) : "", item.charges[0]?.currency ?? currency, item.createdAt])])}><Download size={15} />{tr(selected.length ? "Export selected" : "Export current page")}</Button>
        {canPay && <Button size="sm" variant="secondary" disabled={!payIds.length || payIds.length > 25} onClick={() => setPayOpen(true)}>{tr("Batch pay logistics cost")}</Button>}
        {canOperate && <Button size="sm" loading={pull.isPending && pull.variables === "linked"} onClick={() => pull.mutate("linked")}>{tr("Sync from HioBuy")}</Button>}
      </>} />
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-5">{[
        { key: "all", label: "All shipment orders", hint: "All international shipments in this view", icon: Truck },
        { key: "customer_due", label: "Awaiting customer payment", hint: "Waiting for the customer to pay freight", icon: CreditCard },
        { key: "wait_payment", label: "Awaiting HioBuy payment", hint: "Customer paid; HioBuy freight is still due", icon: CreditCard },
        { key: "wait_ship", label: "Shipment ready to dispatch", hint: "Paid and awaiting dispatch", icon: Package },
        { key: "shipped", label: "In transit", hint: "With the carrier, awaiting delivery", icon: Globe },
      ].map(metric => <button key={metric.key} type="button" aria-pressed={status === metric.key} onClick={() => update({ status: metric.key })} className={cn("rounded-xl border bg-white p-5 text-left hover:border-indigo-300", status === metric.key ? "border-indigo-300" : "border-line")}><div className="flex justify-between gap-2 text-sm text-slate-500"><span>{tr(metric.label)}</span><metric.icon size={18} className="shrink-0 text-slate-400" /></div><p className={cn("mt-4 text-3xl font-semibold tabular-nums", ["customer_due", "wait_payment"].includes(metric.key) ? "text-amber-700" : "text-ink")}>{query.isPending || query.isError ? "—" : query.data?.counts[metric.key] ?? 0}</p><p className="mt-3 text-xs leading-5 text-slate-400">{tr(metric.hint)}</p></button>)}</div>
      {report ? <p className="mb-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-[13px]">{report.checked ?? 0}{tr("checked ·")}{report.updated ?? 0}{tr("updated ·")}{report.unchanged ?? 0}{tr("unchanged ·")}{report.failed}{tr("failed ·")}{report.needsReview}{tr("need review")}</p> : null}
      <Dialog
        open={payOpen}
        title={tr("Pay HioBuy for selected shipments")}
        description={access.data?.hiobuyPay2fa ? "Authenticator codes are required. Open each shipment and confirm it on its own." : "Each shipment is paid on its own. A customer wallet is not charged. If one payment does not confirm, the rest are left unpaid."}
        onClose={() => { if (!pay.isPending) setPayOpen(false); }}
        footer={
          <>
            <Button variant="secondary" disabled={pay.isPending} onClick={() => setPayOpen(false)}>{tr("Cancel")}</Button>
            <Button loading={pay.isPending} disabled={!payIds.length || access.data?.hiobuyPay2fa} onClick={() => pay.mutate()}>{tr("Pay")}{payIds.length}</Button>
          </>
        }
      >
        <ul className="max-h-64 space-y-2 overflow-auto text-[13px]">
          {payable.filter((item) => payIds.includes(item.id)).map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3">
              <span className="font-medium">{item.publicId}</span>
              <span className="text-slate-500">{item.customerPayment} · {item.hiobuyPayment}</span>
            </li>
          ))}
        </ul>
        {selected.length > payIds.length ? <p className="mt-3 text-[12px] text-slate-500">{selected.length - payIds.length}{tr("selected shipment")}{selected.length - payIds.length === 1 ? "" : "s"}{tr("cannot be paid and will be skipped.")}</p> : null}
      </Dialog>
      <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5"><h2 className="flex items-center gap-2 border-b-2 border-indigo-600 py-4 text-sm font-semibold text-indigo-600"><Truck size={18} />{tr("Shipment order management")}</h2><p className="flex items-center gap-2 text-xs text-slate-400"><Info size={14} />{tr("Customer freight in {currency}; HioBuy cost in CNY", { currency })}</p></div>
      <nav role="tablist" aria-label={tr("Shipment status")} className="flex gap-5 overflow-x-auto px-5">{shipmentViewTabs.filter(tab => tab.key !== "cancelled" || status === tab.key || Boolean(query.data?.counts.cancelled)).map(tab => <button key={tab.key} type="button" role="tab" aria-selected={status === tab.key} onClick={() => update({ status: tab.key })} className={cn("flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 py-4 text-sm", status === tab.key ? "border-ink font-semibold text-ink" : "border-transparent text-slate-500 hover:text-ink")}>{tr(tab.label)}<span className={cn("rounded-md px-1.5 py-0.5 text-xs tabular-nums", status === tab.key ? "bg-indigo-50 text-indigo-600" : tab.key === "exception" ? "bg-orange-50 text-orange-600" : "bg-slate-100 text-slate-400")}>{query.isPending || query.isError ? "—" : query.data?.counts[tab.key] ?? 0}</span></button>)}</nav>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-5 py-4">
            <SearchInput shortcut={!orderId && !payOpen} className="mb-0 basis-full [&_input]:h-9 [&_input]:shadow-none lg:min-w-60 lg:flex-1" defaultValue={q} key={searchRevision} placeholder={tr("Shipment, international tracking, customer or domestic tracking")} label={tr("Search shipments")} onSearch={(next) => update({ q: next })} />
            <div className={cn("flex h-9 max-w-full items-center gap-1 rounded-md border bg-white px-2", from || to ? "border-slate-400" : "border-slate-200")}>
              <input className="h-7 w-[7.6rem] bg-transparent text-[13px] text-slate-700 outline-none" type="date" max={to || undefined} aria-label={tr("Created from")} value={from} onChange={(event) => update({ from: event.target.value })} />
              <span className="text-slate-300" aria-hidden="true">{tr("Date range to")}</span>
              <input className="h-7 w-[7.6rem] bg-transparent text-[13px] text-slate-700 outline-none" type="date" min={from || undefined} aria-label={tr("Created to")} value={to} onChange={(event) => update({ to: event.target.value })} />
            </div>
            <select className={cn(filterControl, "h-9 min-w-28 flex-1 sm:w-32 sm:flex-none", country && "border-slate-400")} aria-label={tr("Destination")} value={country} onChange={(event) => update({ country: event.target.value })}>
              <option value="">{tr("Any country")}</option>
              {COUNTRIES.map((item) => (
                <option key={item.code} value={item.code}>{new Intl.DisplayNames([locale], { type: "region" }).of(item.code)}</option>
              ))}
            </select>
            <select className={cn(filterControl, "h-9 min-w-28 flex-1 sm:w-32 sm:flex-none", link !== "all" && "border-slate-400")} aria-label={tr("Shipment sync status")} value={link} onChange={(event) => update({ link: event.target.value })}>
              <option value="all">{tr("Any sync")}</option>
              <option value="linked">{tr("Synced")}</option>
              <option value="unlinked">{tr("Pending sync")}</option>
              <option value="failed">{tr("Sync failed")}</option>
            </select>
            <Button variant="ghost" size="sm" onClick={clearFilters}>{tr("Clear shipment filters")}</Button>
      </div>
        {selected.length ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-indigo-50 px-5 py-2">
            <p className="text-[13px] text-slate-600">{selected.length}{tr("selected")}{selected.length > 25 && <span className="ml-2 text-amber-700">{tr("Select up to 25 records for batch operations.")}</span>}</p>
            <div className="flex flex-wrap gap-2">
              {canOperate ? <Button size="sm" variant="secondary" loading={pull.isPending && pull.variables === "selected"} disabled={selected.length > 25 || !selected.some((id) => pullable.some((item) => item.id === id))} onClick={() => pull.mutate("selected")}>{tr("Sync selected")}</Button> : null}
              {canPay ? <Button size="sm" disabled={!payIds.length || payIds.length > 25} onClick={() => setPayOpen(true)}>{tr("Batch pay logistics cost")}</Button> : null}
              <Button variant="ghost" size="sm" onClick={() => setSelected([])}>{tr("Clear selection")}</Button>
            </div>
          </div>
        ) : null}
        <AdminListViewport label={tr("Logistics orders")} busy={query.isFetching} resetKey={JSON.stringify([status, q, from, to, country, link, page, pageSize])}>
        {query.isLoading ? <RowsSkeleton /> : null}
        {query.error ? <div className="p-4"><ErrorState message={tr("Could not load shipments.")} onRetry={() => void query.refetch()} /></div> : null}
        {query.data && query.data.items.length === 0 ? <ListEmpty title={tr("Nothing in this view")} body={tr("Try another status or a wider date range.")} /> : null}
        {query.data && query.data.items.length > 0 ? (
          <div className={cn("transition-opacity", query.isPlaceholderData && "opacity-60")}>
            <ShipmentList items={items} selected={selected} onSelect={setSelected} onOpen={openOrder} canReadCosts={canReadCosts} canPay={canPay} />

          </div>
        ) : null}
        </AdminListViewport>
        <AdminPagination page={query.data?.page ?? page} pageSize={pageSize} total={query.data?.total ?? 0} disabled={query.isFetching || query.isError}
          onChange={next => { setSelected([]); const nextParams = new URLSearchParams(params); nextParams.set("page", String(next)); setParams(nextParams); }}
          onPageSizeChange={size => { setSelected([]); update({ pageSize: String(size) }); }} />
      </div>
      {orderId && <ShipmentDrawer key={orderId} id={orderId} onClose={() => openOrder(null)} />}
    </div>
  );
}

function listQuery(input: { status: string; q: string; from: string; to: string; country: string; link: string; page: number; pageSize: number }) {
  const query = new URLSearchParams();
  if (input.status !== "all") query.set("status", input.status);
  if (input.q) query.set("q", input.q);
  if (input.from) query.set("from", input.from);
  if (input.to) query.set("to", input.to);
  if (input.country) query.set("country", input.country);
  if (input.link !== "all") query.set("link", input.link);
  query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
  return query.toString();
}
