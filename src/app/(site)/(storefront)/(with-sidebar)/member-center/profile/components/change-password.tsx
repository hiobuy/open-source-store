/**
 * Change password block
 */
"use client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { changeProcurementPassword } from "@/lib/procurement/client";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
import { getErrorMessage } from "@/lib/error-message";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Section } from "@/components/layout/section";

export function ChangePassword() {
  const t = useTranslations();

  const [isOpen, setIsOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const checkIsDesktop = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    checkIsDesktop();
    window.addEventListener("resize", checkIsDesktop);
    return () => {
      window.removeEventListener("resize", checkIsDesktop);
    };
  }, []);
  const handleOpen = () => {
    setIsOpen(true);
  };
  const handleClose = () => {
    setIsOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };
  const handleConfirm = async () => {
    if (loading || !currentPassword) return;
    if (!newPassword || !confirmPassword) {
      toast.error(t("Please enter and confirm your new password"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("Passwords do not match"));
      return;
    }
    try {
      setLoading(true);
      await changeProcurementPassword(currentPassword, newPassword);
      useProcurementSessionStore.getState().patchProfile({ hasPassword: true });
      toast.success(t("Password updated successfully"));
      handleClose();
    } catch (error: unknown) {
      console.error("Failed to change password:", error);
      toast.error(
        getErrorMessage(error) ||
          t("Failed to change password Please try again"),
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <Section>
      {
        <>
          <div className="my-3 rounded-[12px] bg-white p-2 md:shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-[#0F172A]">
                {t("Change Password")}
              </h3>
              <button
                onClick={handleOpen}
                className="bg-primary hover:bg-primary/90 flex-shrink-0 rounded-lg px-4 py-[6px] text-sm font-normal whitespace-nowrap text-white"
              >
                {t("Change Password")}
              </button>
            </div>
            <p className="text-[12px] leading-relaxed font-normal text-[#64748B]">
              {t("Enter your current password to change it")}
            </p>
          </div>

          {(() => {
            const formContent = (
              <>
                <div className="space-y-2">
                  <label
                    htmlFor="change-current-password"
                    className="text-sm font-normal text-[#000000]"
                  >
                    <span className="text-primary">*</span>{" "}
                    {t("Current Password")}
                  </label>
                  <input
                    id="change-current-password"
                    type="password"
                    dir="ltr"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    className="focus:ring-primary/20 focus:border-primary h-[44px] w-full rounded-[8px] border border-[#E2E4F0] bg-white px-3 text-sm text-[#000000] focus:ring-2 focus:outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-normal text-[#000000]">
                    <span className="text-primary">*</span> {t("New Password")}
                  </label>
                  <input
                    type="password"
                    dir="ltr"
                    autoComplete="new-password"
                    aria-label={t("New Password")}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t("Please enter new password")}
                    className="focus:ring-primary/20 focus:border-primary h-[44px] w-full rounded-[8px] border border-[#E2E4F0] bg-white px-3 text-sm text-[#000000] placeholder:text-gray-400 focus:ring-2 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-normal text-[#000000]">
                    <span className="text-primary">*</span>{" "}
                    {t("Confirm Password")}
                  </label>
                  <input
                    type="password"
                    dir="ltr"
                    autoComplete="new-password"
                    aria-label={t("Confirm Password")}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t("Confirm Password")}
                    className="focus:ring-primary/20 focus:border-primary h-[44px] w-full rounded-[8px] border border-[#E2E4F0] bg-white px-3 text-sm text-[#000000] placeholder:text-gray-400 focus:ring-2 focus:outline-none"
                  />
                </div>
              </>
            );
            if (isDesktop) {
              return (
                <Dialog
                  open={isOpen}
                  onOpenChange={(open) => (open ? handleOpen() : handleClose())}
                >
                  <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto p-0">
                    <DialogHeader className="px-6 pt-4">
                      <DialogTitle className="text-center text-base font-bold text-[#000000]">
                        {t("Change Password")}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 px-6">{formContent}</div>
                    <div className="flex justify-center px-6 pb-6">
                      <button
                        onClick={handleConfirm}
                        disabled={loading || !currentPassword}
                        className="text-primary border-primary h-[40px] rounded-[8px] border bg-white px-[48px] text-xs font-bold transition-colors"
                      >
                        {loading ? t("Updating") : t("Confirm")}
                      </button>
                    </div>
                  </DialogContent>
                </Dialog>
              );
            } else {
              return (
                <Sheet
                  open={isOpen}
                  onOpenChange={(open) => (open ? handleOpen() : handleClose())}
                >
                  <SheetContent
                    side="bottom"
                    className="h-auto max-h-[80vh] overflow-y-auto rounded-t-[20px] p-0"
                  >
                    <div className="flex flex-col">
                      <SheetHeader className="px-4 pt-4 pb-2">
                        <div className="flex items-center justify-between">
                          <SheetTitle className="text-base font-bold text-[#000000]">
                            {t("Change Password")}
                          </SheetTitle>
                        </div>
                      </SheetHeader>

                      <div className="space-y-4 px-4 py-6">{formContent}</div>

                      <div className="px-4 pb-6">
                        <button
                          onClick={handleConfirm}
                          disabled={loading || !currentPassword}
                          className="bg-primary hover:bg-primary/90 h-[44px] w-full rounded-full text-sm font-bold text-white transition-colors disabled:cursor-not-allowed disabled:bg-gray-300"
                        >
                          {loading ? t("Updating") : t("Confirm")}
                        </button>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              );
            }
          })()}
        </>
      }
    </Section>
  );
}
