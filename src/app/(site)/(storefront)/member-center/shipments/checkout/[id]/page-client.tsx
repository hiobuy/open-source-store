/**
 * OrderPay 组件 - 集运订单支付页
 * 可拖拽的 Puck 组件
 */
"use client";

import { PayItems } from "@/components/features/payment/pay-items";
import { useProcurementResource } from "@/hooks/use-procurement-resource";
import { usePriceConvert } from "@/lib/store/common";
import {
  getProcurementCheckout,
  getProcurementPaymentOptions,
  getProcurementStripeSession,
  payProcurementCheckout,
  startProcurementShipmentStripe,
} from "@/lib/procurement/client";
import {
  safeProcurementPaymentUrl,
  procurementAbsoluteUrl,
  procurementCurrentPageUrl,
} from "@/lib/procurement/payment";
import { getErrorMessage } from "@/lib/error-message";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Section } from "@/components/layout/section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
export default function PageClient({
  id,
  sessionId,
}: {
  id: string;
  sessionId: string;
}) {
  const session = useProcurementSessionStore(
    (state) => state.clientStateVersion,
  );
  return <TransportPayment key={session} id={id} sessionId={sessionId} />;
}

function TransportPayment({
  id,
  sessionId,
}: {
  id: string;
  sessionId: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const priceConvert = usePriceConvert();
  const isMobile = useIsMobile();
  const result = useProcurementResource(getProcurementCheckout, id || null);
  const options = useProcurementResource(
    getProcurementPaymentOptions,
    id && !sessionId ? true : null,
  );
  const stripe = useProcurementResource(
    getProcurementStripeSession,
    sessionId || null,
  );
  const [payType, setPayType] = useState("");
  const [btnLoading, setBtnLoading] = useState(false);
  const pending = useRef(false);
  const walletAttempt = useRef<string>(null);
  const stripePolls = useRef(0);
  const orderDetail = result.data;
  const paid = orderDetail?.status === "PAID";
  const stripeStatus = stripe.data?.status;
  const reloadStripe = stripe.reload;
  const reloadCheckout = result.reload;
  const loading = result.loading || options.loading;
  const payable =
    !!orderDetail &&
    orderDetail.status !== "PAID" &&
    orderDetail.status !== "EXPIRED" &&
    orderDetail.status !== "CANCELLED" &&
    !sessionId &&
    !options.error;

  useEffect(() => {
    if (
      !sessionId ||
      paid ||
      stripeStatus !== "pending" ||
      stripePolls.current >= 15
    )
      return;
    const timer = window.setTimeout(() => {
      stripePolls.current++;
      reloadStripe();
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [sessionId, paid, stripeStatus, reloadStripe]);

  useEffect(() => {
    if (stripeStatus === "paid") reloadCheckout();
  }, [stripeStatus, reloadCheckout]);

  useEffect(() => {
    if (!sessionId) return;
    if (paid) router.replace("/payment/result?orderSource=parcel");
    else if (stripeStatus === "failed") {
      router.replace("/payment/result?orderSource=parcel&status=failed");
    }
  }, [paid, sessionId, stripeStatus, router]);

  async function onPay() {
    if (!orderDetail || !payable || pending.current) return;
    if (!payType) {
      toast.error(t("Please select a payment method"));
      return;
    }
    if (Date.parse(orderDetail.expiresAt) <= Date.now()) {
      toast.error(t("Checkout expired"));
      reloadCheckout();
      return;
    }
    if (payType === "1" && orderDetail.amountNeededFen > 0) {
      toast.error(
        t("Insufficient wallet balance", {
          amount: `${orderDetail.currency} ${(orderDetail.amountNeededFen / 100).toFixed(2)}`,
        }),
      );
      return;
    }
    pending.current = true;
    setBtnLoading(true);
    try {
      if (payType === "1") {
        walletAttempt.current ??= crypto.randomUUID();
        const result = await payProcurementCheckout(
          orderDetail.id,
          walletAttempt.current,
        );
        if (result.status === "PAID") {
          toast.success(t("Payment successful"));
          router.replace("/member-center/shipments");
        } else {
          reloadCheckout();
        }
      } else if (payType === "59" && options.data?.stripe) {
        const url = safeProcurementPaymentUrl(
          (
            await startProcurementShipmentStripe(orderDetail.id, {
              successUrl: procurementAbsoluteUrl("/member-center/shipments"),
              cancelUrl: procurementCurrentPageUrl(),
            })
          ).url,
        );
        if (!url) throw new Error(t("Payment failed"));
        window.location.assign(url.href);
      }
    } catch (error) {
      toast.error(getErrorMessage(error) || t("Payment failed"));
      reloadCheckout();
    } finally {
      pending.current = false;
      setBtnLoading(false);
    }
  }

  if (!id) {
    return (
      <Section>
        <div className="py-12 text-center text-gray-500">
          {t("Please select an order to continue")}
        </div>
      </Section>
    );
  }
  if (loading) {
    return (
      <>
        <div className="py-5">
          <div className="mb-4 rounded-lg bg-white p-3 shadow-[0_0_14px_rgba(0,0,0,0.06)]">
            <div className="mb-3 border-b border-gray-100 py-3">
              <Skeleton className="mx-auto h-8 w-40" />
            </div>
            <div className="space-y-3 py-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-4"
                >
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-36" />
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-gray-100 pt-3 max-md:hidden">
              <Skeleton className="h-12 w-full rounded-[10px]" />
            </div>
          </div>

          <div className={isMobile ? "pb-24" : ""}>
            <div className="mb-6">
              <Skeleton className="mb-3 h-5 w-48" />
              <div className="rounded-xl bg-[#FAFAFA] p-3 md:p-5">
                <div className="flex min-h-[50px] items-center gap-3">
                  <Skeleton className="h-11 w-11 shrink-0 rounded" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-3 w-24 md:hidden" />
                  </div>
                  <Skeleton className="h-9 w-20 rounded-full max-md:hidden" />
                  <Skeleton className="h-5 w-5 shrink-0 rounded-full md:hidden" />
                </div>
              </div>
            </div>

            <div className="mb-6">
              <Skeleton className="mb-3 h-5 w-36" />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-5">
                <div className="rounded-xl bg-[#FAFAFA] p-3 md:p-4">
                  <div className="flex min-h-[50px] items-center gap-3">
                    <Skeleton className="h-11 w-11 shrink-0 rounded" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-28" />
                    </div>
                    <Skeleton className="h-5 w-5 shrink-0 rounded-full md:hidden" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {isMobile && (
          <div className="fixed start-0 end-0 bottom-0 z-50 border-t border-gray-200 bg-white p-4 shadow-lg">
            <Skeleton className="h-12 w-full rounded-[10px]" />
          </div>
        )}
      </>
    );
  }
  if (!orderDetail) {
    return (
      <Section>
        <div className="py-12 text-center text-gray-500">
          {t("Order not found")}
        </div>
      </Section>
    );
  }
  const orderAmount = orderDetail.totalFen / 100;
  const orderNumbers = Array.from(
    new Set(orderDetail.items.map(({ label }) => label.trim()).filter(Boolean)),
  ).join(", ");
  const orderNumberDisplay = orderNumbers || "-";
  const displayAmount =
    orderDetail.currency === "CNY"
      ? priceConvert(orderAmount, { needFormat: false })
      : `${orderDetail.currency} ${orderAmount.toFixed(2)}`;
  return (
    <>
      <div className="py-5">
        {/* 订单信息 */}
        <div className="mb-4 rounded-lg bg-white p-3 shadow-[0_0_14px_rgba(0,0,0,0.06)]">
          {/* 顶部居中价格显示 */}
          <div className="mb-3 border-b border-gray-100 py-3 text-center">
            <span className="text-2xl font-bold text-[#CF1322]">
              <bdi dir="ltr">{displayAmount}</bdi>
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 py-2">
            <span className="shrink-0 text-sm text-[#666666]">
              {t("Order Number:")}
            </span>
            <span className="min-w-0 text-end text-sm font-semibold break-all text-[#1a1a1a]">
              {orderNumberDisplay}
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-[#666666]">{t("Order Amount")}:</span>
            <span className="text-sm font-semibold text-[#1a1a1a]">
              <bdi dir="ltr">{displayAmount}</bdi>
            </span>
          </div>
          {/* PC端按钮 */}
          {payable && !isMobile && (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <Button
                className="bg-primary hover:bg-primary/90 h-12 w-full rounded-[10px] text-base font-bold text-white"
                onClick={onPay}
                disabled={btnLoading}
              >
                {btnLoading ? (
                  <Spinner className="size-6 text-white" />
                ) : (
                  t("Confirm Payment")
                )}
              </Button>
            </div>
          )}
        </div>

        {/* 支付方式 */}
        {payable && (
          <div className={isMobile ? "pb-24" : ""}>
            <PayItems
              amount={orderAmount}
              procurement={{
                balanceFen: orderDetail.walletBalanceFen,
                currency: orderDetail.currency,
                stripe: !!options.data?.stripe,
                checkoutId: orderDetail.id,
              }}
              onPayTypeChange={setPayType}
            />
          </div>
        )}
      </div>

      {/* H5端固定在底部的支付按钮 */}
      {payable && isMobile && (
        <div className="fixed start-0 end-0 bottom-0 z-50 border-t border-gray-200 bg-white p-4 shadow-lg">
          <Button
            className="bg-primary hover:bg-primary/90 h-12 w-full rounded-[10px] text-base font-bold text-white"
            onClick={onPay}
            disabled={btnLoading}
          >
            {btnLoading ? (
              <Spinner className="size-6 text-white" />
            ) : (
              t("Confirm Payment")
            )}
          </Button>
        </div>
      )}
    </>
  );
}
