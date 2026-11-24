"use client";

import { LocalizedLink } from "@/components/localized-link";
import { Button } from "@/components/ui/button";
import { procurementChannel } from "@/lib/procurement/catalog";
import {
  purchasePaymentHref,
  getGoodsLink,
  purchaseProductHref,
} from "@/lib/procurement/purchase";
import type { ProcurementPurchaseOrder } from "@/lib/procurement/types";
import { cn, copyToClipboard } from "@/lib/utils";
import dayjs from "dayjs";
import { useTranslations } from "next-intl";
import { ChevronDown, Copy } from "lucide-react";
import { useState } from "react";
import {
  formatPurchaseAmount,
  getPurchaseBill,
  PurchaseOrderStatus,
} from "./procurement-purchase-order";

export const purchaseOrderColumns =
  "md:grid-cols-[minmax(0,8fr)_minmax(0,2fr)_minmax(0,2fr)_minmax(0,4fr)_minmax(0,3fr)_minmax(0,2fr)]";

export function PurchaseOrderCard({
  order,
}: {
  order: ProcurementPurchaseOrder;
}) {
  const t = useTranslations();
  const [expanded, setExpanded] = useState(false);
  const bill = getPurchaseBill(order);
  const payable =
    order.stage === "awaiting_payment" && bill?.status === "issued";
  const detailHref = `/member-center/purchase-orders/${encodeURIComponent(order.id)}`;
  const channel = procurementChannel(order.platform);
  const amounts = bill
    ? ([
        [t("Total price"), bill.goodsCents],
        [t("Freight (Warehouse)"), bill.shippingCents],
        [t("Value-added Fees"), bill.serviceCents],
      ] as const)
    : [];
  const detailsLink = (
    <LocalizedLink
      href={detailHref}
      className="cursor-pointer text-xs font-bold whitespace-nowrap text-[#333333] hover:underline"
    >
      {t("Order details")}
    </LocalizedLink>
  );

  return (
    <article className="space-y-4 rounded-lg bg-white p-2 md:space-y-0 md:border md:border-gray-200 md:p-0 md:transition-shadow md:hover:shadow-md">
      <header className="flex items-center justify-between md:justify-start md:gap-2 md:border-b md:border-gray-200 md:p-4">
        <div className="flex items-center gap-2">
          <bdi className="text-sm font-medium text-[#333333] md:text-xs">
            {order.number}
          </bdi>
          <button
            type="button"
            aria-label={t("Copy order number")}
            className="text-gray-400 hover:text-gray-600 md:text-red-500"
            onClick={() =>
              void copyToClipboard(order.number, {
                success: t("Successfully copied to clipboard"),
                error: t("Failed to copy to clipboard"),
              })
            }
          >
            <Copy className="size-4" />
          </button>
        </div>
        <span className="text-xs text-[#999999] md:ms-2">
          {dayjs(order.createdAt).format("YYYY-MM-DD HH:mm:ss")}
        </span>
      </header>

      {order.items.map((item, index) => {
        const href =
          channel && item.productId
            ? purchaseProductHref(channel, item.productId, item.name)
            : item.sourceUrl
              ? getGoodsLink(item.sourceUrl, item.name)
              : undefined;
        const lineCurrency = item.currency || bill?.currency;
        const unitText =
          lineCurrency && item.unitPriceCents != null
            ? formatPurchaseAmount(item.unitPriceCents, lineCurrency)
            : "—";
        const amountText =
          lineCurrency && item.subtotalCents != null
            ? formatPurchaseAmount(item.subtotalCents, lineCurrency)
            : "—";
        const product = (
          <>
            <div className="size-20 shrink-0 overflow-hidden rounded border border-gray-200 md:size-25 md:rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl || "/assets/images/package/package.png"}
                alt={item.name}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm text-[#333333] md:text-xs">
                {item.name}
              </p>
              <p className="mt-0.5 text-xs text-[#999999]">
                {item.variantLabel || item.sku}
              </p>
              <p className="mt-1 text-end text-xs text-gray-600 md:hidden">
                x{item.quantity}
              </p>
            </div>
          </>
        );
        return (
          <div
            key={item.id}
            className={cn(
              "grid grid-cols-1 items-center gap-4 md:px-4 md:py-2",
              purchaseOrderColumns,
            )}
          >
            {href ? (
              <LocalizedLink href={href} className="flex gap-3">
                {product}
              </LocalizedLink>
            ) : (
              <div className="flex gap-3">{product}</div>
            )}
            <span className="hidden text-center text-sm font-bold text-[#FF5B00] md:block">
              <bdi>{unitText}</bdi>
            </span>
            <span className="hidden text-center text-xs text-gray-700 md:block">
              x{item.quantity}
            </span>
            <div className="hidden justify-center md:flex">
              <PurchaseOrderStatus order={order} />
            </div>
            <span className="hidden text-center text-xs font-bold text-[#FF5B00] md:block">
              <bdi>{amountText}</bdi>
            </span>
            <div className="hidden justify-end md:flex">
              {index === 0 && detailsLink}
            </div>
          </div>
        );
      })}

      <div className="flex justify-end md:hidden">
        <PurchaseOrderStatus order={order} />
      </div>
      <div className="border-t border-gray-100 pt-3 md:border-gray-200 md:bg-[#fff8f6] md:p-4">
        <div className="flex flex-wrap justify-end gap-2 md:items-center">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center justify-between text-sm md:w-auto md:justify-end md:font-medium md:text-[#333333]"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            <span className="text-gray-600 md:me-1.5 md:w-50 md:text-end">
              {t("Order Total:")}{" "}
            </span>
            <span className="flex items-center gap-1 font-bold text-[#FF5B00] md:text-lg">
              <bdi>
                {bill
                  ? formatPurchaseAmount(bill.totalCents, bill.currency)
                  : "—"}
              </bdi>
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  expanded && "rotate-180",
                )}
              />
            </span>
          </button>
          {payable && (
            <Button
              asChild
              size="sm"
              className="bg-primary hover:bg-primary/90 rounded-full text-xs text-white md:h-8 md:rounded-md md:px-4"
            >
              <LocalizedLink href={purchasePaymentHref(order.id)}>
                {t("Pay now")}
              </LocalizedLink>
            </Button>
          )}
          <Button asChild size="sm" className="rounded-full text-xs md:hidden">
            <LocalizedLink href={detailHref}>
              {t("Order details")}
            </LocalizedLink>
          </Button>
        </div>
        {bill && expanded && (
          <div className="mt-3 space-y-2 text-xs">
            {amounts.map(([label, amount]) => (
              <div key={label} className="flex justify-between md:justify-end">
                <span className="text-[#999999] md:w-50">{label}</span>
                <bdi className="font-bold text-[#333333] md:w-30 md:text-end">
                  {formatPurchaseAmount(amount, bill.currency)}
                </bdi>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
