import { RouteLoading } from "@/components/route-loading";
import { getHelpArticleById } from "@/lib/server/help-center";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import PageClient from "./page-client";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function loadArticle(searchParams: Props["searchParams"]) {
  const params = await searchParams;
  if (params.type !== "article") return null;
  const article = getHelpArticleById(
    typeof params.id === "string" ? params.id : "",
  );
  if (!article) notFound();
  return article;
}

export async function generateMetadata({ searchParams }: Props) {
  const article = await loadArticle(searchParams);
  const t = await getTranslations();
  return { title: article?.title ?? t("Announcement") };
}
export default async function Page({ searchParams }: Props) {
  const article = await loadArticle(searchParams);

  return (
    <Suspense fallback={<RouteLoading />}>
      <>
        <main className="min-w-0 flex-1">
          <div className="site-container">
            <PageClient article={article} />
          </div>
        </main>
      </>
    </Suspense>
  );
}
