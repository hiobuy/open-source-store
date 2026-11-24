import { RouteLoading } from "@/components/route-loading";
import {
  getHelpArticleSummaries,
  getHelpCategories,
} from "@/lib/server/help-center";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import PageClient from "./page-client";
export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("Help center") };
}
export default function Page() {
  const categories = getHelpCategories();
  const popularArticles = getHelpArticleSummaries({ curated: true });
  return (
    <Suspense fallback={<RouteLoading />}>
      <>
        <main className="min-w-0 flex-1">
          <section className="m-[0px] rounded-[0px] p-[12px_0px_24px] lg:p-[24px_0px_36px]">
            <PageClient
              categories={categories}
              popularArticles={popularArticles}
            />
          </section>
        </main>
      </>
    </Suspense>
  );
}
