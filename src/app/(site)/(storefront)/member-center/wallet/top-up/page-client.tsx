"use client";

import { Section } from "@/components/layout/section";
import {
  RechargeTransferDialog,
  type RechargeTransferFormData,
} from "@/components/features/payment/dialogs/recharge-transfer-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Check, CreditCard, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/error-message";
import {
  getProcurementPaymentOptions,
  startProcurementStripeTopUp,
  submitProcurementBankTransfer,
} from "@/lib/procurement/client";
import {
  parseProcurementAmount,
  procurementAbsoluteUrl,
  procurementCurrentPageUrl,
  safeProcurementPaymentUrl,
} from "@/lib/procurement/payment";
import type { ProcurementPaymentOptions } from "@/lib/procurement/types";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { purchasePaymentHref } from "@/lib/procurement/purchase";
import { toast } from "sonner";

export default function PageClient() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkoutId = searchParams.get("checkout");
  const purchaseId = searchParams.get("purchase");
  const amount = searchParams.get("amount") ?? "";
  // Topping up from an order's payment page goes back there afterwards.
  const returnPath = purchaseId
    ? purchasePaymentHref(purchaseId)
    : checkoutId
      ? `/member-center/shipments/checkout/${encodeURIComponent(checkoutId)}`
      : "/member-center/wallet";
  const [options, setOptions] = useState<ProcurementPaymentOptions>();
  const [loadingFailed, setLoadingFailed] = useState(false);
  const [method, setMethod] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  useEffect(() => {
    let active = true;
    getProcurementPaymentOptions().then(
      (data) => {
        if (!active) return;
        setOptions(data);
        const bank = data.bank ? data.bankAccounts[0] : undefined;
        setMethod(data.cardTopup ? "stripe" : bank ? `bank:${bank.id}` : "");
      },
      () => {
        if (active) setLoadingFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const bankAccounts = options?.bank ? options.bankAccounts : [];
  const bank = bankAccounts.find(({ id }) => method === `bank:${id}`);
  const amountFen = parseProcurementAmount(amount);

  async function pay() {
    if (submitting || !options || !method) return;
    if (
      amountFen === null ||
      amountFen < options.minTopupFen ||
      amountFen > options.maxTopupFen
    ) {
      toast.error(t("Invalid recharge amount"));
      return;
    }

    if (bank) {
      setTransferOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      const url = safeProcurementPaymentUrl(
        await startProcurementStripeTopUp(amountFen, {
          successUrl: procurementAbsoluteUrl(returnPath),
          cancelUrl: procurementCurrentPageUrl(),
        }),
      );
      if (!url) throw new Error(t("Payment failed"));
      window.location.assign(url.href);
    } catch (error) {
      toast.error(getErrorMessage(error) || t("Payment failed"));
      setSubmitting(false);
    }
  }

  async function submitTransfer({
    transfer_account: account,
    remark,
    proof,
  }: RechargeTransferFormData) {
    if (!bank || amountFen === null || !proof || submitting) return;
    if (proof.type !== "image/jpeg" && proof.type !== "image/png") {
      toast.error(
        t("Invalid file format Please upload {formats} image files", {
          formats: "PNG/JPG/JPEG",
        }),
      );
      return;
    }
    const form = new FormData();
    form.set("amountFen", String(amountFen));
    form.set("bankAccountId", bank.id);
    form.set("reference", account.trim());
    form.set("proof", proof);
    const note = remark.trim();
    if (note) form.set("proofNote", note);
    setSubmitting(true);
    try {
      await submitProcurementBankTransfer(form);
      setTransferOpen(false);
      toast.success(t("Application submitted"));
      router.replace(returnPath);
    } catch (error) {
      toast.error(getErrorMessage(error) || t("Failed to submit"));
    } finally {
      setSubmitting(false);
    }
  }

  if (amountFen === null) {
    return (
      <Section>
        <p className="py-12 text-center text-gray-500" role="alert">
          {t(
            amount
              ? "Invalid recharge amount"
              : "Missing recharge amount, please click Top UP on the wallet page to select the amount",
          )}
        </p>
      </Section>
    );
  }

  const amountLabel =
    options && `${options.currency} ${(amountFen / 100).toFixed(2)}`;
  const rechargeAmount = amountFen / 100;

  return (
    <Section className="py-5 pb-36 sm:pb-5">
      {loadingFailed ? (
        <p role="alert">
          {t("The service is temporarily unavailable Please try again")}
        </p>
      ) : !options ? (
        <div aria-busy className="space-y-6">
          <Skeleton className="h-5 w-36" />
          <div className="grid gap-3 md:grid-cols-3 md:gap-5">
            <Skeleton className="h-[74px] rounded-xl md:h-[86px]" />
          </div>
        </div>
      ) : !method ? (
        <p role="status">{t("Unsupported payment method")}</p>
      ) : (
        <>
          <div className="min-h-[100px] space-y-6">
            {options.cardTopup && (
              <fieldset>
                <legend className="mb-3 text-base font-bold text-[#111827]">
                  {t("Online Payment")}
                </legend>
                <div className="grid gap-3 md:grid-cols-3 md:gap-5">
                  <MethodCard
                    value="stripe"
                    current={method}
                    onSelect={setMethod}
                    label="Stripe"
                    icon={CreditCard}
                    disabled={submitting}
                  />
                </div>
              </fieldset>
            )}
            {bankAccounts.length > 0 && (
              <fieldset>
                <legend className="mb-3 text-base font-bold text-[#111827]">
                  {t("Transfer")}
                </legend>
                <div className="grid gap-3 md:grid-cols-3 md:gap-5">
                  {bankAccounts.map((account) => (
                    <MethodCard
                      key={account.id}
                      value={`bank:${account.id}`}
                      current={method}
                      onSelect={setMethod}
                      label={account.label}
                      icon={Landmark}
                      disabled={submitting}
                    />
                  ))}
                </div>
              </fieldset>
            )}
          </div>

          <div
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center justify-center gap-4 rounded-t-lg bg-white p-3 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] sm:relative sm:z-auto sm:flex-row sm:justify-end sm:rounded-t-none sm:rounded-b-lg sm:shadow-none"
            style={{
              paddingBottom:
                "max(0.75rem, env(safe-area-inset-bottom, 0.75rem))",
            }}
          >
            <div className="w-full sm:w-auto sm:text-end">
              <span className="text-xs text-[#999]">
                {t("Actual Payable")}:{" "}
              </span>
              <bdi className="text-xl font-bold text-[#CF1322]">
                {amountLabel}
              </bdi>
              <div className="mt-1 text-xs text-[#666]">
                {t("Recharge Amount")} <bdi>{amountLabel}</bdi>
              </div>
            </div>
            <Button
              type="button"
              onClick={() => void pay()}
              className="h-12 w-full min-w-[180px] shrink-0 rounded-[10px] text-base font-bold text-white sm:w-auto"
              disabled={submitting}
            >
              {submitting ? (
                <Spinner className="size-6 text-white" />
              ) : (
                t("Pay Now")
              )}
            </Button>
          </div>
          {bank && transferOpen && (
            <RechargeTransferDialog
              open={transferOpen}
              selectProof
              option={{
                title: bank.label,
                order_sn: [],
                amount: rechargeAmount,
                currency: options.currency,
                paymentServiceObj: { amount: rechargeAmount, service_fee: 0 },
                payItem: {
                  id: bank.id,
                  remark: bank.instructions,
                  payment_setting_connection: [
                    {
                      id: "bank",
                      name: t("Bank transfer"),
                      content: `${bank.bankName} · ${bank.currency}`,
                    },
                    {
                      id: "payee",
                      name: t("Payee"),
                      content: bank.accountHolder,
                    },
                    {
                      id: "account",
                      name: t("Account"),
                      content: bank.accountNumber,
                    },
                    { id: "swift", name: "SWIFT", content: bank.swift },
                    {
                      id: "country",
                      name: t("Country"),
                      content: bank.country,
                    },
                  ].filter(({ content }) => content),
                },
              }}
              onSubmit={submitTransfer}
              onCancel={() => {
                if (!submitting) setTransferOpen(false);
              }}
            />
          )}
        </>
      )}
    </Section>
  );
}

function MethodCard({
  value,
  current,
  onSelect,
  label,
  icon: Icon,
  disabled,
}: {
  value: string;
  current: string;
  onSelect: (value: string) => void;
  label: string;
  icon: typeof CreditCard;
  disabled: boolean;
}) {
  const selected = value === current;
  return (
    <label
      className={cn(
        "focus-within:outline-primary relative flex min-h-[74px] cursor-pointer items-center gap-3 overflow-hidden rounded-xl border p-3 transition-colors focus-within:outline md:min-h-[86px] md:p-4",
        selected
          ? "border-primary bg-white"
          : "hover:border-primary/40 border-transparent bg-[#FAFAFA]",
      )}
    >
      <input
        className="sr-only"
        type="radio"
        name="method"
        checked={selected}
        onChange={() => onSelect(value)}
        disabled={disabled}
      />
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
    </label>
  );
}
