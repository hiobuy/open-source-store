import { RouteLoading } from "@/components/route-loading";
import {
  getHelpArticleSummaries,
  getHelpCategory,
} from "@/lib/server/help-center";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import PageClient from "./page-client";
export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("Search help articles") };
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const categoryId =
    typeof params.category_id === "string" ? params.category_id.trim() : "";
  const keyword =
    typeof params.keyword === "string" ? params.keyword.trim() : "";
  const articles = getHelpArticleSummaries({ categoryId, keyword });
  const category = getHelpCategory(categoryId);
  return (
    <Suspense fallback={<RouteLoading />}>
      <>
        <main className="min-w-0 flex-1">
          <section className="m-[0px] rounded-[0px] p-[12px_0px] lg:p-[24px_0px]">
            <PageClient articles={articles} category={category} />
          </section>
        </main>
      </>
    </Suspense>
  );
}
