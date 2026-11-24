"use client";
import React, { useState } from "react";
import { X, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/image-upload";
import { useTranslations } from "next-intl";
import { usePriceConvert } from "@/lib/store/common";
import { MAX_BANK_TRANSFER_PROOF_BYTES } from "@/lib/procurement/types";
import { toast } from "sonner";
import type { ImageUploadFile } from "@/components/image-upload";
export interface PaymentSettingConnection {
  id: number | string;
  name: string;
  content: string;
}
export interface RechargeTransferDialogOption {
  title?: string;
  order_sn: string[];
  orderIds?: string;
  amount: number;
  currency?: string;
  paymentServiceObj: {
    amount: number;
    service_fee: number;
  };
  payItem: {
    id: string | number;
    remark?: string;
    full_path?: string;
    payment_setting_connection?: PaymentSettingConnection[];
  };
}
export type RechargeTransferFormData = {
  id: string;
  payment_id: string | number;
  transfer_account: string;
  remark: string;
  images: string[];
  tran_amount: number;
  proof?: File;
};
interface RechargeTransferDialogProps {
  open: boolean;
  option: RechargeTransferDialogOption;
  onSubmit: (data: RechargeTransferFormData) => void | Promise<void>;
  onCancel: () => void;
  selectProof?: boolean;
}
export function RechargeTransferDialog({
  open,
  option,
  onSubmit,
  onCancel,
  selectProof = false,
}: RechargeTransferDialogProps) {
  const t = useTranslations();
  const priceConvert = usePriceConvert();
  const [account, setAccount] = useState("");
  const [remark, setRemark] = useState("");
  const [fileList, setFileList] = useState<ImageUploadFile[]>([]);
  const [loading, setLoading] = useState(false);
  const formatAmount = (amount: number) =>
    option.currency
      ? `${option.currency} ${amount.toFixed(2)}`
      : priceConvert(amount, { needFormat: false });
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t("Copied successfully"));
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account.trim()) {
      toast.error(t("Please enter account"));
      return;
    }
    if (!fileList.length) {
      toast.error(t("Please upload image(s)"));
      return;
    }
    setLoading(true);
    try {
      const proof = fileList[0]?.file;
      await onSubmit({
        id: option.orderIds ?? option.order_sn?.join(","),
        payment_id: option.payItem.id,
        transfer_account: account,
        remark,
        images: selectProof ? [] : fileList.map((item) => item.url),
        tran_amount: option.amount * 100,
        ...(proof && { proof }),
      });
    } finally {
      setLoading(false);
    }
  };
  const connections = option.payItem.payment_setting_connection ?? [];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[90vh] max-w-[min(94vw,920px)] gap-0 overflow-hidden rounded-2xl p-0 [&>button]:hidden">
        <div className="shop-transfer flex max-h-[90vh] flex-col bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 md:px-6">
            <DialogTitle className="text-lg font-bold text-[#111827] md:text-xl">
              {option.title}
            </DialogTitle>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full p-1.5 transition-colors hover:bg-gray-100"
              aria-label={t("Close")}
            >
              <X className="h-5 w-5 text-[#111827]" />
            </button>
          </div>
          <div className="grid min-h-0 grid-cols-1 overflow-y-auto md:grid-cols-[1fr_360px]">
            <div className="space-y-4 bg-[#F8FAFC] p-5 md:p-6">
              <div className="rounded-xl bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
                <div className="mb-3 text-sm font-bold text-[#111827]">
                  {t("Actual Payable:")}
                </div>
                <div className="text-primary text-2xl font-bold">
                  <bdi dir="ltr">
                    {formatAmount(option.paymentServiceObj.amount)}
                  </bdi>
                </div>
              </div>

              {connections.length > 0 && (
                <div className="rounded-xl bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
                  <div className="space-y-2">
                    {connections.map((item) => (
                      <div
                        key={String(item.id)}
                        className="rounded-lg border border-gray-100 px-3 py-2"
                      >
                        <div className="mb-1 text-xs text-gray-500">
                          {item.name}
                        </div>
                        <div className="flex items-start justify-between gap-3 text-sm font-medium text-[#111827]">
                          <span className="break-all">{item.content}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(item.content)}
                            className="text-primary hover:bg-primary/10 shrink-0 rounded p-1"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(option.payItem.remark || option.payItem.full_path) && (
                <div className="rounded-xl bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
                  {option.payItem.remark && (
                    <div>
                      <div className="mb-2 text-sm font-bold text-[#111827]">
                        {t("Notice:")}
                      </div>
                      <p className="text-sm leading-relaxed text-[#4B5563]">
                        {option.payItem.remark}
                      </p>
                    </div>
                  )}
                  {option.payItem.full_path && (
                    <div className={option.payItem.remark ? "mt-4" : ""}>
                      <div className="mb-2 text-sm font-bold text-[#111827]">
                        {t("Please scan to pay")}
                      </div>
                      <div className="inline-flex rounded-xl border border-gray-100 bg-white p-2">
                        <img
                          src={option.payItem.full_path}
                          alt={t("Payment QR Code")}
                          className="h-40 w-40 rounded-lg object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-4 p-5 md:p-6"
            >
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#111827]">
                  {t("Account")}
                  <span className="text-primary ms-0.5">*</span>
                </label>
                <Input
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder={t("Please enter account")}
                  className="h-11 rounded-lg border-gray-200 bg-white focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#111827]">
                  {t("Remark")}
                </label>
                <Textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder={t("Please enter remark")}
                  rows={4}
                  className="resize-none rounded-lg border-gray-200 bg-white focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#111827]">
                  {t("Upload Image(s)")}
                  <span className="text-primary ms-0.5">*</span>
                </label>
                <div className="rounded-xl border border-dashed border-gray-200 bg-[#FAFAFA] p-3">
                  <ImageUpload
                    value={fileList}
                    onChange={setFileList}
                    limit={selectProof ? 1 : 3}
                    fileSize={
                      selectProof
                        ? MAX_BANK_TRANSFER_PROOF_BYTES / (1024 * 1024)
                        : undefined
                    }
                    selectForSubmit={selectProof}
                  />
                </div>
              </div>
              <div className="mt-auto flex justify-end border-t border-gray-100 pt-4">
                <Button
                  type="submit"
                  className="h-11 min-w-[132px] rounded-full font-semibold"
                  disabled={loading}
                >
                  {loading ? <Spinner className="text-white" /> : t("Submit")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
