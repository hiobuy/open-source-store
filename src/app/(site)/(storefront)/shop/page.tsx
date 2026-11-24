import { RouteLoading } from "@/components/route-loading";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import PageClient from "./page-client";
export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("Shop") };
}
export default function Page() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <>
        <style>{"body {\n  background-color: #fff;\n}"}</style>
        <main className="min-w-0 flex-1">
          <section className="m-[0px] rounded-[0px] p-[16px_0px_30px]">
            <div className="site-container">
              <PageClient />
            </div>
          </section>
        </main>
      </>
    </Suspense>
  );
}
