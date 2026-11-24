"use client";

import {
  RechargeDialog,
  type RechargeDialogRef,
} from "@/components/recharge-dialog";
import { useCurrency, usePriceConvert } from "@/lib/store/common";
import { cn } from "@/lib/utils";
import { CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

const DEFAULT_PAY_ICON = "/assets/images/payment/default-pay-icon.png";
const BALANCE_ITEM = {
  type: "1",
  name: "Balance",
  icon: "/assets/images/payment/balance.png",
  keyName: "balance",
} as const;
const STRIPE_ITEM = {
  type: "59",
  name: "Stripe",
  icon: "",
  keyName: "stripe",
} as const;

export interface PayItemsProps {
  procurement: {
    balanceFen: number;
    currency: string;
    stripe: boolean;
    checkoutId: string;
  };
  /** Order amount in major currency units (e.g. yuan). */
  amount?: number | string;
  onPayTypeChange?: (type: string) => void;
}

export function PayItems({
  procurement,
  amount = 0,
  onPayTypeChange,
}: PayItemsProps) {
  const t = useTranslations();
  const priceConvert = usePriceConvert();
  const { currency } = useCurrency();
  const rechargeDialogRef = useRef<RechargeDialogRef>(null);
  const [activeType, setActiveType] = useState("");

  const balance = procurement.balanceFen;
  const amountFen = Math.round((Number(amount) || 0) * 100);
  const balanceShortfall =
    amountFen > 0 && balance < amountFen ? amountFen - balance : 0;
  const balanceChecked = activeType === BALANCE_ITEM.type;
  const stripeChecked = activeType === STRIPE_ITEM.type;

  const onChangeType = (type: string) => {
    if (activeType === type) return;
    setActiveType(type);
    onPayTypeChange?.(type);
  };

  return (
    <div className="min-h-[100px] space-y-6">
      <div>
        <h3 className="mb-3 text-base font-bold text-[#111827]">
          {t("Pay with Balance")}
        </h3>
        <div
          className={cn(
            "relative flex min-h-[74px] cursor-pointer items-center gap-3 overflow-hidden rounded-xl border bg-[#FAFAFA] p-3 transition-colors md:min-h-[94px] md:p-5",
            balanceChecked
              ? "border-primary bg-white"
              : "hover:border-primary/40 border-transparent",
          )}
          onClick={() => onChangeType(BALANCE_ITEM.type)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onChangeType(BALANCE_ITEM.type);
            }
          }}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={BALANCE_ITEM.icon}
              alt={BALANCE_ITEM.name}
              className="h-full w-full object-contain"
              onError={(event) => {
                (event.target as HTMLImageElement).src = DEFAULT_PAY_ICON;
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium text-[#374151]">
              {procurement.currency !== "CNY"
                ? `${t("Balance")} ${procurement.currency} `
                : t("Balance CNY")}
              {balance / 100}
            </p>
            {currency.code !== "CNY" && procurement.currency === "CNY" && (
              <p className="mt-1 text-xs text-[#6B7280]">
                ≈{" "}
                <bdi dir="ltr">
                  {priceConvert(balance / 100, {
                    useSymbol: false,
                    needFormat: false,
                  })}
                </bdi>
              </p>
            )}
            {balanceShortfall > 0 && (
              <p className="mt-1 text-xs text-[#CF1322]">
                {t("Insufficient wallet balance", {
                  amount: `${procurement.currency} ${(balanceShortfall / 100).toFixed(2)}`,
                })}
              </p>
            )}
          </div>
          <button
            type="button"
            className="hover:border-primary/50 shrink-0 rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-[#111827]"
            onClick={(event) => {
              event.stopPropagation();
              rechargeDialogRef.current?.init();
            }}
          >
            {t("Top UP")}
          </button>
          <div
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border md:hidden",
              balanceChecked
                ? "border-primary bg-primary"
                : "border-gray-300 bg-white",
            )}
          >
            {balanceChecked && (
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
          {balanceChecked && (
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

      {procurement.stripe && (
        <div>
          <h3 className="mb-3 text-base font-bold text-[#111827]">
            {t("Online Payment")}
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-5">
            <div
              className={cn(
                "relative flex min-h-[74px] cursor-pointer items-center gap-3 overflow-hidden rounded-xl border bg-[#FAFAFA] p-3 transition-colors md:min-h-[86px] md:p-4",
                stripeChecked
                  ? "border-primary bg-white"
                  : "hover:border-primary/40 border-transparent",
              )}
              onClick={() => onChangeType(STRIPE_ITEM.type)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onChangeType(STRIPE_ITEM.type);
                }
              }}
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded bg-white">
                <CreditCard className="size-6 text-[#374151]" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#111827]">
                  {STRIPE_ITEM.name}
                </p>
              </div>
              <div
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border md:hidden",
                  stripeChecked
                    ? "border-primary bg-primary"
                    : "border-gray-300 bg-white",
                )}
              >
                {stripeChecked && (
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
              {stripeChecked && (
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
        </div>
      )}

      <RechargeDialog
        ref={rechargeDialogRef}
        checkoutId={procurement.checkoutId}
        settlementCurrency={procurement.currency}
      />
    </div>
  );
}
