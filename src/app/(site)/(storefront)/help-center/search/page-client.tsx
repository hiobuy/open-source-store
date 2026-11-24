"use client";
import { ResponsiveContentFrame } from "@/components/layout/responsive-content-frame";
import type { HelpCenterSearchData } from "@/content/help-center/types";
import { ChevronRight, Search, X } from "lucide-react";
import { useTranslations as useUiTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useState } from "react";
const ARTICLE_RESULTS_PATH = "/help-center/search";

export default function PageClient({
  articles,
  category,
}: HelpCenterSearchData) {
  const translateUi = useUiTranslations();

  const searchParams = useSearchParams();
  const keywordParam = searchParams.get("keyword")?.trim() || "";
  const [keyword, setKeyword] = useState(keywordParam);
  const [previousKeyword, setPreviousKeyword] = useState(keywordParam);
  if (previousKeyword !== keywordParam) {
    setPreviousKeyword(keywordParam);
    setKeyword(keywordParam);
  }
  const router = useRouter();
  const pageTitle = (category?.name ?? "") || translateUi("Search result");
  const handleSearch = (event?: React.FormEvent) => {
    event?.preventDefault();
    const query = keyword.trim();
    if (!query || typeof window === "undefined") return;
    router.push(`${ARTICLE_RESULTS_PATH}?keyword=${encodeURIComponent(query)}`);
  };
  return (
    <section>
      <ResponsiveContentFrame>
        <nav className="mb-5 flex items-center gap-1.5 text-sm font-semibold text-[#8c817a]">
          <Link className="hover:text-primary transition" href="/help-center">
            {translateUi("Help Center")}
          </Link>
          <ChevronRight className="size-4" />
          <span className="text-[#1a1a1a]">{pageTitle}</span>
        </nav>

        <div className="search-result-hero border-primary/5 rounded-[20px] border bg-[linear-gradient(135deg,#fff5f2_0%,#faf8f5_50%,#f6f3ee_100%)] px-5 py-8 shadow-[0_2px_8px_rgba(0,0,0,0.02)] md:px-12 md:py-10">
          <div className="text-center">
            <h1 className="m-0 text-[26px] leading-tight font-black tracking-[-0.04em] text-[#111] md:text-[36px]">
              {translateUi("Search help articles")}
            </h1>
            <p className="mx-auto mt-2 mb-6 max-w-2xl text-sm font-medium text-[#626262] md:text-[15px]">
              {translateUi(
                "Find answers about purchasing, shipping, payments, refunds and account settings",
              )}
            </p>
          </div>
          <form
            className="focus-within:border-primary mx-auto flex max-w-[680px] rounded-2xl border border-black/5 bg-white p-1.5 shadow-[0_20px_40px_rgba(225,6,0,0.04),0_1px_3px_rgba(0,0,0,0.02)] transition focus-within:shadow-[0_0_0_4px_rgba(225,6,0,0.08),0_2px_8px_rgba(0,0,0,0.02)]"
            onSubmit={handleSearch}
          >
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[15px] font-medium text-[#1a1a1a] outline-none placeholder:text-[#a09d9a]"
              placeholder={translateUi("Search help articles…")}
              aria-label={translateUi("Search help articles…")}
              type="text"
            />
            {keyword && (
              <button
                type="button"
                aria-label={translateUi.raw("Clear search")}
                onClick={() => setKeyword("")}
                className="grid h-12 w-9 shrink-0 place-items-center text-[#a09d9a] transition hover:text-[#1a1a1a]"
              >
                <X className="size-4" />
              </button>
            )}
            <button
              type="submit"
              aria-label={translateUi.raw("Search")}
              className="bg-primary hover:bg-primary/90 grid h-12 w-12 place-items-center rounded-xl text-white transition"
            >
              <Search className="size-5" />
            </button>
          </form>
        </div>

        <div className="mt-6 rounded-2xl border border-[#eeebe7] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] md:p-6">
          {articles.length > 0 ? (
            <div className="divide-y divide-[#f1eee9]">
              {articles.map((article) => (
                <Link
                  key={article.id}
                  href={`/help-center/article/${encodeURIComponent(article.slug)}`}
                  className="group hover:text-primary flex items-center justify-between gap-5 py-4 text-start transition first:pt-0 last:pb-0"
                >
                  <strong
                    dir="auto"
                    className="group-hover:text-primary min-w-0 text-[15px] leading-snug font-bold text-[#1a1a1a] transition md:text-base"
                  >
                    {article.title}
                  </strong>
                  <ChevronRight className="group-hover:text-primary size-4 shrink-0 text-[#b0aaa4] transition group-hover:translate-x-1" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-sm font-bold text-[#1a1a1a]">
                {translateUi("No articles found")}
              </p>
              <p className="mt-1 text-xs font-medium text-[#8c817a]">
                {translateUi(
                  "Try another keyword or browse topics from the Help Center",
                )}
              </p>
            </div>
          )}
        </div>
      </ResponsiveContentFrame>
    </section>
  );
}
