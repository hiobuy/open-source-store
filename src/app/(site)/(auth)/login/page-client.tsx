/**
 * Login block using the procurement Better Auth service.
 */
"use client";

import {
  TurnstileWidget,
  type TurnstileWidgetHandle,
} from "@/components/features/auth/turnstile-widget";
import { Spinner } from "@/components/ui/spinner";
import { useProcurementSecurity } from "@/hooks/use-procurement-security";
import { getErrorMessage } from "@/lib/error-message";
import { safeRedirectPath } from "@/lib/redirect";
import {
  ProcurementApiError,
  sendTwoFactorOtp,
  sendVerificationEmail,
  signInWithEmail,
  signInWithGoogle,
  verifyTwoFactorOtp,
  verifyTwoFactorTotp,
} from "@/lib/procurement/client";
import type { ProcurementAuthResponse } from "@/lib/procurement/types";
import {
  useProcurementSessionStore,
  type ProcurementHeaderUser,
} from "@/lib/procurement/session-store";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

type LoginStep = "form" | "pending" | "two-factor";
type TwoFactorMethod = "totp" | "otp";

export default function PageClient() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    security,
    loading: securityLoading,
    error: securityError,
    reload: reloadSecurity,
  } = useProcurementSecurity();

  const [step, setStep] = useState<LoginStep>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorMethod, setTwoFactorMethod] =
    useState<TwoFactorMethod>("totp");
  const [twoFactorMethods, setTwoFactorMethods] = useState<string[] | null>(
    null,
  );
  const [verifying, setVerifying] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);

  const socialError = searchParams.get("social_error") === "google";
  const verificationError = searchParams.has("error") && !socialError;
  const verifiedNotice =
    searchParams.get("verified") === "1" && !verificationError && !socialError;
  const resetNotice =
    searchParams.get("reset") === "1" && !verificationError && !socialError;
  const turnstile = security?.turnstile;
  const turnstileEnabled = Boolean(turnstile?.enabled && turnstile?.login);
  const turnstileRequired = Boolean(turnstileEnabled && turnstile?.siteKey);
  const turnstileBlocked =
    turnstileEnabled && (!turnstile?.siteKey || !turnstileToken);
  const canUseEmailOtp = !twoFactorMethods || twoFactorMethods.includes("otp");

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

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = window.setTimeout(
      () => setOtpCooldown((value) => Math.max(0, value - 1)),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [otpCooldown]);

  const showPending = (address: string) => {
    setPendingEmail(address);
    setPassword("");
    setStep("pending");
  };

  const getSignInTarget = () => {
    const fromUrl = safeRedirectPath(searchParams.get("redirect"), "");
    const fromStorage = safeRedirectPath(
      sessionStorage.getItem("redirect"),
      "",
    );
    return fromUrl || fromStorage || "/";
  };

  const getPostSignInPath = () => {
    const target = getSignInTarget();
    sessionStorage.removeItem("redirect");
    return target;
  };

  const completeSignIn = (
    result: ProcurementAuthResponse,
    allowTotpStatusSuccess = false,
  ) => {
    if (
      !result?.sessionEstablished &&
      !(allowTotpStatusSuccess && result?.status === true)
    ) {
      toast.error(t("Could not complete sign-in Please try again"));
      return;
    }
    const address = result.user?.email || email.trim();
    if (result.user && !result.user.emailVerified) {
      showPending(address);
      return;
    }
    setPassword("");
    if (result.user?.id) {
      const user: ProcurementHeaderUser = {
        id: result.user.id,
        name: result.user.name || "",
        email: address,
        avatar: result.user.image ?? null,
      };
      useProcurementSessionStore.getState().setSessionUser(user);
    } else {
      useProcurementSessionStore.getState().markPendingProfile();
    }
    toast.success(t("Signed in successfully"));
    router.replace(getPostSignInPath());
  };

  const handleGoogleSignIn = async () => {
    if (googleLoading || loading || securityLoading) return;
    setGoogleLoading(true);
    try {
      const result = await signInWithGoogle(getSignInTarget());
      if (!result?.url) throw new Error("Missing Google authorize URL");
      const authorizeUrl = new URL(result.url);
      if (
        authorizeUrl.protocol !== "https:" ||
        authorizeUrl.host !== "accounts.google.com" ||
        authorizeUrl.username ||
        authorizeUrl.password
      ) {
        throw new Error("Unexpected Google authorize URL");
      }
      window.location.assign(authorizeUrl.toString());
      sessionStorage.removeItem("redirect");
    } catch {
      setGoogleLoading(false);
      toast.error(t("Could not complete sign-in Please try again"));
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading || googleLoading || securityLoading) return;
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) return;
    if (turnstileBlocked) {
      toast.error(t("The check wasn’t completed Please try again to continue"));
      return;
    }

    setLoading(true);
    try {
      const result = await signInWithEmail(
        {
          email: normalizedEmail,
          password,
        },
        turnstileToken,
      );
      if (result?.twoFactorRedirect) {
        const methods = Array.isArray(result.twoFactorMethods)
          ? result.twoFactorMethods.filter(
              (method): method is string => typeof method === "string",
            )
          : null;
        const knownMethods = methods?.length ? methods : null;
        setTwoFactorMethods(knownMethods);
        setTwoFactorMethod(
          knownMethods &&
            knownMethods.includes("otp") &&
            !knownMethods.includes("totp")
            ? "otp"
            : "totp",
        );
        setTwoFactorCode("");
        setPassword("");
        setStep("two-factor");
        return;
      }

      completeSignIn(result);
    } catch (error) {
      if (
        error instanceof ProcurementApiError &&
        (error.code === "EMAIL_NOT_VERIFIED" ||
          /email (?:is )?not verified|verify your email/i.test(error.message))
      ) {
        showPending(normalizedEmail);
        return;
      }
      toast.error(
        getErrorMessage(error) ||
          t("Could not complete sign-in Please try again"),
      );
    } finally {
      setLoading(false);
      turnstileRef.current?.reset();
    }
  };

  const handleVerifyTwoFactor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = twoFactorCode.trim();
    if (!/^\d{6}$/.test(code)) {
      toast.error(t("Verification code must be 6 digits"));
      return;
    }
    if (verifying || sendingOtp) return;
    setVerifying(true);
    try {
      const result = await (twoFactorMethod === "otp"
        ? verifyTwoFactorOtp(code)
        : verifyTwoFactorTotp(code));
      if (result?.status === false) {
        toast.error(t("Could not complete sign-in Please try again"));
        return;
      }
      completeSignIn(result, twoFactorMethod === "totp");
    } catch (error) {
      toast.error(
        getErrorMessage(error) ||
          t("Could not complete sign-in Please try again"),
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleSendOtp = async () => {
    if (verifying || sendingOtp || otpCooldown > 0) return;
    setSendingOtp(true);
    try {
      await sendTwoFactorOtp();
      setTwoFactorMethod("otp");
      setTwoFactorCode("");
      setOtpCooldown(60);
      toast.success(t("Verification code sent"));
    } catch (error) {
      toast.error(
        getErrorMessage(error) ||
          t("Failed to send verification code Please try again"),
      );
    } finally {
      setSendingOtp(false);
    }
  };

  const handleResendVerification = async () => {
    if (!pendingEmail || resendLoading || resendCooldown > 0) return;
    setResendLoading(true);
    try {
      await sendVerificationEmail({ email: pendingEmail });
      setResendCooldown(60);
      toast.success(t("Verification email sent"));
    } catch (error) {
      toast.error(
        getErrorMessage(error) ||
          t("Failed to send verification code Please try again"),
      );
    } finally {
      setResendLoading(false);
    }
  };

  const backToLogin = () => {
    setStep("form");
    setPendingEmail("");
    setTwoFactorCode("");
    setTwoFactorMethods(null);
    setOtpCooldown(0);
  };

  if (step === "pending") {
    return (
      <>
        <div className="mb-8">
          <h2
            className="mb-2"
            style={{ fontWeight: "bold", fontSize: "24px", color: "#0F172A" }}
          >
            {t("Verify Your Email")}
          </h2>
          <p style={{ fontWeight: 400, fontSize: "14px", color: "#999999" }}>
            {t("Check your email for a verification link")}
          </p>
        </div>

        <div className="space-y-6">
          <p
            dir="ltr"
            className="rounded-lg bg-gray-50 px-4 py-3 text-sm break-all text-gray-900"
          >
            {pendingEmail}
          </p>

          <button
            type="button"
            onClick={handleResendVerification}
            disabled={resendLoading || resendCooldown > 0}
            className="bg-primary hover:bg-primary/90 flex h-12 w-full items-center justify-center rounded-lg font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resendLoading ? (
              <Spinner className="h-6 w-6" />
            ) : resendCooldown > 0 ? (
              `${t("Resend verification email")} (${resendCooldown}s)`
            ) : (
              t("Resend verification email")
            )}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={backToLogin}
              className="text-primary text-sm font-bold hover:opacity-80"
            >
              {t("Log In")}
            </button>
          </div>
        </div>
      </>
    );
  }

  if (step === "two-factor") {
    return (
      <>
        <div className="mb-8">
          <h2
            className="mb-2"
            style={{ fontWeight: "bold", fontSize: "24px", color: "#0F172A" }}
          >
            {t("Verification")}
          </h2>
          <p style={{ fontWeight: 400, fontSize: "14px", color: "#999999" }}>
            {t("Enter verification code")}
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleVerifyTwoFactor}>
          <div>
            <input
              dir="ltr"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              aria-label={t("Verification Code")}
              placeholder={t("Verification Code")}
              value={twoFactorCode}
              onChange={(event) =>
                setTwoFactorCode(
                  event.target.value.replace(/\D/g, "").slice(0, 6),
                )
              }
              className="focus:ring-primary/20 focus:border-primary h-12 w-full rounded-lg border border-gray-300 px-4 text-center text-lg font-semibold tracking-[0.3em] focus:ring-2 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={verifying || sendingOtp}
            className="bg-primary hover:bg-primary/90 flex h-12 w-full items-center justify-center rounded-lg font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {verifying ? (
              <Spinner className="h-6 w-6" />
            ) : (
              t("Verify and Proceed")
            )}
          </button>

          {canUseEmailOtp ? (
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={verifying || sendingOtp || otpCooldown > 0}
              className="border-primary text-primary flex h-12 w-full items-center justify-center rounded-lg border font-bold transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendingOtp ? (
                <Spinner className="h-6 w-6" />
              ) : otpCooldown > 0 ? (
                `${t("Resend the code")} (${otpCooldown}s)`
              ) : (
                t("Send code")
              )}
            </button>
          ) : null}

          <div className="text-center">
            <button
              type="button"
              onClick={backToLogin}
              className="text-primary text-sm font-bold hover:opacity-80"
            >
              {t("Back")}
            </button>
          </div>
        </form>
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
          {t("Welcome back")}
        </h2>
        <p style={{ fontWeight: 400, fontSize: "14px", color: "#999999" }}>
          {t("Sign in to continue shopping")}
        </p>
      </div>

      <form className="space-y-6" onSubmit={handleLogin}>
        {socialError ? (
          <p
            className="bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm"
            role="alert"
          >
            {t("Could not complete sign-in Please try again")}
          </p>
        ) : verificationError ? (
          <p
            className="bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm"
            role="alert"
          >
            {t("Invalid or expired link")}
          </p>
        ) : resetNotice ? (
          <p
            className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700"
            role="status"
          >
            {t("Your password has been reset Please log in again")}
          </p>
        ) : verifiedNotice ? (
          <p
            className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700"
            role="status"
          >
            {t("Your email address is verified")}
          </p>
        ) : null}

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

        <div className="relative">
          <input
            dir="ltr"
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            required
            aria-label={t("password")}
            placeholder={t("password")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="focus:ring-primary/20 focus:border-primary h-12 w-full rounded-lg border border-gray-300 px-4 pe-10 text-sm focus:ring-2 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={t(showPassword ? "Hide password" : "Show password")}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
          >
            {showPassword ? (
              <Eye className="h-5 w-5" />
            ) : (
              <EyeOff className="h-5 w-5" />
            )}
          </button>
        </div>

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-primary text-sm font-bold hover:opacity-80"
          >
            {t("Forgot password?")}
          </Link>
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
          disabled={
            loading || googleLoading || securityLoading || turnstileBlocked
          }
          className="bg-primary hover:bg-primary/90 flex h-12 w-full items-center justify-center rounded-lg font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading || securityLoading ? (
            <Spinner className="h-6 w-6" />
          ) : (
            t("Login")
          )}
        </button>

        {security?.google?.enabled === true ? (
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading || securityLoading}
            className="border-primary text-primary flex h-12 w-full items-center justify-center rounded-lg border font-bold transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {googleLoading ? (
              <Spinner className="h-6 w-6" />
            ) : (
              t("Continue with Google")
            )}
          </button>
        ) : null}

        <div className="text-center">
          <span style={{ fontWeight: 400, fontSize: "14px", color: "#999999" }}>
            {t("Don't have an account?")}
          </span>{" "}
          <Link
            href="/register"
            className="text-primary text-sm font-bold hover:opacity-80"
          >
            {t("Sign Up")}
          </Link>
        </div>
      </form>
    </>
  );
}
