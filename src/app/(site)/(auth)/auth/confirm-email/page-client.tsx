"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getErrorMessage } from "@/lib/error-message";
import { confirmProcurementEmailChange } from "@/lib/procurement/client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function ConfirmEmail({ token }: { token: string }) {
  const t = useTranslations();
  const [error, setError] = useState("");
  const request = useRef<{
    token: string;
    result: Promise<{ data: { email: string } }>;
  }>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    if (request.current?.token !== token) {
      request.current = { token, result: confirmProcurementEmailChange(token) };
    }
    request.current.result.then(
      () => {
        if (active) window.location.replace("/login?verified=1");
      },
      (reason: unknown) => {
        if (active)
          setError(
            getErrorMessage(reason) ||
              t("Failed to change email Please try again"),
          );
      },
    );
    return () => {
      active = false;
    };
  }, [t, token]);

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">{t("Verify Your Email")}</h1>
      {token && !error ? (
        <Spinner />
      ) : (
        <>
          <p role="alert" className="text-muted-foreground text-sm">
            {error || t("Failed to change email Please try again")}
          </p>
          <Button asChild>
            <Link href="/login">{t("Login")}</Link>
          </Button>
        </>
      )}
    </div>
  );
}
