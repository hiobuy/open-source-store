/**
 * Change email block
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
import {
  cancelProcurementEmailChange,
  requestProcurementEmailChange,
  resendProcurementEmailChange,
  sendProcurementEmailChallenge,
} from "@/lib/procurement/client";
import { getErrorMessage } from "@/lib/error-message";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Section } from "@/components/layout/section";

export function ChangeEmail({
  email,
  hasPassword,
  pendingEmail,
  onPendingChange,
}: {
  email: string;
  hasPassword: boolean;
  pendingEmail: string | null;
  onPendingChange: (email: string | null) => void;
}) {
  const t = useTranslations();

  const [isOpen, setIsOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [password, setPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);
  const handleOpen = () => {
    setIsOpen(true);
  };
  const handleClose = () => {
    setIsOpen(false);
    setNewEmail("");
    setVerificationCode("");
    setPassword("");
  };
  const handleGetVerificationCode = async () => {
    if (loading || submitting || countdown > 0) return;
    setLoading(true);
    try {
      await sendProcurementEmailChallenge();
      toast.success(t("Verification code sent"));
      setCountdown(60);
    } catch (error) {
      toast.error(
        getErrorMessage(error) ||
          t("Failed to send verification code Please try again"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    const nextEmail = newEmail.trim();
    const code = verificationCode.trim();
    if (submitting || loading || (hasPassword ? !password : !code)) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      toast.error(t("Please enter a valid email address"));
      return;
    }

    setSubmitting(true);
    try {
      const pending = await requestProcurementEmailChange({
        email: nextEmail,
        ...(hasPassword ? { password } : { code }),
      });
      onPendingChange(pending);
      toast.success(t("Check your email for a verification link"));
      handleClose();
    } catch (error) {
      toast.error(
        getErrorMessage(error) || t("Failed to change email Please try again"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handlePendingAction = async (action: "resend" | "cancel") => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (action === "cancel") {
        await cancelProcurementEmailChange();
        onPendingChange(null);
      } else {
        await resendProcurementEmailChange();
        toast.success(t("Verification email sent"));
      }
    } catch (error) {
      toast.error(
        getErrorMessage(error) || t("Failed to change email Please try again"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Section>
      {
        <>
          <div className="my-3 rounded-[12px] bg-white p-2 md:shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-[#0F172A]">
                {t("Change Email")}
              </h3>
              <button
                onClick={handleOpen}
                disabled={submitting}
                className="bg-primary flex-shrink-0 rounded-lg px-4 py-[6px] text-sm font-normal whitespace-nowrap text-white"
              >
                {t("Revise")}
              </button>
            </div>
            <p className="text-[12px] leading-relaxed font-normal text-[#64748B]">
              {t(
                "To improve your service experience and ensure account security, please bind a valid email address",
              )}
            </p>
            {pendingEmail && (
              <div className="mt-3 space-y-2 text-sm">
                <p>
                  {t("Check your email for a verification link")}{" "}
                  <bdi dir="ltr">{pendingEmail}</bdi>
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="text-primary underline-offset-4 hover:underline disabled:opacity-50"
                    onClick={() => void handlePendingAction("resend")}
                    disabled={submitting}
                  >
                    {t("Resend verification email")}
                  </button>
                  <button
                    type="button"
                    className="underline-offset-4 hover:underline disabled:opacity-50"
                    onClick={() => void handlePendingAction("cancel")}
                    disabled={submitting}
                  >
                    {t("Cancel")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {(() => {
            const formContent = (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-normal text-[#000000]">
                    {t("Old Email")}
                  </label>
                  <div className="text-sm font-bold break-all text-[#000000]">
                    <bdi dir="ltr">{email}</bdi>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-normal text-[#000000]">
                    <span className="text-[#FF0000]">*</span> {t("New Email")}
                  </label>
                  <input
                    type="email"
                    dir="ltr"
                    autoComplete="email"
                    aria-label={t("New Email")}
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder={t("Please enter your new email address")}
                    className="focus:ring-primary/20 focus:border-primary h-[44px] w-full rounded-[8px] border border-[#E2E4F0] bg-white px-3 text-sm text-[#000000] placeholder:text-gray-400 focus:ring-2 focus:outline-none"
                  />
                </div>

                {hasPassword ? (
                  <div className="space-y-2">
                    <label
                      htmlFor="change-email-password"
                      className="text-sm font-normal text-[#000000]"
                    >
                      <span className="text-primary">*</span>{" "}
                      {t("Current Password")}
                    </label>
                    <input
                      id="change-email-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="focus:ring-primary/20 focus:border-primary h-[44px] w-full rounded-[8px] border border-[#E2E4F0] bg-white px-3 text-sm focus:ring-2 focus:outline-none"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-normal text-[#000000]">
                      <span className="text-[#FF0000]">*</span>{" "}
                      {t("Verification Code")}
                    </label>
                    <div className="focus-within:ring-primary/20 focus-within:border-primary flex items-center overflow-hidden rounded-[8px] border border-[#E2E4F0] focus-within:ring-2">
                      <input
                        type="text"
                        dir="ltr"
                        inputMode="numeric"
                        aria-label={t("Verification Code")}
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        placeholder={t("Please enter the verification code")}
                        className="h-[44px] flex-1 border-0 bg-white px-3 text-sm text-[#000000] placeholder:text-gray-400 focus:outline-none"
                      />
                      <div className="h-8 w-px bg-[#E2E4F0]" />
                      <button
                        onClick={handleGetVerificationCode}
                        disabled={countdown > 0 || loading || submitting}
                        className="text-primary h-[44px] px-4 py-2 text-xs font-normal whitespace-nowrap"
                      >
                        {loading
                          ? t("Sending")
                          : countdown > 0
                            ? `${countdown}${t("s")}`
                            : t("Get verification code")}
                      </button>
                    </div>
                  </div>
                )}
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
                        {t("Modify email address")}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 px-6">{formContent}</div>
                    <div className="flex justify-center px-6 pb-6">
                      <button
                        onClick={handleConfirm}
                        disabled={
                          submitting ||
                          loading ||
                          !newEmail.trim() ||
                          (hasPassword ? !password : !verificationCode.trim())
                        }
                        className="text-primary border-primary h-[40px] rounded-[8px] border bg-white px-[48px] text-xs font-bold transition-colors"
                      >
                        {submitting ? t("Submitting\u2026") : t("Confirm")}
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
                            {t("Modify email address")}
                          </SheetTitle>
                        </div>
                      </SheetHeader>

                      <div className="space-y-4 px-4 py-6">{formContent}</div>

                      <div className="px-4 pb-6">
                        <button
                          onClick={handleConfirm}
                          disabled={
                            submitting ||
                            loading ||
                            !newEmail.trim() ||
                            (hasPassword ? !password : !verificationCode.trim())
                          }
                          className="bg-primary h-[44px] w-full rounded-full text-sm font-bold text-white transition-colors"
                        >
                          {submitting ? t("Submitting\u2026") : t("Confirm")}
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
