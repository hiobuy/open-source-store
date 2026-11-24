"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode } from "react";
import { LocalizedLink } from "@/components/localized-link";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ProcurementApiError } from "@/lib/procurement/client";
import type {
  ProcurementDisplayStatus,
  ProcurementPhoto,
  ProcurementTimelineEvent,
} from "@/lib/procurement/logistics-types";
import { cn } from "@/lib/utils";

export const warehousePath = "/member-center/warehouse";
export const shipmentsPath = "/member-center/shipments";
export const logisticsSelectClass =
  "border-input focus-visible:ring-ring h-10 w-full rounded-md border bg-white px-3 text-sm focus-visible:ring-2 focus-visible:outline-none";

export function parcelDetailPath(id: string) {
  return `/member-center/warehouse/${encodeURIComponent(id)}`;
}

export function shipmentDetailPath(id: string) {
  return `/member-center/shipments/${encodeURIComponent(id)}`;
}

export function consolidationPath(ids: string[]) {
  const query = new URLSearchParams();
  ids.forEach((id) => query.append("id", id));
  return `/member-center/shipments/new?${query}`;
}

export function checkoutPath(id: string) {
  return `/member-center/shipments/checkout/${encodeURIComponent(id)}`;
}

export function formatWeight(grams: number | null | undefined) {
  return grams == null ? "—" : `${(grams / 1000).toFixed(3)} kg`;
}

export function formatDimensions(
  length?: number | null,
  width?: number | null,
  height?: number | null,
) {
  if (length == null || width == null || height == null) return "—";
  return `${length / 10} × ${width / 10} × ${height / 10} cm`;
}

export function LogisticsDate({ value }: { value: string }) {
  const locale = useLocale();
  const date = new Date(value);
  return (
    <time dateTime={value} className="text-muted-foreground text-xs">
      {new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)}
    </time>
  );
}

export function LogisticsStatus({
  status,
}: {
  status: ProcurementDisplayStatus;
}) {
  const tones = {
    success: "bg-green-50 text-green-800",
    warning: "bg-amber-50 text-amber-800",
    danger: "bg-red-50 text-red-800",
    info: "bg-blue-50 text-blue-800",
    neutral: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "w-fit rounded-full px-2.5 py-1 text-xs font-medium",
        tones[status.tone],
      )}
    >
      {status.label}
    </span>
  );
}

export function LogisticsPanel({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border bg-white p-4">
      {title && <h2 className="font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export function LogisticsCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-3 rounded-lg border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-3 w-48 max-w-full" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LogisticsLoadState({
  loading,
  error,
  reload,
  empty,
}: {
  loading: boolean;
  error?: Error;
  reload?: () => void;
  empty?: ReactNode;
}) {
  const t = useTranslations();
  if (loading)
    return (
      <div className="flex justify-center p-6">
        <Spinner />
      </div>
    );
  if (error instanceof ProcurementApiError && error.status === 401) {
    const redirect = `${window.location.pathname}${window.location.search}`;
    return (
      <div className="py-6 text-center">
        <Button asChild>
          <LocalizedLink href={`/login?${new URLSearchParams({ redirect })}`}>
            {t("Login")}
          </LocalizedLink>
        </Button>
      </div>
    );
  }
  if (error)
    return (
      <div className="space-y-2 py-3 text-sm" role="alert">
        <p>
          {t(
            error instanceof ProcurementApiError && error.status === 404
              ? "Page not found"
              : "The service is temporarily unavailable Please try again",
          )}
        </p>
        {reload && (
          <Button type="button" variant="outline" size="sm" onClick={reload}>
            {t("Try again")}
          </Button>
        )}
      </div>
    );
  if (typeof empty === "string") {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">{empty}</p>
    );
  }
  return empty ?? null;
}

export function LogisticsConfirmation({
  title,
  description,
  pending,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations();
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t("Cancel")}
          </AlertDialogCancel>
          <Button disabled={pending} onClick={onConfirm}>
            {pending && <Spinner />}
            {t("Confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function LogisticsPhotos({ photos }: { photos: ProcurementPhoto[] }) {
  const visible = photos.flatMap((photo) =>
    photo.url ? [{ id: photo.id, label: photo.label, url: photo.url }] : [],
  );
  if (!visible.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {visible.map((photo) => (
        <li key={photo.id}>
          <a
            href={photo.url}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-md border"
          >
            <Image
              unoptimized
              src={photo.url}
              alt={photo.label}
              width={64}
              height={64}
              className="size-16 object-cover"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}

export function LogisticsTimeline({
  events,
}: {
  events: ProcurementTimelineEvent[];
}) {
  return (
    <ol className="space-y-3 border-s ps-4 text-sm">
      {events.map(({ at, title, detail }, index) => (
        <li key={`${at}-${index}`}>
          <LogisticsDate value={at} />
          <p className="font-medium">{title}</p>
          {detail && (
            <p className="text-muted-foreground break-words">{detail}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
