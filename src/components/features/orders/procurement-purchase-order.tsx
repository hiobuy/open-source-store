import { LocalizedLink } from "@/components/localized-link";
import type {
  ProcurementPurchaseBill,
  ProcurementPurchaseOrder,
} from "@/lib/procurement/types";
import { procurementChannel } from "@/lib/procurement/catalog";
import { getGoodsLink, purchaseProductHref } from "@/lib/procurement/purchase";
import { useTranslations } from "next-intl";

export function getPurchaseBill(order: ProcurementPurchaseOrder) {
  return order.bills.find(({ status }) => status !== "void");
}

export function formatPurchaseAmount(amount: number, currency: string) {
  return `${currency} ${(amount / 100).toFixed(2)}`;
}

export function PurchaseOrderStatus({
  order,
}: {
  order: ProcurementPurchaseOrder;
}) {
  const t = useTranslations();
  const bill = getPurchaseBill(order);
  const fulfillment = order.fulfillment;
  const state = fulfillment?.state;
  let status = order.status;
  if (state === "cancelled" || status === "cancelled") {
    status = t("Cancelled");
  } else if (
    (order.orderType === "manual" && order.stage === "draft" && !bill) ||
    state === "review_required" ||
    state === "cancel_pending" ||
    state === "unknown"
  ) {
    status = t("Pending review");
  } else if (bill?.status === "issued") {
    status = t("Pending Payment");
  } else if (bill?.status === "paid") {
    status = t("Paid");
  }
  return <span className="text-primary text-sm font-medium">{status}</span>;
}

export function PurchaseOrderItems({
  order,
}: {
  order: ProcurementPurchaseOrder;
}) {
  const t = useTranslations();
  const channel = procurementChannel(order.platform);
  return (
    <ul className="divide-y">
      {order.items.map((item) => {
        const href =
          channel && item.productId
            ? purchaseProductHref(channel, item.productId, item.name)
            : item.sourceUrl
              ? getGoodsLink(item.sourceUrl, item.name)
              : undefined;
        return (
          <li key={item.id} className="flex items-start gap-3 py-3">
            {item.imageUrl && (
              <img
                src={item.imageUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="size-16 shrink-0 rounded-md object-cover sm:size-20"
              />
            )}
            <div className="min-w-0 flex-1">
              {href ? (
                <LocalizedLink
                  href={href}
                  className="hover:text-primary font-medium break-words"
                >
                  {item.name}
                </LocalizedLink>
              ) : (
                <p className="font-medium break-words">{item.name}</p>
              )}
              <p className="text-muted-foreground mt-1 text-sm break-words">
                {item.variantLabel || item.sku}
              </p>
              <p className="text-muted-foreground text-sm">
                {t("Quantity")} × {item.quantity}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function PurchaseBillDetails({
  bill,
}: {
  bill: ProcurementPurchaseBill;
}) {
  const t = useTranslations();
  const lines = [
    [t("Amount"), bill.goodsCents],
    [t("Domestic Shipping"), bill.shippingCents],
    [t("Service Fee"), bill.serviceCents],
  ] as [string, number][];
  if (bill.discountCents) lines.push([t("Discount"), -bill.discountCents]);

  return (
    <dl className="space-y-2 text-sm">
      {lines.map(([label, amount]) => (
        <div className="flex justify-between gap-3" key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd>
            <bdi>{formatPurchaseAmount(amount, bill.currency)}</bdi>
          </dd>
        </div>
      ))}
      <div className="flex justify-between gap-3 border-t pt-2 font-semibold">
        <dt>{t("Total Amount")}</dt>
        <dd>
          <bdi>{formatPurchaseAmount(bill.totalCents, bill.currency)}</bdi>
        </dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">{t("Status")}</dt>
        <dd>
          {bill.status === "issued"
            ? t("Pending Payment")
            : bill.status === "paid"
              ? t("Paid")
              : bill.status}
        </dd>
      </div>
    </dl>
  );
}
