/**
 * Forgot password block using the procurement Better Auth service.
 */
"use client";

import {
  TurnstileWidget,
  type TurnstileWidgetHandle,
} from "@/components/features/auth/turnstile-widget";
import { Spinner } from "@/components/ui/spinner";
import { useProcurementSecurity } from "@/hooks/use-procurement-security";
import { getErrorMessage } from "@/lib/error-message";
import { requestPasswordReset } from "@/lib/procurement/client";
import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

type ForgotPasswordStep = "form" | "sent";

export default function PageClient() {
  const t = useTranslations();
  const {
    security,
    loading: securityLoading,
    error: securityError,
    reload: reloadSecurity,
  } = useProcurementSecurity();

  const [step, setStep] = useState<ForgotPasswordStep>("form");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const turnstile = security?.turnstile;
  const turnstileEnabled = Boolean(turnstile?.enabled && turnstile?.reset);
  const turnstileRequired = Boolean(turnstileEnabled && turnstile?.siteKey);
  const turnstileBlocked =
    turnstileEnabled && (!turnstile?.siteKey || !turnstileToken);

  const handleTurnstileToken = useCallback((token: string | null) => {
    setTurnstileToken(token);
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(
      () => setResendCooldown((value) => Math.max(0, value - 1)),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const sendEmail = async (normalizedEmail: string) => {
    if (turnstileBlocked) {
      toast.error(t("The check wasn’t completed Please try again to continue"));
      return false;
    }
    await requestPasswordReset(
      {
        email: normalizedEmail,
        redirectTo: `${window.location.origin}/auth/reset-password`,
      },
      turnstileToken,
    );
    return true;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading || securityLoading) return;
    const normalizedEmail = email.trim();
    if (!normalizedEmail) return;

    setLoading(true);
    try {
      if (!(await sendEmail(normalizedEmail))) return;
      setEmail(normalizedEmail);
      setStep("sent");
      setResendCooldown(60);
      toast.success(t("Password reset email sent"));
    } catch (error) {
      toast.error(
        getErrorMessage(error) ||
          t("Failed to send reset email Please try again"),
      );
    } finally {
      setLoading(false);
      turnstileRef.current?.reset();
    }
  };

  const handleResend = async () => {
    if (resendLoading || resendCooldown > 0 || securityLoading) return;
    const normalizedEmail = email.trim();
    if (!normalizedEmail) return;

    setResendLoading(true);
    try {
      if (!(await sendEmail(normalizedEmail))) return;
      setResendCooldown(60);
      toast.success(t("Password reset email sent"));
    } catch (error) {
      toast.error(
        getErrorMessage(error) ||
          t("Failed to send reset email Please try again"),
      );
    } finally {
      setResendLoading(false);
      turnstileRef.current?.reset();
    }
  };

  if (step === "sent") {
    return (
      <>
        <div className="mb-8">
          <h2
            className="mb-2"
            style={{ fontWeight: "bold", fontSize: "24px", color: "#0F172A" }}
          >
            {t("Check your email")}
          </h2>
          <p style={{ fontWeight: 400, fontSize: "14px", color: "#999999" }}>
            {t("We sent a password reset link to")}
          </p>
        </div>

        <div className="space-y-6">
          <p
            dir="ltr"
            className="rounded-lg bg-gray-50 px-4 py-3 text-sm break-all text-gray-900"
          >
            {email}
          </p>
          <p style={{ fontWeight: 400, fontSize: "14px", color: "#999999" }}>
            {t("The link is valid for 1 hour")}
          </p>

          <TurnstileWidget
            ref={turnstileRef}
            enabled={turnstileRequired}
            siteKey={turnstile?.siteKey || ""}
            onTokenChange={handleTurnstileToken}
          />

          {turnstileEnabled && !turnstile?.siteKey ? (
            <p className="text-destructive text-sm" role="alert">
              {t(
                "The security check couldn’t load Check your connection, then try again",
              )}
            </p>
          ) : null}

          {securityError ? (
            <div className="text-destructive text-sm" role="alert">
              {t("The service is temporarily unavailable Please try again")}{" "}
              <button
                type="button"
                onClick={() => void reloadSecurity()}
                className="font-bold underline"
              >
                {t("Try again")}
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleResend}
            disabled={
              resendLoading ||
              resendCooldown > 0 ||
              securityLoading ||
              turnstileBlocked
            }
            className="bg-primary hover:bg-primary/90 flex h-12 w-full items-center justify-center rounded-lg font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resendLoading ? (
              <Spinner className="h-6 w-6" />
            ) : resendCooldown > 0 ? (
              `${t("Resend email")} (${resendCooldown}s)`
            ) : (
              t("Resend email")
            )}
          </button>

          <div className="text-center">
            <Link
              href="/login"
              className="text-primary text-sm font-bold hover:opacity-80"
            >
              {t("Back to login")}
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-8">
        <h2
          className="mb-2"
          style={{ fontWeight: "bold", fontSize: "24px", color: "#0F172A" }}
        >
          {t("Forgot password")}
        </h2>
        <p style={{ fontWeight: 400, fontSize: "14px", color: "#999999" }}>
          {t("Please enter the email connected to your account")}
        </p>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div>
          <input
            dir="ltr"
            type="email"
            name="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            aria-label={t("Email")}
            placeholder={t("Email")}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="focus:ring-primary/20 focus:border-primary h-12 w-full rounded-lg border border-gray-300 px-4 text-sm focus:ring-2 focus:outline-none"
          />
        </div>

        <TurnstileWidget
          ref={turnstileRef}
          enabled={turnstileRequired}
          siteKey={turnstile?.siteKey || ""}
          onTokenChange={handleTurnstileToken}
        />

        {turnstileEnabled && !turnstile?.siteKey ? (
          <p className="text-destructive text-sm" role="alert">
            {t(
              "The security check couldn’t load Check your connection, then try again",
            )}
          </p>
        ) : null}

        {securityError ? (
          <div className="text-destructive text-sm" role="alert">
            {t("The service is temporarily unavailable Please try again")}{" "}
            <button
              type="button"
              onClick={() => void reloadSecurity()}
              className="font-bold underline"
            >
              {t("Try again")}
            </button>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading || securityLoading || turnstileBlocked}
          className="bg-primary hover:bg-primary/90 flex h-12 w-full items-center justify-center rounded-lg font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading || securityLoading ? (
            <Spinner className="h-6 w-6" />
          ) : (
            t("Reset Password")
          )}
        </button>

        <div className="text-center">
          <Link
            href="/login"
            className="text-primary text-sm font-bold hover:opacity-80"
          >
            {t("Back to login")}
          </Link>
        </div>
      </form>
    </>
  );
}
