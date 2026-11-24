"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/image-upload";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
export interface ServiceRecordItem {
  image?: string;
  remark?: string;
  system_type?: number;
  required_images?: string[];
}
interface CustomPhotoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  list: ServiceRecordItem[];
  chargeType?: number;
  systemType?: number;
  readonly?: boolean;
  onConfirm: (
    records: {
      system_type?: number;
      image: string;
      remark: string;
    }[],
  ) => void | Promise<void>;
}
export function CustomPhotoModal({
  open,
  onOpenChange,
  title,
  list,
  chargeType = 2,
  systemType = 2,
  readonly = false,
  onConfirm,
}: CustomPhotoModalProps) {
  const t = useTranslations();
  const isMobile = useIsMobile();
  const [records, setRecords] = useState<ServiceRecordItem[]>([]);
  const isPhotoService = chargeType === 2;
  const resetKey = JSON.stringify([open, list, isPhotoService]);
  const [previousResetKey, setPreviousResetKey] = useState<string | null>(null);
  if (previousResetKey !== resetKey) {
    setPreviousResetKey(resetKey);
    if (open) {
      if (list?.length) {
        setRecords(
          list.map((r) => ({
            image: r.image,
            remark: r.remark ?? "",
            system_type: r.system_type,
            required_images: r.required_images,
          })),
        );
      } else {
        setRecords(
          isPhotoService
            ? [{ remark: "", image: undefined }]
            : [{ remark: "" }],
        );
      }
    }
  }
  const handleConfirm = async () => {
    if (records.length === 0) {
      await onConfirm([]);
      onOpenChange(false);
      return;
    }
    if (records.some((r) => !r.remark?.trim())) {
      toast.error(t("Please fill in all fields"));
      return;
    }
    const data = records.map((r) => ({
      system_type: systemType,
      image: r.image ?? "",
      remark: r.remark ?? "",
    }));
    await onConfirm(data);
    onOpenChange(false);
  };
  const handleCancel = () => {
    onOpenChange(false);
  };
  const addItem = () => {
    setRecords((prev) => [...prev, { remark: "", image: undefined }]);
  };
  const removeItem = (idx: number) => {
    setRecords((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateRecord = (
    idx: number,
    field: keyof ServiceRecordItem,
    value: string | string[] | undefined,
  ) => {
    setRecords((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };
  const formContent = (
    <>
      <h4 className="mb-2.5 text-base font-bold text-[#1a1a1a]">{title}</h4>

      {records.length > 0 && (
        <div className="mb-5 max-h-[500px] overflow-y-auto rounded-lg border border-[#D9D9D9] p-3.5">
          <div className="space-y-3.5">
            {records.map((r, idx) => (
              <div
                key={idx}
                className="flex flex-wrap items-start gap-5 sm:flex-nowrap"
              >
                <div className="me-2 hidden shrink-0 text-base font-bold text-[#1a1a1a] md:block">
                  {isPhotoService
                    ? t("Image {n}", { n: idx + 1 })
                    : t("Remark")}
                </div>
                {!readonly && isPhotoService ? (
                  <div className="shrink-0">
                    <ImageUpload
                      value={r.image ? [{ name: r.image, url: r.image }] : []}
                      onChange={(files) =>
                        updateRecord(idx, "image", files[0]?.url)
                      }
                      showTip={false}
                      limit={1}
                      width={80}
                      height={80}
                    />
                  </div>
                ) : r.image ? (
                  <div className="shrink-0">
                    <img
                      src={r.image}
                      alt=""
                      className="h-20 w-20 rounded-lg border border-[#D9D9D9] object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : null}
                <Textarea
                  value={r.remark ?? ""}
                  onChange={(e) => updateRecord(idx, "remark", e.target.value)}
                  placeholder={t("Please enter your requirements")}
                  className="min-h-[100px] flex-1"
                  readOnly={readonly}
                />
                {!readonly && isPhotoService && (
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="shrink-0 p-1 text-[#1a1a1a] hover:text-red-500"
                  >
                    <Trash2 className="h-6 w-6" />
                  </button>
                )}
                {/* {r.required_images && r.required_images.length > 0 && (
                  <div className="w-[78px] h-[78px] relative rounded-lg overflow-hidden flex items-center justify-center shrink-0">
                    <img
                      src={r.required_images[0]}
                      alt=""
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute bottom-0 start-0 end-0 bg-black/40 text-white text-xs py-1 text-center">
                      Warehouse
                      {r.required_images.length > 1
                        ? ` +${r.required_images.length - 1}`
                        : ""}
                    </div>
                  </div>
                )} */}
              </div>
            ))}
          </div>
        </div>
      )}

      {!readonly && isPhotoService && (
        <div className="mb-4">
          <Button variant="outline" type="button" onClick={addItem}>
            {t("Add")}
          </Button>
        </div>
      )}
    </>
  );
  const actionButtons = !readonly && (
    <div className="mt-4 flex justify-center gap-3">
      <Button
        variant="outline"
        className="h-10 min-w-[70px]"
        onClick={handleCancel}
      >
        {t("Cancel")}
      </Button>
      <Button className="bg-primary h-10 min-w-[70px]" onClick={handleConfirm}>
        {t("Confirm")}
      </Button>
    </div>
  );
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="flex max-h-[90vh] flex-col overflow-hidden rounded-t-2xl p-5"
        >
          <SheetHeader className="shrink-0">
            <SheetTitle className="text-base font-bold text-[#1a1a1a]">
              {t("Value-added Service")}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            {formContent}
          </div>
          {actionButtons && (
            <div className="shrink-0 border-t border-gray-100 pt-4">
              {actionButtons}
            </div>
          )}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-w-[min(90vw,800px)] gap-0 overflow-hidden rounded-2xl p-0"
      >
        <div className="p-5">
          <div className="mb-5 flex items-center justify-between">
            <DialogTitle className="text-base font-bold text-[#1a1a1a]">
              {t("Value-added Service")}
            </DialogTitle>
          </div>
          {formContent}
          {actionButtons}
        </div>
      </DialogContent>
    </Dialog>
  );
}
