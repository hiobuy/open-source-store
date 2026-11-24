"use client";
import { Spinner } from "@/components/ui/spinner";
import type { HelpCenterArticle } from "@/content/help-center/types";
import { useRemoteResource } from "@/hooks/use-remote-resource";
import { LOCALE_HTML_LANG } from "@/lib/locale";
import { getProcurementAnnouncement } from "@/lib/procurement/client";
import { useLocaleStore } from "@/stores/locale-store";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";
export default function PageClient({
  article: localArticle,
}: {
  article: HelpCenterArticle | null;
}) {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const type = searchParams.get("type")?.trim() || "notice";

  const t = useTranslations();
  const locale = useLocaleStore((state) => state.locale);
  const isArticle = type === "article";
  const validId = isArticle
    ? Boolean(localArticle) || Boolean(id && /^\d+$/.test(id))
    : Boolean(id && /^[A-Za-z0-9_-]+$/.test(id));
  const load = useCallback(async () => {
    if (!id) return { title: "", content: "" };
    return getProcurementAnnouncement(id, LOCALE_HTML_LANG[locale]);
  }, [id, locale]);
  const {
    data: notice,
    loading: noticeLoading,
    error: requestError,
  } = useRemoteResource(
    !isArticle && validId ? `${locale}:notice:${id}` : null,
    load,
  );
  const data = isArticle ? localArticle : notice;
  const loading = !isArticle && noticeLoading;
  const title = String(data?.title ?? "");
  const content = String(data?.content ?? "");
  const error = !validId
    ? t("Please select an article from the Help Center")
    : requestError || (!loading && (!data || !data.title))
      ? t("Failed to load content")
      : null;
  if (loading) {
    return (
      <div className="my-5 flex min-h-[40vh] items-center justify-center bg-white">
        <Spinner className="text-primary h-10 w-10" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-muted-foreground bg-white px-4 py-16 text-center">
        {error}
      </div>
    );
  }
  return (
    <>
      <div className="my-5 rounded-md bg-white px-4 py-8 md:px-8 md:py-12">
        <h1
          dir="auto"
          className="mb-8 text-center text-base font-bold text-[#1a1a1a] md:mb-12 md:text-lg"
        >
          {title}
        </h1>
        {isArticle ? (
          <div
            dir="auto"
            className="article-rich-text prose prose-gray rich-text-content-help-info max-w-none"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        ) : (
          <div
            dir="auto"
            className="text-sm whitespace-pre-wrap text-[#374151] md:text-base"
          >
            {content}
          </div>
        )}
      </div>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .rich-text-content-help-info { line-height: 1.6; }
            .rich-text-content-help-info h2 { font-size: 1.25rem; font-weight: 600; margin: 1rem 0 0.5rem; }
            .rich-text-content-help-info h3 { font-size: 1.125rem; font-weight: 600; margin: 0.75rem 0 0.5rem; }
            .rich-text-content-help-info p { margin: 0.5rem 0; }
            .rich-text-content-help-info ul, .rich-text-content-help-info ol { margin: 0.5rem 0; padding-inline-start: 1.5rem; }
            .rich-text-content-help-info li { margin: 0.25rem 0; }
            .rich-text-content-help-info a { color: #f97316; text-decoration: underline; }
            .rich-text-content-help-info a:hover { color: #ea580c; }
            .rich-text-content-help-info strong { font-weight: 600; }
          `,
        }}
      />
    </>
  );
}
