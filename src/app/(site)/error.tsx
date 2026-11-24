"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export default function Error({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const t = useTranslations();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">{t("Something went wrong")}</h1>
      <p className="text-muted-foreground">
        {t("Please try again or come back later")}
      </p>
      <Button onClick={retry}>{t("Try again")}</Button>
    </main>
  );
}
