import { WarehouseServiceCatalogCard } from "./WarehouseServiceCatalogCard";
import { warehousePackageLabel } from "../../domain/warehouse-packages";
import { PackageGoodsDetails } from "../components/PackageGoodsDetails";
import { PackagePurchaseItems } from "./PackageDrawer";
import { useI18n as useAdminI18n } from "../lib/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { formatDateTime, formatWarehouseReceipt } from "../../domain/dates";
import { CARGO_ATTRIBUTES, cargoLabel, type CargoAttribute } from "../../domain/status";
import {
  Button,
  Card,
  CargoBadge,
  ConfirmDialog,
  CopyButton,
  Dialog,
  Dimensions,
  ErrorState,
  Field,
  LoadingBlock,
  Money,
  Notice,
  PhotoGallery,
  SectionHeading,
  Weight,
  inputClass,
  plural,
} from "../components/ui";
import { Checkbox } from "../components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { useToast } from "../components/toast";
import { ApiError, api } from "../lib/api";
import { cn } from "../lib/utils";
import type { PackageItem } from "../../types/api";
import { TimelineList } from "../components/timeline";
import { AdminHeader, StatusMark, allows, toInt, useAdminAccess, useAdminAction, useDemoPreview, type Owner } from "./shared";

type Detail = PackageItem & { purchaseLinks?: import("../../types/admin-packages").PackagePurchaseLink[] | null; ownerId: string; owner: Owner; hiobuyStatus: string | null; hiobuySyncedAt: string | null; syncLabel?: string; syncRemoteId?: string | null; syncReason?: string | null; canSync?: boolean; canPull?: boolean };
type SyncLog = {
  label: string;
  canRetry: boolean;
  remoteId: string | null;
  inboundNoticeId: string | null;
  inboundNoticeStatus: string | null;
  warehousePackageId: string | null;
  syncedAt: string | null;
  externalRef: string | null;
  reason: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attemptCount: number;
  requestId: string | null;
  updatedAt: string | null;
  canPull: boolean;
  history: { id: string; attempt: number; operation: string; operationLabel: string; outcome: string; previousStatus: string | null; newStatus: string | null; httpStatus: number | null; errorCode: string | null; errorMessage: string | null; requestId: string | null; startedAt: string | null; finishedAt: string | null; createdAt: string }[];
};

