"use client";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { getErrorMessage } from "@/lib/error-message";
import {
  getProcurementWarehouse,
  ProcurementApiError,
  submitProcurementPrealerts,
} from "@/lib/procurement/client";
import type {
  ProcurementPrealert,
  ProcurementWarehouse,
} from "@/lib/procurement/logistics-types";
import { purchaseLoginHref } from "@/lib/procurement/purchase";
import { cn } from "@/lib/utils";
import { motion, useAnimation } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

const MAX_PREALERTS = 30;
const DISCLAIMER_HREF = "/blog/purchasing-agent-disclaimer";

type ForwardingRow = {
  id: string;
  courier: string;
  trackingNumber: string;
  productName: string;
  declaredValue: string;
};

function createRow(id: string): ForwardingRow {
  return {
    id,
    courier: "",
    trackingNumber: "",
    productName: "",
    declaredValue: "",
  };
}

function warehouseReceiver(warehouse: ProcurementWarehouse) {
  const recipient = warehouse.recipient.trim();
  const code = warehouse.memberCode.trim();
  if (!code || recipient.includes(code)) return recipient;
  return recipient ? `${recipient} (${code})` : code;
}

function warehouseAddress(warehouse: ProcurementWarehouse) {
  const street = warehouse.street?.trim() || "";
  if (street) return street;
  return [warehouse.province, warehouse.city, warehouse.district]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("");
}

