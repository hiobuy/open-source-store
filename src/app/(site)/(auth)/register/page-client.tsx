/**
 * Register block using the procurement Better Auth service.
 */
"use client";

import { ProcurementSessionPanel } from "@/components/features/auth/procurement-session-panel";
import {
  TurnstileWidget,
  type TurnstileWidgetHandle,
} from "@/components/features/auth/turnstile-widget";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { useProcurementSecurity } from "@/hooks/use-procurement-security";
import { useProcurementSession } from "@/hooks/use-procurement-session";
import { getErrorMessage } from "@/lib/error-message";
import {
  sendVerificationEmail,
  signUpWithEmail,
} from "@/lib/procurement/client";
import { Eye, EyeOff } from "lucide-react";
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

export default function PageClient() {
  const t = useTranslations();
  const { user, signingOut, setUser, signOut } = useProcurementSession();
  const {
    security,
    loading: securityLoading,
    error: securityError,
    reload: reloadSecurity,
  } = useProcurementSecurity();

  const [step, setStep] = useState<"form" | "pending">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const turnstile = security?.turnstile;
  const turnstileEnabled = Boolean(turnstile?.enabled && turnstile?.register);
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

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading || securityLoading) return;
    const normalizedEmail = email.trim();
    if (!name.trim() || !normalizedEmail || !password) return;
    if (password !== confirmPassword) {
      toast.error(t("Passwords do not match"));
      return;
    }
    if (!agreed) {
      toast.error(t("Please agree to the terms"));
      return;
    }
    if (turnstileBlocked) {
      toast.error(t("The check wasn’t completed Please try again to continue"));
      return;
    }

    setLoading(true);
    try {
      const result = await signUpWithEmail(
        {
          name: name.trim(),
          email: normalizedEmail,
          password,
        },
        turnstileToken,
      );

      setPassword("");
      setConfirmPassword("");

      if (result?.sessionEstablished && result.user?.emailVerified) {
        setUser({
          email: result.user.email || normalizedEmail,
          name: result.user.name,
        });
        toast.success(t("Signed in successfully"));
        return;
      }
      setPendingEmail(normalizedEmail);
      setStep("pending");
      toast.success(t("Verification email sent"));
    } catch (error) {
      toast.error(
        getErrorMessage(error) ||
          t("Could not complete sign-in Please try again"),
      );
    } finally {
      setLoading(false);
      turnstileRef.current?.reset();
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

  const handleSignOut = async () => {
    try {
      await signOut();
      setStep("form");
      setPendingEmail("");
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast.error(
        getErrorMessage(error) ||
          t("Could not complete sign-in Please try again"),
      );
    }
  };

  if (user) {
    return (
      <ProcurementSessionPanel
        user={user}
        signingOut={signingOut}
        onSignOut={handleSignOut}
      />
    );
  }

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
            <span
              style={{ fontWeight: 400, fontSize: "14px", color: "#999999" }}
            >
              {t("Already have an account?")}
            </span>{" "}
            <Link
              href="/login"
              className="text-primary text-sm font-bold hover:opacity-80"
            >
              {t("Log In")}
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
          {t("Create Account")}
        </h2>
        <p style={{ fontWeight: 400, fontSize: "14px", color: "#999999" }}>
          {t("Join us to start shopping worldwide")}
        </p>
      </div>

      <form className="space-y-6" onSubmit={handleRegister}>
        <div>
          <input
            type="text"
            name="name"
            autoComplete="name"
            required
            aria-label={t("Name")}
            placeholder={t("Name")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="focus:ring-primary/20 focus:border-primary h-12 w-full rounded-lg border border-gray-300 px-4 text-sm focus:ring-2 focus:outline-none"
          />
        </div>

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
            autoComplete="new-password"
            required
            minLength={8}
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

        <div className="relative">
          <input
            dir="ltr"
            type={showConfirmPassword ? "text" : "password"}
            name="confirm-password"
            autoComplete="new-password"
            required
            minLength={8}
            aria-label={t("Confirm Password")}
            placeholder={t("Confirm Password")}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="focus:ring-primary/20 focus:border-primary h-12 w-full rounded-lg border border-gray-300 px-4 pe-10 text-sm focus:ring-2 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword((value) => !value)}
            aria-label={t(
              showConfirmPassword ? "Hide password" : "Show password",
            )}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
          >
            {showConfirmPassword ? (
              <Eye className="h-5 w-5" />
            ) : (
              <EyeOff className="h-5 w-5" />
            )}
          </button>
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="agree"
            checked={agreed}
            onCheckedChange={(checked) => setAgreed(checked === true)}
            aria-label={`${t("I have read and agreed to the")} ${t("RegistrationAgreement")} ${t("and")} ${t("User Statement")}`}
            className="mt-1"
          />
          <p className="text-sm text-gray-700">
            <label htmlFor="agree" className="cursor-pointer">
              {t("I have read and agreed to the")}{" "}
            </label>
            <a
              href="/blog/registration-agreement"
              target="_blank"
              rel="noopener"
              className="text-primary font-bold hover:opacity-80"
            >
              {t("RegistrationAgreement")}
            </a>{" "}
            {t("and")}{" "}
            <a
              href="/blog/user-statement"
              target="_blank"
              rel="noopener"
              className="text-primary font-bold hover:opacity-80"
            >
              {t("User Statement")}
            </a>
          </p>
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
            t("Sign Up")
          )}
        </button>

        <div className="text-center">
          <span style={{ fontWeight: 400, fontSize: "14px", color: "#999999" }}>
            {t("Already have an account?")}
          </span>{" "}
          <Link
            href="/login"
            className="text-primary text-sm font-bold hover:opacity-80"
          >
            {t("Log In")}
          </Link>
        </div>
      </form>
    </>
  );
}