export function AdminPackageDetail() {
  const { t: tr, locale } = useAdminI18n();
  const { id = "" } = useParams();
  const demo = useDemoPreview();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<null | "RETURN" | "DISPOSAL">(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navigate = useNavigate();
  const access = useAdminAccess();
  const query = useQuery({ queryKey: ["admin", "package", id], queryFn: () => api<Detail>(`/api/admin/packages/${id}`) });
  const syncLog = useQuery({ queryKey: ["admin", "package-sync", id], queryFn: () => api<SyncLog>(`/api/admin/packages/${id}/sync`), enabled: Boolean(id) });
  const retrySync = useMutation({
    mutationFn: () => api(`/api/admin/packages/sync`, { method: "POST", body: JSON.stringify({ ids: [id] }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "package", id] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "package-sync", id] });
      toast({ title: tr("Inbound notice submitted. Status stays Pending until HioBuy reports the parcel received."), tone: "success" });
    },
    onError: (reason) => toast({ title: tr(reason instanceof ApiError ? reason.message : "Could not submit this notice."), tone: "danger" }),
  });
  const pullNow = useMutation({
    mutationFn: () => api<{ updated: number; unchanged: number; failed: number; needsReview: number; items: { message: string; outcome: string }[] }>(`/api/admin/packages/pull`, { method: "POST", body: JSON.stringify({ ids: [id], scope: "selected" }) }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "package", id] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "package-sync", id] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "packages"] });
      const item = result.items[0];
      toast({ title: item?.message ?? "Status pull finished.", tone: result.failed || result.needsReview ? "danger" : "success" });
    },
    onError: (reason) => toast({ title: tr(reason instanceof ApiError ? reason.message : "Could not pull status from HioBuy."), tone: "danger" }),
  });
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: () => api<{ connected: boolean }>("/api/admin/settings") });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "package", id] });
    await queryClient.invalidateQueries({ queryKey: ["admin", "packages"] });
  };
  const exception = useMutation({
    mutationFn: (action: string) => api(`/api/admin/packages/${id}/exceptions`, { method: "POST", body: JSON.stringify({ action }) }),
    onSuccess: async () => {
      setConfirm(null);
      toast({ title: tr("Sent on behalf of the customer."), tone: "success" });
      await refresh();
    },
    onError: (reason) => toast({ title: tr(reason instanceof ApiError ? reason.message : "Could not update the exception."), tone: "danger" }),
  });
  const remove = useMutation({
    mutationFn: () => api<{ publicId: string }>(`/api/admin/packages/${id}`, { method: "DELETE" }),
    onSuccess: async (result) => {
      setConfirmDelete(false);
      queryClient.removeQueries({ queryKey: ["admin", "package", id] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "packages"] });
      toast({ title: `${result.publicId} was cancelled and deleted. The customer was notified.`, tone: "success" });
      navigate("/admin/packages");
    },
    onError: (reason) => {
      setConfirmDelete(false);
      toast({ title: tr(reason instanceof ApiError ? reason.message : "Could not delete the package."), tone: "danger" });
      void refresh();
    },
  });
  const finish = useAdminAction<Detail>((pkg) => `/api/admin/packages/${pkg.id}/complete-services`, {
    success: (pkg) => `Services for ${pkg.publicId} marked done. The customer was notified.`,
  });
  const item = query.data;
  if (query.isLoading) return <LoadingBlock rows={4} />;
  if (!item) return <ErrorState message={tr("This package could not be found.")} onRetry={() => void query.refetch()} action={<Button variant="ghost" size="sm" to="/admin/packages">{tr("Back to packages")}</Button>} />;
  const measured = item.weightGrams != null;

  return (
    <div>
      <AdminHeader
        back={{ to: "/admin/packages", label: "Warehouse packages" }}
        title={item.publicId}
        badge={<StatusMark label={warehousePackageLabel(item.displayStatus)} tone={item.displayStatus.tone} />}
        meta={
          <span className="inline-flex flex-wrap items-center gap-x-1.5">
            <span className="tabular-nums">{item.domesticTrackingNumber}</span>
            <CopyButton value={item.domesticTrackingNumber} label={tr("Copy tracking number")} variant="ghost" size="sm" iconOnly />
            <span>· {item.courier}</span>
            <span>· {item.owner?.name ?? tr("Unknown")} {item.owner?.memberCode ?? ""}</span>
            {item.receivedAt ? <span>{tr("· Received")}{formatWarehouseReceipt(item.receivedAt, locale)}</span> : <span>{tr("· Not received yet")}</span>}
          </span>
        }
        action={
          <>
            {!demo && item.displayStatus.key === "pending" && !settings.data?.connected ? <Button onClick={() => setCheckingIn(true)}>{tr("Check in")}</Button> : null}
            {!demo && item.vasRequests.some((request) => request.status === "REQUESTED" || request.status === "PROCESSING") ? <Button loading={finish.isPending} onClick={() => finish.mutate(item)}>{tr("Finish services")}</Button> : null}
            {!demo && item.displayStatus.key === "received" && item.conditionStatus !== "EXCEPTION" ? <Button variant="secondary" onClick={() => setFlagging(true)}>{tr("Flag a problem")}</Button> : null}
            {!demo && item.packageStatus === "PENDING" && allows(access.data, "packages.write") ? (
              <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15} aria-hidden="true" />{tr("Cancel and delete")}</Button>
            ) : null}
          </>
        }
      />
      <p className="-mt-3 mb-4 text-[12px] text-slate-400">{demo ? "Sample parcel. Warehouse actions are turned off." : "Charges still post to this customer's wallet."}</p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.8fr)]">
        <div className="space-y-4">
          {item.exception ? (
            <section className="rounded-xl border border-red-200 bg-white p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600">
                  <AlertTriangle size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-semibold tracking-tight">{item.exception.type}</h2>
                  <p className="mt-1 text-[13px] leading-5 text-slate-600">{item.exception.description}</p>
                  {item.exception.message ? <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] leading-5 text-slate-700">{item.exception.message}</p> : null}
                  <p className="mt-3 text-[13px] font-medium text-slate-800">{tr("Reply for the customer")}</p>
                  {demo ? <p className="mt-2 text-[13px] text-slate-500">{tr("Replies are turned off in demo.")}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!demo && item.exception.actions.map((action) => (
                      <Button
                        key={action.code}
                        variant={action.code === "DISPOSAL" ? "danger" : "secondary"}
                        loading={exception.isPending && exception.variables === action.code}
                        disabled={exception.isPending}
                        onClick={() => {
                          if (action.code === "RETURN" || action.code === "DISPOSAL") setConfirm(action.code);
                          else exception.mutate(action.code);
                        }}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ) : null}
          <Card>
            <SectionHeading title={tr("Timeline")} />
            <TimelineList events={item.timeline ?? []} />
          </Card>
          <Card>
            <SectionHeading title={tr("Warehouse measurement")} />
            {measured ? (
              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label={tr("Actual weight")} value={<Weight grams={item.weightGrams} />} />
                <Stat label={tr("Volumetric")} value={<Weight grams={item.volumetricWeightGrams} />} />
                <Stat label={tr("Size (L × W × H)")} value={<Dimensions length={item.lengthMm} width={item.widthMm} height={item.heightMm} />} wide />
              </dl>
            ) : (
              <p className="mt-3 text-[13px] text-slate-500">{tr("Weight and size appear after HioBuy receives the parcel.")}</p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
              {item.cargoAttributes.map((attribute) => (
                <CargoBadge key={attribute} attribute={attribute} />
              ))}
            </div>
          </Card>
          <Card>
            <SectionHeading title={tr("Photos")} />
            <div className="mt-4">
              <PhotoGallery photos={item.photos} />
            </div>
          </Card>
          <Card>
            <SectionHeading title={tr("Product")} />
            <PackageGoodsDetails item={item} />
          </Card>
          <Card><SectionHeading title={tr("Order links")} /><div className="mt-3"><PackagePurchaseItems links={item.purchaseLinks} /></div></Card>
        </div>
        <div className="space-y-4">
          <Card>
            <SectionHeading title="HioBuy" />
            <div className="mt-3 space-y-2 text-[13px] text-slate-600">
              <p>{tr("Sync")}<span className="font-medium text-ink">{syncLog.data?.label ?? item.syncLabel ?? tr("Not connected")}</span></p>
              <p>{tr("Condition")}<span className={item.conditionStatus === "EXCEPTION" ? "font-medium text-red-700" : "font-medium text-ink"}>{item.conditionStatus === "EXCEPTION" ? tr("Exception") : tr("Normal")}</span></p>
              <p>{tr("Last pull")}{syncLog.data?.syncedAt ? formatDateTime(syncLog.data.syncedAt) : item.hiobuySyncedAt ? formatDateTime(item.hiobuySyncedAt) : "—"}</p>
              <p>{tr("Package ID")}<span className="font-mono">{syncLog.data?.warehousePackageId ?? tr("Not linked")}</span></p>
              {item.syncReason || syncLog.data?.reason ? <p className="text-red-700">{item.syncReason || syncLog.data?.reason}</p> : null}
              {syncLog.data?.history.length ? (
                <ul className="space-y-2 border-t border-slate-100 pt-2 text-[12px]">
                  {syncLog.data.history.map((attempt) => (
                    <li key={attempt.id}>
                      <span className="font-medium text-ink">{attempt.operationLabel}</span>
                      {" · "}{attempt.outcome}
                      {attempt.previousStatus ? ` · ${attempt.previousStatus}${attempt.newStatus ? ` → ${attempt.newStatus}` : ""}` : ""}
                      <span className="block text-slate-400">{formatDateTime(attempt.finishedAt ?? attempt.createdAt)}{attempt.requestId ? ` · ${attempt.requestId}` : ""}{attempt.errorMessage ? ` · ${attempt.errorMessage}` : ""}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[12px] text-slate-400">{tr("No sync log yet.")}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                {item.canPull || syncLog.data?.canPull ? <Button size="sm" loading={pullNow.isPending} onClick={() => pullNow.mutate()}>{tr("Sync now")}</Button> : null}
                {item.canSync ? <Button size="sm" variant="secondary" loading={retrySync.isPending} onClick={() => retrySync.mutate()}>{tr("Submit notice")}</Button> : null}
                {syncLog.data?.canRetry ? <Button size="sm" variant="secondary" loading={retrySync.isPending} onClick={() => retrySync.mutate()}>{tr("Retry notice")}</Button> : null}
              </div>
            </div>
          </Card>
          <Card>
            <SectionHeading title={tr("Storage")} />
            <p className="mt-3 text-[13px] text-slate-600">
              {item.freeStorageRemainingDays == null
                ? "Free storage starts when the parcel is received."
                : item.freeStorageRemainingDays > 0
                  ? `${plural(item.freeStorageRemainingDays, "day")} of free storage left`
                  : "Free storage has ended."}
            </p>
            {item.storageFeeFen > 0 ? (
              <p className="mt-1 text-[13px] text-slate-600">{tr("Storage fee")}<Money fen={item.storageFeeFen} />
              </p>
            ) : null}
          </Card>
          <WarehouseServiceCatalogCard stage="INBOUND" />
          <Card>
            <SectionHeading title={tr("Services")} />
            {item.vasRequests.length ? (
              <ul className="mt-3 divide-y divide-slate-100">
                {item.vasRequests.map((request) => (
                  <li key={request.id} className="flex items-start justify-between gap-3 py-2 text-[13px]">
                    <span>
                      <span className="block font-medium">{request.name}</span>
                      <span className="block text-[12px] text-slate-500">{request.status}</span>
                      {request.note ? <span className="mt-0.5 block text-[12px] text-slate-600">{tr("Customer note:")}{request.note}</span> : null}
                    </span>
                    <Money fen={request.finalFen ?? request.estimatedFen} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[13px] text-slate-500">{tr("No services yet.")}</p>
            )}

          </Card>
        </div>
      </div>
      <ConfirmDialog
        open={confirm != null}
        title={confirm === "DISPOSAL" ? "Dispose of this parcel for the customer?" : "Request a return for the customer?"}
        body={tr("The customer is notified. Disposal cannot be undone.")}
        confirmLabel={confirm === "DISPOSAL" ? "Dispose of parcel" : "Request return"}
        danger={confirm === "DISPOSAL"}
        pending={exception.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && exception.mutate(confirm)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${item.publicId}?`}
        body={`The HioBuy inbound notice is cancelled first, then the package is removed from ${item.owner?.name ?? "the customer"}'s account. The customer is notified. This cannot be undone.`}
        confirmLabel="Cancel and delete"
        danger
        pending={remove.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
      />
      <ReceiveDialog pkg={checkingIn ? item : null} onClose={() => setCheckingIn(false)} />
      <ExceptionDialog pkg={flagging ? item : null} onClose={() => setFlagging(false)} />
    </div>
  );
}

function Stat({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-[12px] text-slate-500">{label}</dt>
      <dd className="mt-1 text-[15px] font-semibold tracking-tight text-ink tabular-nums">{value}</dd>
    </div>
  );
}

const EXCEPTION_TYPES = ["Package damaged", "Prohibited item suspected", "Contents don't match the package", "Missing member code", "Wet or leaking"];

function ReceiveDialog({ pkg, onClose }: { pkg: Detail | null; onClose: () => void }) {
  const { t: tr } = useAdminI18n();
  const [form, setForm] = useState({ weight: "", length: "", width: "", height: "" });
  const [cargo, setCargo] = useState<CargoAttribute[]>([]);
  const [error, setError] = useState("");
  const receive = useAdminAction<{ pkg: Detail; body: unknown }>(({ pkg: item }) => `/api/admin/packages/${item.id}/receive`, {
    body: ({ body }) => body,
    success: ({ pkg: item }) => `${item.publicId} checked in. The customer was notified.`,
    onDone: close,
  });
  function close() {
    setForm({ weight: "", length: "", width: "", height: "" });
    setCargo([]);
    setError("");
    onClose();
  }
  const current = cargo.length ? cargo : (pkg?.cargoAttributes ?? []);
  return (
    <Dialog
      open={pkg != null}
      title={pkg ? `Check in ${pkg.publicId}` : ""}
      description={pkg ? `${pkg.domesticTrackingNumber} · ${pkg.owner?.name ?? ""}` : undefined}
      onClose={close}
      footer={<><Button variant="secondary" onClick={close}>{tr("Cancel")}</Button><Button type="submit" form="receive-form" loading={receive.isPending}>{tr("Check in package")}</Button></>}
    >
      <form
        id="receive-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pkg) return;
          const weightGrams = toInt(form.weight, 1000);
          const lengthMm = toInt(form.length, 10);
          const widthMm = toInt(form.width, 10);
          const heightMm = toInt(form.height, 10);
          if (!weightGrams || !lengthMm || !widthMm || !heightMm) {
            setError("Enter the weight and all three sides as numbers above 0.");
            return;
          }
          receive.mutate({ pkg, body: { weightGrams, lengthMm, widthMm, heightMm, cargo: current } });
        }}
      >
        <Field label={tr("Weight (kg)")}><input className={inputClass} inputMode="decimal" value={form.weight} onChange={(event) => setForm({ ...form, weight: event.target.value })} autoFocus /></Field>
        <div className="grid grid-cols-3 gap-3">
          {(["length", "width", "height"] as const).map((key) => (
            <Field key={key} label={`${key} (cm)`}><input className={inputClass} inputMode="decimal" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></Field>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {CARGO_ATTRIBUTES.map((attribute) => {
            const on = current.includes(attribute);
            return (
              <label key={attribute} className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[13px]", on ? "border-indigo-300 bg-indigo-50/60" : "border-slate-200")}>
                <Checkbox checked={on} onCheckedChange={() => setCargo(on ? current.filter((item) => item !== attribute) : [...current, attribute])} />
                {cargoLabel(attribute)}
              </label>
            );
          })}
        </div>
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </form>
    </Dialog>
  );
}

function ExceptionDialog({ pkg, onClose }: { pkg: Detail | null; onClose: () => void }) {
  const { t: tr } = useAdminI18n();
  const [type, setType] = useState(EXCEPTION_TYPES[0]!);
  const [description, setDescription] = useState("");
  const flag = useAdminAction<{ pkg: Detail; body: unknown }>(({ pkg: item }) => `/api/admin/packages/${item.id}/exception`, {
    body: ({ body }) => body,
    success: ({ pkg: item }) => `${item.publicId} flagged. The customer will be asked what to do.`,
    onDone: close,
  });
  function close() {
    setDescription("");
    onClose();
  }
  return (
    <Dialog
      open={pkg != null}
      title={pkg ? `Flag a problem with ${pkg.publicId}` : ""}
      onClose={close}
      footer={<><Button variant="secondary" onClick={close}>{tr("Cancel")}</Button><Button variant="danger" type="submit" form="exception-form" loading={flag.isPending} disabled={description.trim().length < 2}>{tr("Flag and notify")}</Button></>}
    >
      <form id="exception-form" className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (pkg) flag.mutate({ pkg, body: { type, description } }); }}>
        <Field label={tr("Problem")}>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger aria-label="Problem type"><SelectValue /></SelectTrigger>
            <SelectContent>{EXCEPTION_TYPES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={tr("What was seen")}><Textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
      </form>
    </Dialog>
  );
}
