import type { Metadata } from "next";
import { RouteLoading } from "@/components/route-loading";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import PageClient from "./page-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("Reset Password"), referrer: "no-referrer" };
}

export default function Page() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <PageClient />
    </Suspense>
  );
}