function SectionNumberBadge({ number }: { number: string }) {
  return (
    <span className="bg-primary relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white">
      {number}
    </span>
  );
}
function ForwardingStepBlock({
  number,
  title,
  children,
  connectorBelow = false,
  contentClassName,
}: {
  number: string;
  title: string;
  children?: ReactNode;
  connectorBelow?: boolean;
  contentClassName?: string;
}) {
  return (
    <div className="step-block flex gap-3">
      <div className="flex w-7 shrink-0 flex-col items-center">
        <SectionNumberBadge number={number} />
        {connectorBelow ? (
          <div
            className="connector-line w-0.5 flex-1 bg-[#E5E7EB]"
            aria-hidden
          />
        ) : null}
      </div>
      <div className={cn("step-content min-w-0 flex-1", contentClassName)}>
        <h3 className="text-base leading-7 font-bold text-[#1F1F1F] md:text-lg">
          {title}
        </h3>
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    </div>
  );
}
function WarehouseAddressSkeleton() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="overflow-hidden rounded-lg border border-[#E5E7EB]">
        <div className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <div className="border-t border-[#E5E7EB]" />
        <div className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    </div>
  );
}
function WarehouseAddressCard({
  warehouse,
  t,
  onCopy,
}: {
  warehouse: ProcurementWarehouse;
  t: ReturnType<typeof useTranslations>;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium text-[#1F1F1F] md:text-base">
          {t("Warehouse Address")}
        </h4>
        <button
          type="button"
          onClick={onCopy}
          className="text-primary shrink-0 text-sm font-medium transition-opacity hover:opacity-80"
        >
          {t("Copy Address")}
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#E5E7EB]">
        <div className="px-4 py-3 text-sm text-[#333333]">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <span>
              <span className="text-[#666666]">{t("Receiver:")}</span>{" "}
              <span>{warehouseReceiver(warehouse) || "-"}</span>
            </span>
            <span>
              <span className="text-[#666666]">{t("Mobile:")}</span>{" "}
              <span>{warehouse.phone || "-"}</span>
            </span>
            <span>
              <span className="text-[#666666]">{t("Post/ZIP code:")}</span>{" "}
              <span>{warehouse.postalCode || "-"}</span>
            </span>
          </div>
        </div>
        <div className="border-t border-[#E5E7EB]" />
        <div className="px-4 py-3 text-sm text-[#333333]">
          <span className="text-[#666666]">{t("Address:")}</span>{" "}
          <span>{warehouseAddress(warehouse) || "-"}</span>
        </div>
      </div>
    </div>
  );
}
const FIELD_INPUT_CLASS =
  "h-[44px] w-full rounded-[8px] border border-[#E2E4F0] bg-white px-3 text-sm font-normal text-[#333333] placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
function ParcelPackageForm({
  rows,
  onChange,
  onAdd,
  onRemove,
  t,
}: {
  rows: ForwardingRow[];
  onChange: (
    id: string,
    field: keyof Omit<ForwardingRow, "id">,
    value: string,
  ) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const showDelete = rows.length > 1;
  const rowGridClass = showDelete
    ? "grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_40px]"
    : "grid-cols-1 md:grid-cols-4";
  return (
    <div className="rounded-lg border border-[#E5E7EB] p-4">
      <div className={cn("mb-3 hidden gap-4 md:grid", rowGridClass)}>
        <label className="text-[12px] font-medium text-[#333333] md:text-sm">
          {t("Courier")}
          <span className="text-primary">*</span>
        </label>
        <label className="text-[12px] font-medium text-[#333333] md:text-sm">
          {t("Tracking Number")}
          <span className="text-primary">*</span>
        </label>
        <label className="text-[12px] font-medium text-[#333333] md:text-sm">
          {t("Parcel Name")}
        </label>
        <label className="text-[12px] font-medium text-[#333333] md:text-sm">
          {t("Parcel Value")}
          <span className="text-primary">*</span>
        </label>
        {showDelete ? <span className="sr-only">{t("Delete")}</span> : null}
      </div>

      <div className="space-y-4">
        {rows.map((row) => (
          <div
            key={row.id}
            className={cn("grid items-end gap-4", rowGridClass)}
          >
            <div className="flex flex-col gap-2 md:gap-0">
              <label className="text-[12px] font-medium text-[#333333] md:hidden">
                {t("Courier")}
                <span className="text-primary">*</span>
              </label>
              <input
                type="text"
                value={row.courier}
                maxLength={40}
                onChange={(e) => onChange(row.id, "courier", e.target.value)}
                placeholder={t("Enter courier")}
                className={FIELD_INPUT_CLASS}
              />
            </div>

            <div className="flex flex-col gap-2 md:gap-0">
              <label className="text-[12px] font-medium text-[#333333] md:hidden">
                {t("Tracking Number")}
                <span className="text-primary">*</span>
              </label>
              <input
                type="text"
                value={row.trackingNumber}
                maxLength={40}
                onChange={(e) =>
                  onChange(row.id, "trackingNumber", e.target.value)
                }
                placeholder={t("Enter tracking number")}
                className={FIELD_INPUT_CLASS}
              />
            </div>

            <div className="flex flex-col gap-2 md:gap-0">
              <label className="text-[12px] font-medium text-[#333333] md:hidden">
                {t("Parcel Name")}
              </label>
              <input
                type="text"
                value={row.productName}
                maxLength={120}
                onChange={(e) =>
                  onChange(row.id, "productName", e.target.value)
                }
                placeholder={t("Enter parcel name")}
                className={FIELD_INPUT_CLASS}
              />
            </div>

            <div className="flex flex-col gap-2 md:gap-0">
              <label className="text-[12px] font-medium text-[#333333] md:hidden">
                {t("Parcel Value")}
                <span className="text-primary">*</span>
              </label>
              <div className="focus-within:border-primary focus-within:ring-primary/20 flex h-[44px] overflow-hidden rounded-[8px] border border-[#E2E4F0] bg-white focus-within:ring-2">
                <span className="flex shrink-0 items-center border-e border-[#E2E4F0] bg-[#FAFAFA] px-3 text-sm text-[#666666]">
                  CNY
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={row.declaredValue}
                  onChange={(e) =>
                    onChange(row.id, "declaredValue", e.target.value)
                  }
                  placeholder={t("Enter product price")}
                  className="min-w-0 flex-1 border-0 bg-transparent px-3 text-sm font-normal text-[#333333] placeholder:text-gray-400 focus:outline-none"
                />
              </div>
            </div>

            {showDelete ? (
              <button
                type="button"
                onClick={() => onRemove(row.id)}
                className="flex h-[44px] w-10 shrink-0 items-center justify-center self-end text-[#9CA3AF] transition-colors hover:text-[#666666] md:self-auto"
                aria-label={t("Delete")}
              >
                <Trash2 className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onAdd}
        disabled={rows.length >= MAX_PREALERTS}
        className="bg-primary mt-4 inline-flex items-center gap-2 rounded-[8px] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus className="h-4 w-4" />
        {t("Add Tracking")}
      </button>
    </div>
  );
}
function ForwardingSubmitSection({
  t,
  agreedDisclaimer,
  submitting,
  onAgreeChange,
  onSubmit,
  agreementControls,
}: {
  t: ReturnType<typeof useTranslations>;
  agreedDisclaimer: boolean;
  submitting: boolean;
  onAgreeChange: (checked: boolean) => void;
  onSubmit: () => void;
  agreementControls: ReturnType<typeof useAnimation>;
}) {
  return (
    <div>
      <div className="rounded-lg border border-[#E5E7EB] p-4 text-sm leading-relaxed text-[#333333]">
        {t(
          'After submitting the tracking number, a forwarding order ID will be generated Please track the order status in "',
        )}
        <Link
          href="/member-center/purchase-orders"
          className="text-primary font-medium hover:opacity-80"
        >
          {t("Orders")}
        </Link>
        {t('" Once the status shows "Stored", you can go to "')}
        <Link
          href="/member-center/warehouse"
          className="text-primary font-medium hover:opacity-80"
        >
          {t("Warehouse")}
        </Link>
        {t(
          '" to select the items to be packed and shipped, and pay the related fees',
        )}
      </div>

      <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <motion.div animate={agreementControls} className="min-w-0">
          <label className="flex cursor-pointer items-start gap-2.5">
            <Checkbox
              checked={agreedDisclaimer}
              onCheckedChange={(value) => onAgreeChange(value === true)}
              className="mt-0.5 shrink-0"
            />
            <span className="text-sm text-[#333333]">
              {t("Please read and check the disclaimer carefully ")}
              <a
                href={DISCLAIMER_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline hover:opacity-80"
                onClick={(e) => e.stopPropagation()}
              >
                {t("Disclaimer")}
              </a>
            </span>
          </label>
        </motion.div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="bg-primary inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[8px] px-8 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 md:min-w-[120px]"
        >
          {t("Submit")}
          {submitting ? <Spinner className="h-4 w-4 text-white" /> : null}
        </button>
      </div>
    </div>
  );
}

function filledRows(rows: ForwardingRow[]) {
  return rows.filter(
    (row) =>
      row.courier.trim() ||
      row.trackingNumber.trim() ||
      row.productName.trim() ||
      row.declaredValue.trim(),
  );
}

function packageValueFen(value: string) {
  const amount = Math.round((Number.parseFloat(value) || 0) * 100);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
}

function prealertItems(rows: ForwardingRow[]): ProcurementPrealert[] | null {
  const items: ProcurementPrealert[] = [];
  for (const row of rows) {
    const declaredValueFen = packageValueFen(row.declaredValue);
    if (
      !row.courier.trim() ||
      row.courier.trim().length > 40 ||
      row.trackingNumber.trim().length < 5 ||
      row.trackingNumber.trim().length > 40 ||
      row.productName.trim().length > 120 ||
      !declaredValueFen
    ) {
      return null;
    }
    const productName = row.productName.trim();
    items.push({
      courier: row.courier.trim(),
      trackingNumber: row.trackingNumber.trim(),
      ...(productName ? { productName } : {}),
      quantity: 1,
      declaredValueFen,
    });
  }
  return items;
}

export default function PageClient() {
  const t = useTranslations();
  const router = useRouter();
  const loginPath = purchaseLoginHref("/forwarding");

  const [loading, setLoading] = useState(true);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] =
    useState<ProcurementWarehouse | null>(null);
  const packageRowIdRef = useRef(1);
  const [packageRows, setPackageRows] = useState<ForwardingRow[]>([
    createRow("pkg-1"),
  ]);
  const [agreedDisclaimer, setAgreedDisclaimer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const agreementControls = useAnimation();
  const handlePackageRowChange = useCallback(
    (id: string, field: keyof Omit<ForwardingRow, "id">, value: string) => {
      setPackageRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
      );
    },
    [],
  );
  const handleAddPackageRow = useCallback(() => {
    setPackageRows((prev) => {
      if (prev.length >= MAX_PREALERTS) return prev;
      packageRowIdRef.current += 1;
      return [...prev, createRow(`pkg-${packageRowIdRef.current}`)];
    });
  }, []);
  const handleRemovePackageRow = useCallback((id: string) => {
    setPackageRows((prev) =>
      prev.length <= 1 ? prev : prev.filter((row) => row.id !== id),
    );
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const warehouse = await getProcurementWarehouse();
        if (cancelled) return;
        setNeedsSignIn(false);
        setSelectedWarehouse(warehouse.available ? warehouse : null);
      } catch (error) {
        console.error("Failed to load warehouse address:", error);
        if (cancelled) return;
        setSelectedWarehouse(null);
        if (error instanceof ProcurementApiError && error.status === 401) {
          setNeedsSignIn(true);
        } else {
          setNeedsSignIn(false);
          toast.error(t("Failed to load warehouse address"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);
  const handleCopyAddress = useCallback(async () => {
    if (!selectedWarehouse) return;
    const text = [
      `${t("Receiver:")} ${warehouseReceiver(selectedWarehouse)}`,
      `${t("Mobile:")} ${selectedWarehouse.phone || ""}`,
      `${t("Address:")} ${warehouseAddress(selectedWarehouse)}`,
      `${t("Post/ZIP code:")} ${selectedWarehouse.postalCode || ""}`,
    ].join("\n");
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      toast.success(t("Address copied"));
    } catch (error) {
      console.error("Failed to copy warehouse address:", error);
      toast.error(t("Failed to copy address"));
    }
  }, [selectedWarehouse, t]);
  const shakeAgreement = useCallback(async () => {
    await agreementControls.start({
      x: [0, -6, 6, -4, 4, -2, 0],
      transition: { duration: 0.45, ease: "easeInOut" },
    });
  }, [agreementControls]);
  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    if (needsSignIn) {
      router.push(loginPath);
      return;
    }
    if (!agreedDisclaimer) {
      void shakeAgreement();
      toast.error(t("Please read and agree to the disclaimer"));
      return;
    }
    const rows = filledRows(packageRows);
    if (!rows.length) {
      toast.error(t("Please fill in parcel information"));
      return;
    }
    if (!selectedWarehouse) {
      toast.error(t("No warehouse address available"));
      return;
    }
    const invalidTracking = rows.some(
      (row) =>
        !row.courier.trim() ||
        row.courier.trim().length > 40 ||
        row.trackingNumber.trim().length < 5 ||
        row.trackingNumber.trim().length > 40,
    );
    if (invalidTracking) {
      toast.error(t("Please enter a courier and a valid tracking number"));
      return;
    }
    const items = prealertItems(rows);
    if (!items) {
      toast.error(t("Please fill in parcel information"));
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitProcurementPrealerts(items);
      const createdNumbers = new Set(
        result.created.map((parcel) => parcel.domesticTrackingNumber),
      );
      if (createdNumbers.size) {
        packageRowIdRef.current += 1;
        const nextId = packageRowIdRef.current;
        setPackageRows((prev) => {
          const remaining = prev.filter(
            (row) => !createdNumbers.has(row.trackingNumber.trim()),
          );
          return remaining.length ? remaining : [createRow(`pkg-${nextId}`)];
        });
      }
      if (result.skipped.length) {
        toast.error(
          result.skipped.map((item) => item.message).join("\n") ||
            t("Failed to submit"),
        );
      } else if (result.created.length) {
        toast.success(t("Submitted successfully"));
        setAgreedDisclaimer(false);
      } else {
        toast.error(t("Failed to submit"));
      }
    } catch (error) {
      console.error("Failed to submit forwarding packages:", error);
      if (error instanceof ProcurementApiError && error.status === 401) {
        router.push(loginPath);
      } else {
        toast.error(getErrorMessage(error) || t("Failed to submit"));
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    agreedDisclaimer,
    loginPath,
    needsSignIn,
    packageRows,
    router,
    selectedWarehouse,
    shakeAgreement,
    submitting,
    t,
  ]);
  return (
    <div>
      <div className="mt-6 space-y-0">
        <ForwardingStepBlock
          number="01"
          title={t("Copy the address")}
          connectorBelow
          contentClassName="pb-8"
        >
          {loading ? (
            <WarehouseAddressSkeleton />
          ) : needsSignIn ? (
            <Button asChild>
              <Link href={loginPath}>{t("Sign in")}</Link>
            </Button>
          ) : selectedWarehouse ? (
            <WarehouseAddressCard
              warehouse={selectedWarehouse}
              t={t}
              onCopy={handleCopyAddress}
            />
          ) : (
            <div className="py-6 text-center text-sm text-[#9CA3AF]">
              {t("No warehouse address available")}
            </div>
          )}
        </ForwardingStepBlock>

        <ForwardingStepBlock
          number="02"
          title={t("Information for parcels sent to the warehouse")}
          connectorBelow
          contentClassName="pb-8"
        >
          <ParcelPackageForm
            rows={packageRows}
            onChange={handlePackageRowChange}
            onAdd={handleAddPackageRow}
            onRemove={handleRemovePackageRow}
            t={t}
          />
        </ForwardingStepBlock>

        <ForwardingStepBlock
          number="03"
          title={t("Submit parcel & pay shipping")}
        >
          <ForwardingSubmitSection
            t={t}
            agreedDisclaimer={agreedDisclaimer}
            submitting={submitting}
            onAgreeChange={setAgreedDisclaimer}
            onSubmit={handleSubmit}
            agreementControls={agreementControls}
          />
        </ForwardingStepBlock>
      </div>
    </div>
  );
}
