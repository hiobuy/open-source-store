"use client";
import {
  PAYMENT_SUCCESS_ORDER_SOURCE_PARCEL,
  PAYMENT_SUCCESS_ORDER_SOURCE_PURCHASE,
  PAYMENT_SUCCESS_ORDER_SOURCE_QUERY,
} from "@/lib/payment/payment-success";
import { ResponsiveContentFrame } from "@/components/layout/responsive-content-frame";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { ArrowRight, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
export default function PageClient() {
  const t = useTranslations();

  const hydrated = useHydrated();
  const searchParams = new URLSearchParams(
    hydrated ? window.location.search : "",
  );
  const orderId = searchParams.get("id");
  const orderSource = searchParams.get(PAYMENT_SUCCESS_ORDER_SOURCE_QUERY);
  const isPaymentFailed = searchParams.get("status") === "failed";
  const viewOrderUrl =
    orderSource === PAYMENT_SUCCESS_ORDER_SOURCE_PARCEL
      ? "/member-center/shipments"
      : orderSource === PAYMENT_SUCCESS_ORDER_SOURCE_PURCHASE && orderId
        ? `/member-center/purchase-orders/${encodeURIComponent(orderId)}`
        : "/member-center/purchase-orders";
  const failureMessage =
    "Payment failed. Please try again or use another payment method.";
  return (
    <ResponsiveContentFrame>
      <div className="my-2 flex min-h-[60vh] items-center justify-center rounded-xl bg-white px-4 py-12">
        <div className="flex flex-col items-center text-center">
          {isPaymentFailed ? (
            <>
              <div
                className="mb-6 flex items-center justify-center"
                aria-hidden
              >
                <XCircle
                  className="h-16 w-16 text-red-500"
                  strokeWidth={1.75}
                />
              </div>
              <p className="mb-8 text-base font-bold text-red-600 md:text-2xl">
                {failureMessage}
              </p>
              <Button
                className="bg-primary hover:bg-primary/90 h-11 min-w-[140px] text-white"
                asChild
              >
                <Link replace href={viewOrderUrl}>
                  {t("View Order")}
                  <ArrowRight className="ms-1.5 inline-block h-4 w-4" />
                </Link>
              </Button>
            </>
          ) : (
            <>
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full">
                <img
                  src="/assets/images/payment-success.png"
                  alt={t("Payment success")}
                  className="h-full w-full object-cover"
                />
              </div>
              <p className="mb-8 text-base font-bold md:text-2xl">
                {t("Your order is successfully placed")}
              </p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Button
                  variant="outline"
                  className="border-primary text-primary hover:bg-primary/5 hover:text-primary h-11 min-w-[140px] bg-transparent"
                  asChild
                >
                  <Link replace href="/">
                    {t("Keep shopping")}
                  </Link>
                </Button>
                <Button
                  className="bg-primary hover:bg-primary/90 h-11 min-w-[140px] text-white"
                  asChild
                >
                  <Link replace href={viewOrderUrl}>
                    {t("View Order")}
                    <ArrowRight className="ms-1.5 inline-block h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </ResponsiveContentFrame>
  );
}
