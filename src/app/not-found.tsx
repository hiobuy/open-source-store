import "./globals.css";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">{t("Page not found")}</h1>
      <p className="text-muted-foreground">
        {t("The page you requested does not exist")}
      </p>
      <Button asChild>
        <Link href="/">{t("Back to home")}</Link>
      </Button>
    </main>
  );
}
