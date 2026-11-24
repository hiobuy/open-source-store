"use client";
import React, { useCallback, useImperativeHandle, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { usePriceConvert, useCommonStore } from "@/lib/store/common";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";
import { parseProcurementAmount } from "@/lib/procurement/payment";
import { cn } from "@/lib/utils";
export interface RechargeDialogRef {
  init: () => void;
}
export interface RechargeDialogProps {
  settlementCurrency?: string;
  /** Shipment checkout to return to after topping up. */
  checkoutId?: string;
  /** Purchase order to return to after topping up. */
  purchaseId?: string;
}
export const RechargeDialog = React.forwardRef<
  RechargeDialogRef,
  RechargeDialogProps
>(({ settlementCurrency, checkoutId, purchaseId }, ref) => {
  const t = useTranslations();
  const router = useRouter();
  const { toast } = useToast();
  const priceConvert = usePriceConvert();
  const currencyCode = useCommonStore((s) => s.currency.code);
  const amountCurrency = settlementCurrency || "CNY";
  const [open, setOpen] = useState(false);
  const [rechargeMoney, setRechargeMoney] = useState("");
  const init = useCallback(() => {
    setRechargeMoney("");
    setOpen(true);
  }, []);
  useImperativeHandle(ref, () => ({ init }), [init]);
  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setRechargeMoney(e.target.value);
    },
    [],
  );
  const confirm = useCallback(() => {
    const amount = Number(rechargeMoney);
    if (
      settlementCurrency || checkoutId || purchaseId
        ? parseProcurementAmount(rechargeMoney) === null
        : !Number.isFinite(amount) || amount <= 0
    ) {
      toast({
        variant: "default",
        title: t("Please enter a recharge amount"),
      });
      return;
    }
    setOpen(false);
    const query = new URLSearchParams({ amount: String(amount) });
    if (checkoutId) query.set("checkout", checkoutId);
    if (purchaseId) query.set("purchase", purchaseId);
    router.push(`/member-center/wallet/top-up?${query}`);
  }, [
    rechargeMoney,
    router,
    toast,
    t("Please enter a recharge amount"),
    settlementCurrency,
    checkoutId,
    purchaseId,
  ]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          settlementCurrency &&
            "ring-foreground/10 max-w-sm rounded-xl border-0 text-sm shadow-none ring-1",
        )}
      >
        <DialogHeader
          className={cn("relative", settlementCurrency && "gap-2 text-start")}
        >
          <DialogTitle
            className={cn(
              "text-lg font-bold text-[#1A1A1A]",
              settlementCurrency && "tracking-normal",
            )}
          >
            {t("Top Up")}
          </DialogTitle>
          <button
            type="button"
            onClick={handleClose}
            className="absolute end-0 top-0 cursor-pointer text-lg"
            aria-label={t("Close")}
          >
            <X className="h-5 w-5" />
          </button>
        </DialogHeader>

        <div className="space-y-4">
          {/* <div className="text-sm font-medium text-[#1f1f1f] mb-2.5">
    Custom recharge amount
  </div> */}
          <div className="flex items-center gap-2 rounded-lg py-2.5">
            <span className="leading-5s flex w-[60px] shrink-0 items-center justify-center text-lg font-bold">
              {amountCurrency}
            </span>
            <Input
              value={rechargeMoney}
              inputMode="decimal"
              onChange={handleInputChange}
              placeholder={t("Custom recharge amount")}
              className={cn(
                "flex-1 border-0 bg-[#EFEFEF] shadow-none focus-visible:ring-0",
                settlementCurrency &&
                  "h-8 rounded-lg px-2.5 py-1 text-base focus-visible:ring-offset-0 md:text-sm",
              )}
            />
            {amountCurrency === "CNY" && currencyCode !== "CNY" && (
              <div className="flex items-center gap-1">
                <span className="text-sm text-[#707072]">≈</span>
                <span className="text-lg font-bold">
                  {currencyCode}{" "}
                  <bdi dir="ltr">
                    {priceConvert(rechargeMoney, {
                      needFormat: false,
                      showSymbol: false,
                    })}
                  </bdi>
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 flex justify-center sm:justify-center">
          <button
            type="button"
            onClick={confirm}
            className="bg-primary hover:bg-primary/90 flex h-[45px] w-full cursor-pointer items-center justify-center rounded-md font-medium text-white transition-colors md:w-[280px]"
          >
            {t("Recharge")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
});
RechargeDialog.displayName = "RechargeDialog";
