"use client";

import { MemberEmptyState } from "@/components/features/account/member-empty-state";

import { useState } from "react";
import Image from "next/image";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CustomPagination } from "@/components/custom/custom-pagination";
import {
  LogisticsConfirmation,
  LogisticsLoadState,
} from "@/components/features/logistics/procurement-logistics";
import { LocalizedLink } from "@/components/localized-link";
import { useProcurementResource } from "@/hooks/use-procurement-resource";
import { getErrorMessage } from "@/lib/error-message";
import {
  procurementShopBrowsable,
  procurementShopPath,
} from "@/lib/procurement/catalog";
import {
  getProcurementShopSubscriptions,
  unsubscribeFromProcurementShop,
} from "@/lib/procurement/client";
import type { ProcurementShopSubscription } from "@/lib/procurement/types";

const platformImages = {
  "1688": "/assets/images/common/1688.png",
  taobao: "/assets/images/common/taobao.png",
  weidian: "/assets/images/common/weidian.png",
};

function shopLink(item: ProcurementShopSubscription) {
  let listingShopId: string | undefined;
  if (item.url && URL.canParse(item.url)) {
    const url = new URL(item.url);
    if (
      url.pathname === "/shop" &&
      url.searchParams.get("platform") === item.channel &&
      url.searchParams.get("shop_id") === item.shopId
    ) {
      listingShopId = url.searchParams.get("listing_shop_id") || undefined;
    }
  }
  return procurementShopPath(
    item.channel,
    item.shopId,
    item.name,
    listingShopId,
  );
}

export function ShopSubscriptions() {
  const t = useTranslations();
  const [query, setQuery] = useState({ page: 1, pageSize: 10 });
  const [target, setTarget] = useState<ProcurementShopSubscription>();
  const [pending, setPending] = useState(false);
  const result = useProcurementResource(getProcurementShopSubscriptions, query);
  const page = result.data;

  async function remove() {
    if (!target || !page || pending) return;
    setPending(true);
    try {
      await unsubscribeFromProcurementShop(target.id);
      setTarget(undefined);
      if (page.items.length === 1 && page.page > 1) {
        setQuery({ ...query, page: page.page - 1 });
      } else {
        result.reload();
      }
      toast.success(t("Deleted successfully"));
    } catch (error) {
      toast.error(getErrorMessage(error) || t("Operation failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <LogisticsLoadState
        {...result}
        empty={
          page?.items.length === 0 && (
            <MemberEmptyState variant="shops" label={t("No favorite shops")} />
          )
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {page?.items.map((item) => {
          // Taobao shops have no listing page yet: show them without links.
          const href = procurementShopBrowsable(item.channel)
            ? shopLink(item)
            : null;
          const summary = (
            <>
              <Image
                src={platformImages[item.channel]}
                alt=""
                width={48}
                height={48}
                unoptimized
                className="size-12 shrink-0 rounded-lg bg-gray-100 object-contain"
              />
              <span className="truncate text-sm font-medium">
                {item.name || item.shopId}
              </span>
            </>
          );
          return (
            <article
              key={item.id}
              className="relative flex items-center justify-between gap-3 rounded-lg border bg-white p-2 shadow-sm transition-shadow hover:shadow-md"
            >
              {href ? (
                <LocalizedLink
                  href={href}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  {summary}
                </LocalizedLink>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {summary}
                </div>
              )}
              <div className="flex shrink-0 items-center gap-2">
                {href && (
                  <LocalizedLink
                    href={href}
                    className="border-primary text-primary hover:bg-primary/5 rounded-md border px-4 py-2 text-sm font-medium"
                  >
                    {t("Enter Store")}
                  </LocalizedLink>
                )}
                <button
                  type="button"
                  aria-label={t("Delete")}
                  title={t("Delete")}
                  className="cursor-pointer p-1 text-gray-400 transition-colors hover:text-red-500 disabled:opacity-50"
                  disabled={pending}
                  onClick={() => setTarget(item)}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!!page?.total && (
        <CustomPagination
          total={page.total}
          currentPage={page.page}
          totalPages={Math.ceil(page.total / page.pageSize)}
          pageSize={page.pageSize}
          pageSizeOptions={[5, 10, 20, 50]}
          onPageChange={(page, pageSize) => setQuery({ page, pageSize })}
        />
      )}
      {target && (
        <LogisticsConfirmation
          title={t("Confirm deletion")}
          description={target.name || target.shopId}
          pending={pending}
          onClose={() => setTarget(undefined)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}
