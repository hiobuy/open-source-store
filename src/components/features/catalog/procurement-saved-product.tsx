"use client";

import Image from "next/image";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { LocalizedLink } from "@/components/localized-link";
import { Skeleton } from "@/components/ui/skeleton";
import { LOCALE_CONFIG, parseLocale } from "@/lib/locale";
import { procurementChannel } from "@/lib/procurement/catalog";
import type { ProcurementFavorite } from "@/lib/procurement/types";
import { localizedText } from "@/lib/procurement/localized-text";
import { purchaseProductHref } from "@/lib/procurement/purchase";
import { cn } from "@/lib/utils";

export function ProcurementSavedProduct({
  item,
  viewedAt,
  deleting,
  onDelete,
}: {
  item: ProcurementFavorite;
  viewedAt?: number;
  deleting: boolean;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const { htmlLang } = LOCALE_CONFIG[parseLocale(locale)];
  const { product } = item;
  const title =
    localizedText(product.title, htmlLang) ||
    item.productId;
  const channel = procurementChannel(item.channel);
  const href = channel
    ? purchaseProductHref(channel, item.productId, title)
    : undefined;

  const content = (
    <>
      <div
        className={cn(
          "relative w-full bg-gray-50",
          viewedAt === undefined
            ? "h-[200px]"
            : "aspect-square md:aspect-auto md:h-[200px]",
        )}
      >
        {product.images[0] && (
          <Image
            src={product.images[0]}
            alt=""
            fill
            unoptimized
            className="object-cover"
            referrerPolicy="no-referrer"
          />
        )}
      </div>
      <div className="px-2 pt-2 md:px-3">
        <div className="line-clamp-1 text-xs font-medium md:h-6 md:text-sm">
          {title}
        </div>
      </div>
    </>
  );

  return (
    <article className="overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md">
      {href ? (
        <LocalizedLink href={href} className="block hover:text-blue-600">
          {content}
        </LocalizedLink>
      ) : (
        content
      )}
      <div className="flex items-start justify-between gap-2 px-2 pb-2 md:px-3 md:pb-3">
        <div className="text-muted-foreground text-xs">
          <span>{item.channel}</span>
          {viewedAt !== undefined && (
            <time className="block" dateTime={new Date(viewedAt).toISOString()}>
              {new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(viewedAt)}
            </time>
          )}
        </div>
        <button
          type="button"
          aria-label={t("Delete")}
          title={t("Delete")}
          className="text-gray-400 transition-colors hover:text-red-500 disabled:opacity-50"
          disabled={deleting}
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </article>
  );
}

function ProcurementSavedProductSkeleton({
  withTimestamp = false,
}: {
  withTimestamp?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
      <Skeleton className="h-[200px] w-full rounded-none" />
      <div className="space-y-2 px-2 py-2 md:px-3">
        <Skeleton className="h-4 w-4/5" />
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            {withTimestamp && <Skeleton className="h-3 w-28" />}
          </div>
          <Skeleton className="size-4 rounded-sm" />
        </div>
      </div>
    </div>
  );
}

export function ProcurementSavedProductSkeletonGrid({
  withTimestamp = false,
}: {
  withTimestamp?: boolean;
}) {
  return (
    <div
      className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      aria-hidden
    >
      {Array.from({ length: 10 }, (_, index) => (
        <ProcurementSavedProductSkeleton
          key={index}
          withTimestamp={withTimestamp}
        />
      ))}
    </div>
  );
}
