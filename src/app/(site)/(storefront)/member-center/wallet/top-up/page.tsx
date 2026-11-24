import { RouteLoading } from "@/components/route-loading";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import PageClient from "./page-client";
export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("Top up") };
}
export default function Page() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <>
        <style>{"body {\n  background-color: #fff;\n}"}</style>
        <main className="min-w-0 flex-1">
          <div className="site-container">
            <PageClient />
          </div>
        </main>
      </>
    </Suspense>
  );
}
