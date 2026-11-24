"use client";

import {
  getPurchaseBill,
  formatPurchaseAmount,
} from "@/components/features/orders/procurement-purchase-order";
import { Section } from "@/components/layout/section";
import {
  RechargeDialog,
  type RechargeDialogRef,
} from "@/components/recharge-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  PAYMENT_SUCCESS_ORDER_SOURCE_PURCHASE,
  PAYMENT_SUCCESS_ORDER_SOURCE_QUERY,
} from "@/lib/payment/payment-success";
import { useProcurementResource } from "@/hooks/use-procurement-resource";
import { getErrorMessage } from "@/lib/error-message";
import {
  getProcurementPaymentOptions,
  getProcurementPurchaseOrder,
  getProcurementPurchaseStripe,
  getProcurementWallet,
  payProcurementPurchaseOrder,
  ProcurementApiError,
  startProcurementPurchaseStripe,
} from "@/lib/procurement/client";
import {
  procurementAbsoluteUrl,
  procurementCurrentPageUrl,
  safeProcurementPaymentUrl,
} from "@/lib/procurement/payment";
import {
  purchaseLoginHref,
  purchasePaymentHref,
} from "@/lib/procurement/purchase";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
import { useCommonStore, usePriceConvert } from "@/lib/store/common";
import { cn } from "@/lib/utils";
import { Check, CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export function PurchaseCashier({ id }: { id: string }) {
  const t = useTranslations();
  const router = useRouter();
  const session = useProcurementSessionStore(
    (state) => state.clientStateVersion,
  );
  const hasSession = useProcurementSessionStore((state) => state.hasSession);
  const searchParams = useSearchParams();
  // A wallet top-up started from this page also returns here with a Stripe
  // session; only the order's own card payment should be tracked.
  const sessionId =
    searchParams.get("purpose") === "topup"
      ? ""
      : (searchParams.get("session_id") ?? "");
  const currency = useCommonStore((state) => state.currency);
  const priceConvert = usePriceConvert();
  const [method, setMethod] = useState("");
  const [paying, setPaying] = useState(false);
  const pending = useRef(false);
  const rechargeDialogRef = useRef<RechargeDialogRef>(null);
  const stripeAttempt = useRef<string | null>(null);
  const stripePolls = useRef(0);
  const reviewNotified = useRef(false);
  const orderResource = useProcurementResource(
    getProcurementPurchaseOrder,
    hasSession ? id : null,
  );
  const order = orderResource.data;
  const bill = order && getPurchaseBill(order);
  const payable =
    order?.stage === "awaiting_payment" && bill?.status === "issued";
  const walletResource = useProcurementResource(
    getProcurementWallet,
    payable ? true : null,
  );
  const optionsResource = useProcurementResource(
    getProcurementPaymentOptions,
    payable ? true : null,
  );
  const stripeResource = useProcurementResource(
    getProcurementPurchaseStripe,
    sessionId && hasSession ? id : null,
  );
  const wallet = walletResource.data;
  const options = optionsResource.data;
  const stripeStatus = stripeResource.data?.status;
  const error = orderResource.error ?? walletResource.error;
  const payableCents = bill ? (bill.dueCents ?? bill.totalCents) : 0;
  const openTopUp = () => rechargeDialogRef.current?.init();
  const successPath = `/payment/result?${new URLSearchParams({
    id,
    [PAYMENT_SUCCESS_ORDER_SOURCE_QUERY]: PAYMENT_SUCCESS_ORDER_SOURCE_PURCHASE,
  })}`;
  const loginPath = purchaseLoginHref(purchasePaymentHref(id));
  const reloadStripe = stripeResource.reload;

  useEffect(() => {
    if (!sessionId || stripeStatus !== "pending" || stripePolls.current >= 15)
      return;
    const timer = window.setTimeout(() => {
      stripePolls.current += 1;
      reloadStripe();
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [sessionId, stripeStatus, reloadStripe]);

  useEffect(() => {
    if (!sessionId) return;
    if (bill?.status === "paid" || stripeStatus === "paid") {
      router.replace(successPath);
      return;
    }
    if (stripeStatus === "review" && !reviewNotified.current) {
      reviewNotified.current = true;
      toast(t("Card payment is under review"));
    }
  }, [sessionId, bill?.status, stripeStatus, router, successPath, t]);

  async function payWithBalance() {
    if (!wallet || !bill) return;
    if (wallet.currency !== bill.currency || wallet.balanceFen < payableCents) {
      // A wallet in another currency can't cover the bill at all.
      const neededCents =
        wallet.currency === bill.currency
          ? payableCents - wallet.balanceFen
          : payableCents;
      toast.error(
        t("Insufficient wallet balance", {
          amount: `${bill.currency} ${(neededCents / 100).toFixed(2)}`,
        }),
      );
      return;
    }
    const result = await payProcurementPurchaseOrder(id);
    if (useProcurementSessionStore.getState().clientStateVersion !== session)
      return;
    if (
      result.bills.some((item) => item.id === bill.id && item.status === "paid")
    ) {
      toast.success(t("Payment successful"));
      router.replace(successPath);
    } else {
      orderResource.reload();
    }
  }

  async function payWithStripe() {
    if (!bill || bill.version == null || payableCents <= 0) {
      toast.error(t("Payment failed"));
      return;
    }
    stripeAttempt.current ??= crypto.randomUUID();
    const result = await startProcurementPurchaseStripe(id, {
      id: stripeAttempt.current,
      billVersion: bill.version,
      amountCents: payableCents,
      successUrl: procurementAbsoluteUrl("/member-center/purchase-orders"),
      cancelUrl: procurementCurrentPageUrl(),
    });
    if (useProcurementSessionStore.getState().clientStateVersion !== session)
      return;
    if (result.status === "paid") {
      toast.success(t("Payment successful"));
      router.replace(successPath);
      return;
    }
    if (result.status === "review") {
      toast(t("Card payment is under review"));
      return;
    }
    const url = safeProcurementPaymentUrl(result.url);
    if (!url) throw new Error(t("Payment failed"));
    window.location.assign(url.href);
  }

  async function pay() {
    if (pending.current || !wallet || !bill || !payable) return;
    if (method !== "balance" && method !== "stripe") {
      toast.error(t("Please select a payment method"));
      return;
    }
    pending.current = true;
    setPaying(true);
    try {
      if (method === "stripe") await payWithStripe();
      else await payWithBalance();
    } catch (error) {
      if (useProcurementSessionStore.getState().clientStateVersion !== session)
        return;
      if (error instanceof ProcurementApiError && error.status === 401) {
        router.push(loginPath);
      } else {
        toast.error(getErrorMessage(error) || t("Payment failed"));
      }
    } finally {
      pending.current = false;
      setPaying(false);
    }
  }

  if (
    !hasSession ||
    (error instanceof ProcurementApiError && error.status === 401)
  ) {
    return (
      <Section>
        <Button asChild>
          <Link href={loginPath}>{t("Sign in")}</Link>
        </Button>
      </Section>
    );
  }
  if (
    sessionId &&
    (stripeResource.loading || stripeStatus === "pending") &&
    bill?.status !== "paid"
  ) {
    return (
      <Section>
        <p
          className="flex items-center justify-center gap-2 py-12"
          role="status"
        >
          <Spinner />
          {t("Processing")}
        </p>
      </Section>
    );
  }
  if (orderResource.loading || walletResource.loading) {
    return (
      <div className="py-5 pb-36 sm:pb-5">
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
        <div
          className="fixed start-0 end-0 bottom-0 z-50 flex flex-col items-center gap-4 rounded-tl-lg rounded-tr-lg bg-white p-3 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] sm:relative sm:start-auto sm:end-auto sm:z-auto sm:flex-row sm:justify-end sm:rounded-none sm:shadow-none"
          style={{
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0.75rem))",
          }}
        >
          <div className="w-full space-y-2 sm:w-auto sm:text-end">
            <Skeleton className="h-6 w-36 sm:ms-auto" />
            <Skeleton className="h-3 w-48 sm:ms-auto" />
          </div>
          <Skeleton className="h-12 w-full rounded-[10px] sm:w-[180px]" />
        </div>
      </div>
    );
  }
  if (error || !order || !bill || !payable || !wallet) {
    return (
      <Section>
        <div className="space-y-3 py-12 text-center text-gray-500">
          <p role={error ? "alert" : "status"}>
            {error
              ? getErrorMessage(error) || t("Failed to load order")
              : bill?.status === "paid"
                ? t("Payment successful")
                : t("Order not found")}
          </p>
          {error ? (
            <Button
              variant="outline"
              onClick={() => {
                orderResource.reload();
                walletResource.reload();
              }}
            >
              {t("Try again")}
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link href={bill?.status === "paid" ? successPath : "/payment"}>
                {bill?.status === "paid"
                  ? t("View Order")
                  : t("Pending Payment")}
              </Link>
            </Button>
          )}
        </div>
      </Section>
    );
  }
  return (
    <div className="py-5 pb-36 sm:pb-5">
      <div className="min-h-[100px] space-y-6">
        <div>
          <h3 className="mb-3 text-base font-bold text-[#111827]">
            {t("Pay with Balance")}
          </h3>
          <div
            className={cn(
              "relative flex min-h-[74px] cursor-pointer items-center gap-3 overflow-hidden rounded-xl border bg-[#FAFAFA] p-3 transition-colors md:min-h-[94px] md:p-5",
              method === "balance"
                ? "border-primary bg-white"
                : "hover:border-primary/40 border-transparent",
            )}
            onClick={() => setMethod("balance")}
            role="button"
            aria-pressed={method === "balance"}
            tabIndex={0}
            onKeyDown={(e) => {
              if (
                e.target === e.currentTarget &&
                (e.key === "Enter" || e.key === " ")
              ) {
                e.preventDefault();
                setMethod("balance");
              }
            }}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/images/payment/balance.png"
                alt=""
                className="h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium text-[#374151]">
                {formatPurchaseAmount(wallet.balanceFen, wallet.currency)}
              </p>
              {wallet.currency === "CNY" && currency?.code !== "CNY" && (
                <p className="mt-1 text-xs text-[#6B7280]">
                  ≈{" "}
                  <bdi dir="ltr">
                    {priceConvert(wallet.balanceFen / 100, {
                      useSymbol: false,
                      needFormat: false,
                    })}
                  </bdi>
                </p>
              )}
            </div>
            <button
              type="button"
              className="hover:border-primary/50 shrink-0 rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-[#111827]"
              onClick={(e) => {
                e.stopPropagation();
                openTopUp();
              }}
            >
              {t("Top UP")}
            </button>
            <div
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border md:hidden",
                method === "balance"
                  ? "border-primary bg-primary"
                  : "border-gray-300 bg-white",
              )}
            >
              {method === "balance" && (
                <svg
                  className="h-3 w-3 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
            {method === "balance" && (
              <div className="border-b-primary absolute end-0 bottom-0 hidden h-0 w-0 border-s-[28px] border-b-[28px] border-s-transparent md:block">
                <svg
                  className="absolute end-0 -bottom-7 h-3.5 w-3.5 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}
          </div>
        </div>
        {optionsResource.loading ? (
          <Skeleton className="h-[86px] rounded-xl" />
        ) : (
          <>
            {options?.stripe && (
              <fieldset>
                <legend className="mb-3 text-base font-bold text-[#111827]">
                  {t("Online Payment")}
                </legend>
                <div className="grid gap-3 md:grid-cols-3 md:gap-5">
                  <OptionCard
                    selected={method === "stripe"}
                    disabled={paying}
                    label="Stripe"
                    icon={CreditCard}
                    onSelect={() => setMethod("stripe")}
                  />
                </div>
              </fieldset>
            )}
          </>
        )}
      </div>
      <div
        className="fixed start-0 end-0 bottom-0 z-50 flex flex-col items-center justify-center gap-4 rounded-tl-lg rounded-tr-lg bg-white p-3 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] sm:relative sm:start-auto sm:end-auto sm:z-auto sm:flex-row sm:justify-end sm:rounded-tl-none sm:rounded-tr-none sm:rounded-br-lg sm:rounded-bl-lg sm:shadow-none"
        style={{
          paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0.75rem))",
        }}
      >
        <div className="flex w-full min-w-0 flex-col sm:w-auto sm:items-end">
          <div className="sm:text-end">
            <span className="text-xs text-[#999999]">
              {t("Actual Payable")}:{" "}
            </span>
            <span className="ms-1 text-xl font-bold text-[#CF1322]">
              <bdi dir="ltr">
                {formatPurchaseAmount(payableCents, bill.currency)}
              </bdi>
            </span>
          </div>
          <div className="mt-1 text-xs text-[#666666] sm:text-end">
            <span>
              {t("Payable")}{" "}
              <bdi dir="ltr">
                {formatPurchaseAmount(payableCents, bill.currency)}
              </bdi>
            </span>
            <span className="ms-2">
              {t("Transaction Fee")}{" "}
              <bdi dir="ltr">{formatPurchaseAmount(0, bill.currency)}</bdi>
            </span>
          </div>
        </div>
        <Button
          className="bg-primary hover:bg-primary/90 h-12 w-full min-w-[180px] shrink-0 rounded-[10px] text-base font-bold text-white sm:w-auto"
          onClick={() => void pay()}
          disabled={paying}
        >
          {paying ? (
            <Spinner className="size-6 text-white" />
          ) : (
            t("Confirm Payment")
          )}
        </Button>
      </div>
      <RechargeDialog
        ref={rechargeDialogRef}
        purchaseId={id}
        settlementCurrency={wallet.currency}
      />
    </div>
  );
}

function OptionCard({
  selected,
  disabled,
  label,
  icon: Icon,
  onSelect,
}: {
  selected: boolean;
  disabled: boolean;
  label: string;
  icon: typeof CreditCard;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "relative flex min-h-[74px] cursor-pointer items-center gap-3 overflow-hidden rounded-xl border p-3 text-start transition-colors md:min-h-[86px] md:p-4",
        selected
          ? "border-primary bg-white"
          : "hover:border-primary/40 border-transparent bg-[#FAFAFA]",
      )}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded bg-white">
        <Icon className="size-6 text-[#374151]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#111827]">
        {label}
      </span>
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border md:hidden",
          selected
            ? "border-primary bg-primary text-white"
            : "border-gray-300 bg-white",
        )}
      >
        {selected && <Check className="size-3" aria-hidden />}
      </span>
      {selected && (
        <span className="border-b-primary absolute end-0 bottom-0 hidden border-s-[28px] border-b-[28px] border-s-transparent md:block">
          <Check
            className="absolute end-0 -bottom-7 size-3.5 text-white"
            aria-hidden
          />
        </span>
      )}
    </button>
  );
}
