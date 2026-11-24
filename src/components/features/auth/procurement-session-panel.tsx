"use client";

import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";
import type { ProcurementSignedInUser } from "@/lib/procurement/types";

export function ProcurementSessionPanel({
  user,
  signingOut,
  onSignOut,
}: {
  user: ProcurementSignedInUser;
  signingOut: boolean;
  onSignOut: () => void;
}) {
  const t = useTranslations();

  return (
    <>
      <div className="mb-8">
        <h2
          className="mb-2"
          style={{ fontWeight: "bold", fontSize: "24px", color: "#0F172A" }}
        >
          {t("Current session")}
        </h2>
        <p style={{ fontWeight: 400, fontSize: "14px", color: "#999999" }}>
          {t("Signed in successfully")}
        </p>
      </div>

      <dl className="mb-6 space-y-4 rounded-lg border border-gray-200 p-4 text-sm">
        {user.name ? (
          <div>
            <dt className="mb-1 text-gray-500">{t("Name")}</dt>
            <dd className="font-medium break-words text-gray-900">
              {user.name}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="mb-1 text-gray-500">{t("Email")}</dt>
          <dd dir="ltr" className="font-medium break-all text-gray-900">
            {user.email}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={onSignOut}
        disabled={signingOut}
        className="bg-primary hover:bg-primary/90 flex h-12 w-full items-center justify-center rounded-lg font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {signingOut ? <Spinner className="h-6 w-6" /> : t("Logout")}
      </button>
    </>
  );
}
