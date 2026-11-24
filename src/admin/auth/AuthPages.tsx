import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button, Field, Notice, PasswordInput, inputClass } from "../components/ui";
import { Ms } from "../components/icon";
import { api } from "../lib/api";
import { useBrand, usePageTitle } from "../lib/brand";
import { useI18n } from "../lib/i18n";
import { authClient, googleErrorMessage } from "../lib/auth";
import { authHeaders, TurnstileField } from "./TurnstileField";

function AuthFrame({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  const heading = t(title);
  usePageTitle(heading);
  return (
    <section>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{heading}</h1>
      {subtitle ? <p className="mt-2 text-sm leading-6 text-slate-500">{t(subtitle)}</p> : null}
      <div className="mt-6">{children}</div>
      {footer ? <div className="mt-6 border-t border-slate-200 pt-4 text-sm text-slate-500">{footer}</div> : null}
    </section>
  );
}

type PublicSecurity = { google: { enabled: boolean }; turnstile: { enabled: boolean; siteKey: string; login: boolean; register: boolean; reset: boolean } };

function GoogleButton({ callbackURL }: { callbackURL: string }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="mt-4">
      <div className="mb-4 flex items-center gap-3 text-[12px] text-slate-400"><span className="h-px flex-1 bg-slate-200" />{t("or")}<span className="h-px flex-1 bg-slate-200" /></div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button
        className="w-full"
        size="lg"
        variant="secondary"
        type="button"
        loading={pending}
        onClick={() => {
          setPending(true);
          setError("");
          void authClient.signIn.social({ provider: "google", callbackURL, errorCallbackURL: "/admin/login" }).then((result) => {
            if (result.error) {
              setPending(false);
              setError(result.error.message ?? t("Google sign-in did not start."));
            }
          });
        }}
      >
        Continue with Google
      </Button>
    </div>
  );
}

function LegalLinks() {
  const brand = useBrand();
  const { t } = useI18n();
  const linkClass = "underline decoration-slate-300 underline-offset-2 hover:text-ink";
  const items: ReactNode[] = [];
  if (brand.website.termsUrl) items.push(<a key="terms" className={linkClass} href={brand.website.termsUrl}>{t("Terms")}</a>);
  if (brand.website.privacyUrl) items.push(<a key="privacy" className={linkClass} href={brand.website.privacyUrl}>{t("Privacy")}</a>);
  if (brand.supportEmail) items.push(<a key="support" className={linkClass} href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>);
  if (!items.length) return <span />;
  return (
    <p className="text-[13px] text-slate-400">
      {items.map((item, index) => (
        <span key={index}>
          {index > 0 ? <span className="px-1.5">·</span> : null}
          {item}
        </span>
      ))}
    </p>
  );
}

export function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [useBackup, setUseBackup] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const security = useQuery({ queryKey: ["security-public"], queryFn: () => api<PublicSecurity>("/api/security/public") });
  const next = params.get("next");
  const destination = safeNext(next);
  const turnstileOn = Boolean(security.data?.turnstile.enabled && security.data.turnstile.login && security.data.turnstile.siteKey);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (turnstileOn && !turnstileToken) {
      setError(t("Complete the security check and try again."));
      return;
    }
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({ email: String(form.get("email") ?? ""), password: String(form.get("password") ?? ""), ...authHeaders(turnstileToken) });
    setPending(false);
    if (result.error) {
      setTurnstileToken("");
      setTurnstileReset((value) => value + 1);
      setError(result.error.message ?? t("Could not sign in."));
      return;
    }
    if (result.data && "twoFactorRedirect" in result.data && result.data.twoFactorRedirect) {
      setNeedsCode(true);
      return;
    }
    navigate(destination);
  }

  async function onCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    const result = useBackup ? await authClient.twoFactor.verifyBackupCode({ code }) : await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "That code was not accepted.");
      return;
    }
    navigate(destination);
  }

  return (
    <AuthFrame
      title="Sign in"
      subtitle="Use the email you verified for your forwarding account."
      footer={<LegalLinks />}
    >
      {needsCode ? (
        <form className="space-y-4" onSubmit={(event) => void onCode(event)}>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Field label={useBackup ? "Backup code" : "Authenticator code"}>
            <input className={inputClass} name="code" inputMode={useBackup ? "text" : "numeric"} autoComplete="one-time-code" required autoFocus />
          </Field>
          <Button type="submit" className="w-full" loading={pending}>{useBackup ? "Use backup code" : "Verify"}</Button>
          <button type="button" className="text-[13px] font-medium text-slate-500 hover:text-ink" onClick={() => { setUseBackup((value) => !value); setError(""); }}>
            {useBackup ? "Use an authenticator code" : "Use a backup code"}
          </button>
        </form>
      ) : (
        <>
          <form className="space-y-5" onSubmit={(event) => void onSubmit(event)}>
            {params.get("reset") ? <Notice tone="success">Password updated. Sign in with the new one.</Notice> : null}
            {googleErrorMessage(params.get("error")) ? <Notice tone="danger">{googleErrorMessage(params.get("error"))}</Notice> : null}
            <label className="block text-sm font-semibold text-slate-700" htmlFor="login-email">
              {t("Email address")}
              <span className="relative mt-1.5 block">
                <Ms name="mail" className="pointer-events-none absolute top-3.5 left-3.5 text-[16px] text-slate-400" />
                <input id="login-email" className="auth-input" name="email" type="email" autoComplete="email" placeholder="name@email.com" required autoFocus />
              </span>
            </label>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700" htmlFor="login-password">{t("Password")}</label>
                <a className="text-xs font-semibold text-[#087b73] hover:underline" href="/forgot-password">{t("Forgot password?")}</a>
              </div>
              <span className="relative block">
                <Ms name="lock" className="pointer-events-none absolute top-3.5 left-3.5 z-10 text-[16px] text-slate-400" />
                <PasswordInput id="login-password" className="auth-input" name="password" autoComplete="current-password" minLength={8} placeholder="Password" />
              </span>
            </div>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            {turnstileOn && security.data ? <TurnstileField siteKey={security.data.turnstile.siteKey} onToken={setTurnstileToken} resetKey={turnstileReset} /> : null}
            <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#087b73] px-5 py-3.5 text-sm font-semibold text-white shadow-md shadow-teal-900/10 transition hover:bg-[#06635c] focus-visible:ring-4 focus-visible:ring-teal-500/25 disabled:opacity-60" type="submit" disabled={pending}>
              {pending ? t("Signing in…") : t("Sign in to dashboard")}
              <Ms name="arrow_forward" className="text-[16px]" />
            </button>
          </form>
          {security.data?.google.enabled ? <GoogleButton callbackURL={destination} /> : null}
        </>
      )}
    </AuthFrame>
  );
}

function safeNext(next: string | null) {
  if (next?.startsWith("/admin/invite")) return next;
  if (next === "/admin" || next?.startsWith("/admin/")) return next;
  return "/admin";
}
