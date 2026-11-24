"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/image-upload";
import { useTranslations } from "next-intl";
interface RemarkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  remarkText: string;
  remarkImages: string[];
  remarkImageIds?: string[];
  variant?: "description" | "remark";
  onConfirm: (data: {
    remarkText: string;
    remarkImages: string[];
    remarkImageIds: string[];
  }) => void;
  readonly?: boolean;
  maxLength?: number;
  temporaryImages?: boolean;
}
export function RemarkModal({
  open,
  onOpenChange,
  remarkText,
  remarkImages,
  remarkImageIds,
  variant = "description",
  onConfirm,
  readonly = false,
  maxLength,
  temporaryImages,
}: RemarkModalProps) {
  const t = useTranslations();
  const [inputText, setInputText] = useState("");
  const [imgList, setImgList] = useState<
    {
      name: string;
      url: string;
    }[]
  >([]);
  const resetKey = JSON.stringify([
    open,
    remarkText,
    remarkImages,
    remarkImageIds,
  ]);
  const [previousResetKey, setPreviousResetKey] = useState<string | null>(null);
  if (previousResetKey !== resetKey) {
    setPreviousResetKey(resetKey);
    if (open) {
      setInputText(remarkText || "");
      const imgs = Array.isArray(remarkImages) ? remarkImages : [];
      setImgList(
        imgs.map((url, index) => ({
          name: remarkImageIds?.[index] || `Image ${index + 1}`,
          url,
        })),
      );
    }
  }
  const handleCancel = () => {
    setInputText("");
    setImgList([]);
    onOpenChange(false);
  };
  const handleConfirm = () => {
    onConfirm({
      remarkText: inputText,
      remarkImages: imgList.map((item) => item.url),
      remarkImageIds: imgList.map((item) => item.name),
    });
    handleCancel();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[min(90vw,800px)] gap-0 overflow-hidden rounded-2xl p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="p-5 pb-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-bold text-[#1a1a1a]">
              {t(
                variant === "remark" ? "Product Remark" : "Product Description",
              )}
            </DialogTitle>
          </div>
        </DialogHeader>
        <div className="px-5 pb-5">
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={t("Please enter your requirements for this product")}
            className="mb-3 min-h-[100px]"
            maxLength={maxLength}
            readOnly={readonly}
          />
          <div className="mb-4">
            <ImageUpload
              value={imgList}
              onChange={(list) => setImgList(list)}
              limit={readonly ? imgList.length : 5}
              width={80}
              height={80}
              readonly={readonly}
              temporary={temporaryImages}
              showTip={!readonly}
            />
          </div>
          {!readonly && (
            <div className="flex justify-center gap-3">
              <Button
                variant="outline"
                className="min-w-[70px]"
                onClick={handleCancel}
              >
                {t("Cancel")}
              </Button>
              <Button
                className="bg-primary min-w-[70px]"
                onClick={handleConfirm}
              >
                {t("Confirm")}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
