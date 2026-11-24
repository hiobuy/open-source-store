"use client";

import { MemberEmptyState } from "@/components/features/account/member-empty-state";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { LocalizedLink } from "@/components/localized-link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useProcurementResource } from "@/hooks/use-procurement-resource";
import { getErrorMessage } from "@/lib/error-message";
import {
  getProcurementNotifications,
  markProcurementNotificationsRead,
} from "@/lib/procurement/client";
import { safeRedirectPath } from "@/lib/redirect";
import {
  LogisticsDate,
  LogisticsLoadState,
  LogisticsPanel,
  parcelDetailPath,
  shipmentDetailPath,
  shipmentsPath,
  warehousePath,
} from "./procurement-logistics";

function notificationPath(value: string) {
  const safe = safeRedirectPath(value, "");
  if (!safe) return undefined;

  const pathname = safe.split(/[?#]/, 1)[0].replace(/\/$/, "");
  const detail =
    /^\/app\/(packages|shipments|purchase-orders)\/([A-Za-z0-9_-]+)$/.exec(
      pathname,
    );
  if (detail) {
    const [, section, id] = detail;
    if (section === "packages") return parcelDetailPath(id);
    if (section === "shipments") return shipmentDetailPath(id);
    return `/member-center/purchase-orders/${encodeURIComponent(id)}`;
  }
  const paths = {
    "/app/packages": warehousePath,
    "/app/warehouse": warehousePath,
    "/app/claim-packages": "/forwarding#claims",
    "/app/shipments": shipmentsPath,
    "/app/wallet": "/member-center/wallet",
    "/app/wallet/transfers": "/member-center/wallet",
    "/app/purchase-orders": "/member-center/purchase-orders",
    "/app/account": "/member-center/profile",
  };
  return Object.hasOwn(paths, pathname)
    ? paths[pathname as keyof typeof paths]
    : undefined;
}

export function ProcurementNotifications() {
  const t = useTranslations();
  const result = useProcurementResource(getProcurementNotifications, true);
  const [marking, setMarking] = useState(false);
  const unread = result.data?.some((item) => !item.read);

  async function markAllRead() {
    if (marking || !unread) return;
    setMarking(true);
    try {
      await markProcurementNotificationsRead();
      result.reload();
    } catch (error) {
      toast.error(getErrorMessage(error) || t("Operation failed"));
    } finally {
      setMarking(false);
    }
  }

  return (
    <LogisticsPanel>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{t("Messages")}</h1>
        {unread && (
          <Button
            size="sm"
            variant="outline"
            disabled={marking}
            onClick={markAllRead}
          >
            {marking && <Spinner />}
            {t("Mark all as read")}
          </Button>
        )}
      </header>
      {result.loading ? (
        <ul className="divide-y" aria-hidden>
          {Array.from({ length: 5 }, (_, index) => (
            <li key={index} className="space-y-2 py-3">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </li>
          ))}
        </ul>
      ) : (
        <LogisticsLoadState
          loading={false}
          error={result.error}
          reload={result.reload}
          empty={
            result.data?.length === 0 && (
              <MemberEmptyState
                variant="messages"
                label={t("No messages yet")}
              />
            )
          }
        />
      )}
      {!!result.data?.length && (
        <ul className="space-y-3">
          {result.data.map((item) => {
            const href = notificationPath(item.href);
            return (
              <li
                key={item.id}
                className="grid gap-2 rounded-lg border border-gray-200 bg-white p-4 text-sm transition-shadow hover:shadow-md md:grid-cols-[minmax(0,2fr)_minmax(0,4fr)_minmax(0,2fr)_auto] md:items-start md:gap-4"
              >
                <h2 className="flex items-center gap-2 font-semibold break-words">
                  {!item.read && (
                    <span
                      className="bg-primary size-2 shrink-0 rounded-full"
                      aria-label={t("Unread")}
                    />
                  )}
                  {item.title}
                </h2>
                <p className="text-muted-foreground break-words whitespace-pre-wrap">
                  {item.body}
                </p>
                <LogisticsDate value={item.createdAt} />
                {href && (
                  <LocalizedLink
                    className="text-primary inline-block underline"
                    href={href}
                  >
                    {t("View details")}
                  </LocalizedLink>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </LogisticsPanel>
  );
}
