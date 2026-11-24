import { RouteLoading } from "@/components/route-loading";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import PageClient from "./page-client";
export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("Categories") };
}
export default function Page() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <>
        <main className="min-w-0 flex-1">
          <PageClient />
        </main>
        <MobileNavigation />
      </>
    </Suspense>
  );
}
