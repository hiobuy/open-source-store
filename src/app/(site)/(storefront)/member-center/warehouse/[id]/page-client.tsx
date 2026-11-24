"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  LogisticsConfirmation,
  LogisticsDate,
  LogisticsLoadState,
  LogisticsPanel,
  LogisticsPhotos,
  LogisticsStatus,
  LogisticsTimeline,
  consolidationPath,
  formatDimensions,
  formatWeight,
  warehousePath,
} from "@/components/features/logistics/procurement-logistics";
import { ResponsiveContentFrame } from "@/components/layout/responsive-content-frame";
import { LocalizedLink } from "@/components/localized-link";
import { Button } from "@/components/ui/button";
import { useProcurementResource } from "@/hooks/use-procurement-resource";
import { getErrorMessage } from "@/lib/error-message";
import {
  deleteProcurementParcel,
  getProcurementParcel,
  getProcurementSettlementCurrency,
  respondToProcurementException,
} from "@/lib/procurement/client";
import type { ProcurementExceptionAction } from "@/lib/procurement/logistics-types";

export default function ParcelDetails({ id }: { id: string }) {
  const t = useTranslations();
  const router = useRouter();
  const result = useProcurementResource(getProcurementParcel, id || null);
  const [action, setAction] = useState<{
    code: ProcurementExceptionAction | "delete";
    label: string;
  }>();
  const [pending, setPending] = useState(false);
  const [support, setSupport] = useState<{
    supportEmail: string;
    context: string;
  }>();
  const parcel = result.data;
  const { data: currency } = useProcurementResource(
    getProcurementSettlementCurrency,
    parcel && (parcel.declaredValueFen != null || parcel.storageFeeFen > 0)
      ? true
      : null,
  );

  async function confirm() {
    if (!action || !parcel || pending) return;
    setPending(true);
    try {
      if (action.code === "delete") {
        await deleteProcurementParcel(parcel.id);
        toast.success(t("Deleted successfully"));
        router.replace(warehousePath);
        return;
      }

      const updated = await respondToProcurementException(
        parcel.id,
        action.code,
      );
      if ("supportEmail" in updated) setSupport(updated);
      else {
        toast.success(t("Submitted successfully"));
        result.reload();
      }
      setAction(undefined);
    } catch (error) {
      toast.error(getErrorMessage(error) || t("Operation failed"));
      if (action.code === "delete") {
        setAction(undefined);
        result.reload();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <ResponsiveContentFrame className="space-y-4 py-5">
      <LocalizedLink
        href={warehousePath}
        className="text-muted-foreground hover:text-primary text-sm"
      >
        {t("Back")} · {t("Warehouse")}
      </LocalizedLink>
      <h1 className="text-xl font-semibold">{t("Parcel details")}</h1>
      <LogisticsLoadState
        {...result}
        empty={!id ? t("Invalid or missing id") : undefined}
      />
      {parcel && (
        <>
          <LogisticsPanel>
            <header className="flex flex-wrap justify-between gap-2">
              <div>
                <h2 className="font-semibold">
                  {parcel.productName || parcel.publicId}
                </h2>
                <p className="text-muted-foreground text-sm">
                  <bdi>{parcel.publicId}</bdi>
                </p>
              </div>
              <LogisticsStatus status={parcel.displayStatus} />
            </header>
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ["Tracking Number", parcel.domesticTrackingNumber],
                  ["Courier", parcel.courier],
                  ["Quantity", parcel.quantity],
                  ["Platform", parcel.sellerPlatform],
                  ["Weight (kg)", formatWeight(parcel.weightGrams)],
                  [
                    "Dimensions (cm)",
                    formatDimensions(
                      parcel.lengthMm,
                      parcel.widthMm,
                      parcel.heightMm,
                    ),
                  ],
                  ["Attributes", parcel.cargoAttributes.join(", ")],
                  [
                    "Parcel Value",
                    currency && parcel.declaredValueFen != null
                      ? `${currency} ${(parcel.declaredValueFen / 100).toFixed(2)}`
                      : undefined,
                  ],
                  ["Notes", parcel.notes],
                ] as const
              ).map(
                ([label, value]) =>
                  value !== null &&
                  value !== undefined &&
                  value !== "" && (
                    <div key={label} className="min-w-0">
                      <dt className="text-muted-foreground">{t(label)}</dt>
                      <dd className="break-words">
                        <bdi>{value}</bdi>
                      </dd>
                    </div>
                  ),
              )}
            </dl>
            <LogisticsDate value={parcel.receivedAt ?? parcel.createdAt} />
            <div className="flex flex-wrap gap-2">
              {parcel.eligible && (
                <Button asChild>
                  <LocalizedLink href={consolidationPath([parcel.id])}>
                    {t("Combine packages")}
                  </LocalizedLink>
                </Button>
              )}
              {parcel.packageStatus === "PENDING" && (
                <Button
                  variant="outline"
                  onClick={() =>
                    setAction({ code: "delete", label: t("Confirm deletion") })
                  }
                >
                  {t("Delete")}
                </Button>
              )}
            </div>
            {parcel.ineligibleReason && (
              <p className="text-muted-foreground text-sm">
                {parcel.ineligibleReason}
              </p>
            )}
          </LogisticsPanel>
          <LogisticsPanel title={t("Storage Service")}>
            {parcel.freeStorageRemainingDays != null && (
              <p
                className={
                  parcel.storageWarning ? "text-destructive" : undefined
                }
              >
                {t("Free storage remaining", {
                  days: parcel.freeStorageRemainingDays,
                })}
              </p>
            )}
            {currency && parcel.storageFeeFen > 0 && (
              <p>
                {t("Storage fee")}{" "}
                <bdi>
                  {currency} {(parcel.storageFeeFen / 100).toFixed(2)}
                </bdi>
              </p>
            )}
            {parcel.freeStorageRemainingDays == null && (
              <p className="text-muted-foreground text-sm">
                {t("Pending Storage")}
              </p>
            )}
          </LogisticsPanel>
          <LogisticsPanel title={t("Parcel Photo")}>
            {parcel.photos.length ? (
              <LogisticsPhotos photos={parcel.photos} />
            ) : (
              <p className="text-muted-foreground text-sm">{t("No photos")}</p>
            )}
          </LogisticsPanel>
          {parcel.exception && (
            <LogisticsPanel title={t("Exceptions")}>
              <p className="font-medium">{parcel.exception.description}</p>
              <p className="text-muted-foreground text-sm">
                {parcel.exception.message}
              </p>
              <div className="flex flex-wrap gap-2">
                {parcel.exception.actions.map(({ code, label }) => (
                  <Button
                    key={code}
                    size="sm"
                    variant="outline"
                    onClick={() => setAction({ code, label })}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {support && (
                <a
                  className="text-primary text-sm underline"
                  href={`mailto:${support.supportEmail}?body=${encodeURIComponent(support.context)}`}
                >
                  {support.supportEmail}
                </a>
              )}
            </LogisticsPanel>
          )}
          {parcel.vasRequests.length > 0 && (
            <LogisticsPanel title={t("Parcel Value-Added Services")}>
              <ul className="space-y-2 text-sm">
                {parcel.vasRequests.map(({ id, name, status, note }) => (
                  <li key={id}>
                    <strong>{name}</strong> · {status}
                    {note && <p className="text-muted-foreground">{note}</p>}
                  </li>
                ))}
              </ul>
            </LogisticsPanel>
          )}
          {!!parcel.timeline?.length && (
            <LogisticsPanel title={t("Tracking")}>
              <LogisticsTimeline events={parcel.timeline} />
            </LogisticsPanel>
          )}
        </>
      )}
      {action && parcel && (
        <LogisticsConfirmation
          title={action.label}
          description={parcel.publicId}
          pending={pending}
          onClose={() => setAction(undefined)}
          onConfirm={confirm}
        />
      )}
    </ResponsiveContentFrame>
  );
}
