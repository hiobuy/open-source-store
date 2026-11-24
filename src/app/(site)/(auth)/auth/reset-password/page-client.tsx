"use client";

import { Spinner } from "@/components/ui/spinner";
import { getErrorMessage } from "@/lib/error-message";
import { resetPassword } from "@/lib/procurement/client";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export default function PageClient() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const linkError = searchParams.get("error");
  const invalid = !token || linkError === "INVALID_TOKEN";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (password.length < 8) {
      toast.error(t("Password must be at least 8 characters"));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t("Passwords do not match"));
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword({ token, newPassword: password });
      router.replace("/login?reset=1");
    } catch (error: unknown) {
      toast.error(
        getErrorMessage(error) ||
          t("Failed to reset password Please try again"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (invalid) {
    return (
      <>
        <div className="mb-8">
          <h2
            className="mb-2"
            style={{ fontWeight: "bold", fontSize: "24px", color: "#0F172A" }}
          >
            {t("Invalid or expired link")}
          </h2>
        </div>

        <div className="space-y-6">
          <Link
            href="/forgot-password"
            className="text-primary text-sm font-bold hover:opacity-80"
          >
            {t("Forgot password?")}
          </Link>
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
          {t("Reset Password")}
        </h2>
        <p style={{ fontWeight: 400, fontSize: "14px", color: "#999999" }}>
          {t("Please enter and confirm your new password")}
        </p>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="relative">
          <input
            dir="ltr"
            type={showPassword ? "text" : "password"}
            name="newPassword"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            aria-label={t("New Password")}
            placeholder={t("New Password")}
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
            name="confirmPassword"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
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

        <button
          type="submit"
          disabled={submitting}
          className="bg-primary hover:bg-primary/90 flex h-12 w-full items-center justify-center rounded-lg font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? <Spinner className="h-6 w-6" /> : t("Reset Password")}
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
