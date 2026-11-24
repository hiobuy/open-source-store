import { RouteLoading } from "@/components/route-loading";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import PageClient from "./page-client";
export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("Favorites") };
}
export default function Page() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <>
        <PageClient />
      </>
    </Suspense>
  );
}
