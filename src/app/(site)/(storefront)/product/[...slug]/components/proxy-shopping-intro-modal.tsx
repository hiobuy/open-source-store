/**
 * 代购流程说明弹窗
 * 在加入购物车/立即购买前展示，介绍两步代购流程
 * 支持「下次不提醒」勾选，勾选后写入 localStorage 不再弹出
 */
"use client";
import { useTranslations } from "next-intl";
import { useState, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
const STORAGE_KEY = "proxy_shopping_intro_dismissed";
export function getProxyIntroDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "1";
}
export function setProxyIntroDismissed(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, "1");
}
export interface ProxyShoppingIntroModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (dontShowAgain: boolean) => void;
}
export function ProxyShoppingIntroModal({
  open,
  onOpenChange,
  onConfirm,
}: ProxyShoppingIntroModalProps) {
  const t = useTranslations();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const resolvedTipsImageSrc = "/assets/images/goods-details/tips.png";
  const handleConfirm = () => {
    onConfirm(dontShowAgain);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={true}>
      <DialogContent
        showCloseButton={true}
        className="w-[95vw] max-w-[400px] overflow-hidden border-0 p-0 shadow-xl sm:max-w-md"
      >
        <div className="p-5 sm:p-6">
          <DialogHeader className="text-center text-sm font-bold">
            <div className="mb-0 text-[#1A1A1A]">
              {t("Buy & Ship Any Chinese Items For You")}
            </div>
            <div className="mb-0 text-[#1A1A1A]">
              {t("Proxy Shopping in")}{" "}
              <span className="text-primary font-bold">
                {t("Just 2 Steps")}
              </span>
            </div>
          </DialogHeader>

          {resolvedTipsImageSrc ? (
            <div className="mt-5">
              <img
                src={resolvedTipsImageSrc}
                alt={t("Proxy Shopping Intro")}
                className="h-auto w-full"
              />
            </div>
          ) : null}

          <p className="mt-4 text-xs leading-relaxed font-bold text-gray-600">
            {t(
              "This website procures from selected platforms but does not cover third-party item risks",
            )}
          </p>

          {/* Footer */}
          <div className="mt-5 space-y-4">
            <Button
              onClick={handleConfirm}
              className="bg-primary hover:bg-primary/90 h-11 w-full rounded-full text-base font-semibold text-white"
            >
              {t("I Know")}
            </Button>
            <label className="flex cursor-pointer items-center justify-center gap-2 select-none">
              <Checkbox
                checked={dontShowAgain}
                onCheckedChange={(c) => setDontShowAgain(c === true)}
                className="rounded-full border-gray-300"
              />
              <span className="text-sm font-medium text-gray-500">
                {t("Don't Show Again")}
              </span>
            </label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
/** 在加入购物车/立即购买前展示代购说明弹窗，若已勾选「下次不提醒」则直接执行 */
export function useProxyShoppingIntro() {
  const [open, setOpen] = useState(false);
  const pendingCallbackRef = useRef<(() => void) | null>(null);
  const runWithIntro = useCallback((callback: () => void) => {
    if (getProxyIntroDismissed()) {
      callback();
      return;
    }
    pendingCallbackRef.current = callback;
    setOpen(true);
  }, []);
  const handleConfirm = useCallback((dontShowAgain: boolean) => {
    if (dontShowAgain) setProxyIntroDismissed();
    const fn = pendingCallbackRef.current;
    pendingCallbackRef.current = null;
    fn?.();
  }, []);
  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) pendingCallbackRef.current = null;
  }, []);
  return {
    open,
    setOpen: handleOpenChange,
    runWithIntro,
    handleConfirm,
  };
}
