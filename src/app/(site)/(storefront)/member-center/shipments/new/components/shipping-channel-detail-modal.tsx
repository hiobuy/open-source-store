"use client";
import { useTranslations as useUiTranslations } from "next-intl";

import { useIsMobile } from "@/hooks/use-mobile";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetPortal,
  SheetTitle,
} from "@/components/ui/sheet";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

import {
  ShippingLineDetailBody,
  type ShippingLine,
} from "./shipping-line-detail-body";
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 要展示的渠道信息 */
  line?: ShippingLine | null;
  /** 嵌套在已有弹窗内打开时不叠加第二层遮罩 */
  nested?: boolean;
};
/**
 * 渠道详情弹窗：H5 底部 Sheet，PC Dialog；内容与 Freight Estimation 详情页一致。
 */
export function ShippingChannelDetailModal({
  open,
  onOpenChange,
  line,
  nested = false,
}: Props) {
  const translateUi = useUiTranslations();

  const isMobile = useIsMobile();
  const displayLine = open ? line : null;
  const title = translateUi.raw("Shipping estimate details");
  const inner = !displayLine ? (
    <div className="flex items-center justify-center py-16 text-sm text-gray-500">
      {translateUi.raw("No data")}
    </div>
  ) : (
    <ShippingLineDetailBody displayLine={displayLine} />
  );
  return (
    <>
      {isMobile ? (
        <Sheet open={open} onOpenChange={onOpenChange} modal={!nested}>
          {nested ? (
            <SheetPortal>
              <SheetPrimitive.Content
                className={cn(
                  "bg-background fixed inset-x-0 bottom-0 z-[60] flex max-h-[92vh] flex-col overflow-hidden rounded-t-2xl border-t p-5 shadow-lg",
                  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
                )}
              >
                <SheetHeader className="shrink-0">
                  <SheetTitle className="text-center text-base font-bold text-[#1a1a1a]">
                    {title}
                  </SheetTitle>
                </SheetHeader>
                <div className="-mx-1 mt-4 min-h-0 flex-1 overflow-y-auto px-1">
                  {inner}
                </div>
                <SheetPrimitive.Close className="ring-offset-background absolute end-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100">
                  <X className="h-4 w-4" />
                  <span className="sr-only">{translateUi.raw("Close")}</span>
                </SheetPrimitive.Close>
              </SheetPrimitive.Content>
            </SheetPortal>
          ) : (
            <SheetContent
              side="bottom"
              className="flex max-h-[92vh] flex-col overflow-hidden rounded-t-2xl p-5"
            >
              <SheetHeader className="shrink-0">
                <SheetTitle className="text-center text-base font-bold text-[#1a1a1a]">
                  {title}
                </SheetTitle>
              </SheetHeader>
              <div className="-mx-1 mt-4 min-h-0 flex-1 overflow-y-auto px-1">
                {inner}
              </div>
            </SheetContent>
          )}
        </Sheet>
      ) : nested ? (
        <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
          <DialogPortal>
            <DialogPrimitive.Content
              className={cn(
                "bg-background fixed start-1/2 top-1/2 z-[60] flex max-h-[90vh] w-full max-w-[min(92vw,720px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border p-5 shadow-lg",
                "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
              )}
            >
              <DialogHeader className="shrink-0">
                <DialogTitle className="text-center text-base font-bold text-[#1a1a1a]">
                  {title}
                </DialogTitle>
              </DialogHeader>
              <div className="-mx-1 mt-2 min-h-0 flex-1 overflow-y-auto px-1">
                {inner}
              </div>
              <DialogPrimitive.Close className="ring-offset-background absolute end-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100">
                <X className="h-4 w-4" />
                <span className="sr-only">{translateUi.raw("Close")}</span>
              </DialogPrimitive.Close>
            </DialogPrimitive.Content>
          </DialogPortal>
        </Dialog>
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="flex max-h-[90vh] max-w-[min(92vw,720px)] flex-col overflow-hidden rounded-2xl p-5">
            <DialogHeader className="shrink-0">
              <DialogTitle className="text-center text-base font-bold text-[#1a1a1a]">
                {title}
              </DialogTitle>
            </DialogHeader>
            <div className="-mx-1 mt-2 min-h-0 flex-1 overflow-y-auto px-1">
              {inner}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
