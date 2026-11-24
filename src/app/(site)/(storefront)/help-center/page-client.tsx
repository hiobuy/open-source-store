"use client";
import { ResponsiveContentFrame } from "@/components/layout/responsive-content-frame";
import type { HelpCenterLandingData } from "@/content/help-center/types";
import {
  ChevronRight,
  Compass,
  Mail,
  MapPin,
  MessageSquare,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useTranslations as useUiTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

const ARTICLE_RESULTS_PATH = "/help-center/search";

export default function PageClient({
  categories: sourceCategories,
  popularArticles,
}: HelpCenterLandingData) {
  const t = useUiTranslations();
  const categories = sourceCategories;
  const liveChatHref = "";
  const emailSupportHref = "mailto:support@example.com";

  const translateUi = useUiTranslations();

  const [keyword, setKeyword] = useState("");
  const router = useRouter();
  const handleSearch = (event?: React.FormEvent) => {
    event?.preventDefault();
    const query = keyword.trim();
    if (!query || typeof window === "undefined") return;
    router.push(`${ARTICLE_RESULTS_PATH}?keyword=${encodeURIComponent(query)}`);
  };
  return (
    <section>
      <ResponsiveContentFrame>
        <div className="border-primary/5 rounded-[20px] border bg-[linear-gradient(135deg,#fff5f2_0%,#faf8f5_50%,#f6f3ee_100%)] px-5 py-8 shadow-[0_2px_8px_rgba(0,0,0,0.02)] md:px-12 md:py-12">
          <div className="text-center">
            <h1 className="m-0 text-[28px] leading-tight font-black tracking-[-0.04em] text-[#111] md:text-[40px]">
              {t("Hi, how can we help?")}
            </h1>
            <p className="mx-auto mt-2 mb-6 max-w-2xl text-sm font-medium text-[#626262] md:text-[15px]">
              {t(
                "Search answers about purchasing, warehouse storage, customs and global delivery",
              )}
            </p>
          </div>
          <form
            className="focus-within:border-primary mx-auto mb-5 flex max-w-[680px] rounded-2xl border border-black/5 bg-white p-1.5 shadow-[0_20px_40px_rgba(225,6,0,0.04),0_1px_3px_rgba(0,0,0,0.02)] transition focus-within:shadow-[0_0_0_4px_rgba(225,6,0,0.08),0_2px_8px_rgba(0,0,0,0.02)]"
            onSubmit={handleSearch}
          >
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[15px] font-medium text-[#1a1a1a] outline-none placeholder:text-[#a09d9a]"
              placeholder={t("Search orders, shipping, customs, refunds…")}
              aria-label={t("Search orders, shipping, customs, refunds…")}
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
          <div className="flex flex-wrap justify-center gap-2.5">
            <QuickAction
              label={t("Track my order")}
              href="/member-center/shipments"
              icon={Compass}
            />
            <QuickAction
              label={t("Change delivery address")}
              href="/member-center/profile?tab=1"
              icon={MapPin}
            />
            <QuickAction
              label={t("Request a refund")}
              href="/member-center/purchase-orders"
              icon={RotateCcw}
            />
          </div>
        </div>

        {categories.length > 0 && (
          <>
            <h2 className="mt-10 mb-4 text-xl font-extrabold tracking-[-0.02em] text-[#1a1a1a]">
              {t("Browse by topic")}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {categories.map((category) => (
                <Link
                  key={category.id}
                  href={`${ARTICLE_RESULTS_PATH}?category_id=${category.id}`}
                  className="focus-visible:ring-primary/20 flex min-h-[104px] items-center gap-4 rounded-2xl border border-[#eeebe7] bg-white p-5 text-start shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition duration-200 hover:-translate-y-0.5 hover:border-[#ffd8cf] hover:shadow-[0_12px_32px_rgba(33,25,18,0.05)] focus-visible:ring-2 focus-visible:outline-none"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f7f5f2] text-[#8b8178]">
                    {category.icon ? (
                      <img
                        src={category.icon}
                        alt=""
                        className="h-7 w-7 object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <DefaultCategoryIcon />
                    )}
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-sm font-bold text-[#111]">
                      {category.name}
                    </strong>
                    {category.description && (
                      <small className="mt-1 block text-[11.5px] leading-snug text-[#626262]">
                        {category.description}
                      </small>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}

        <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          {popularArticles.length > 0 && (
            <div className="min-h-[260px] rounded-2xl border border-[#eeebe7] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
              <h2 className="mb-4 text-lg font-extrabold tracking-[-0.02em] text-[#1a1a1a]">
                {t("Popular questions")}
              </h2>
              <div className="space-y-0">
                {popularArticles.map((article) => (
                  <Link
                    key={article.id}
                    href={`/help-center/article/${encodeURIComponent(article.slug)}`}
                    className="group hover:text-primary flex w-full items-center justify-between gap-4 border-b border-[#f5f2ee] px-1.5 py-3 text-start text-[13.5px] font-medium text-[#3a3a3a] transition-all last:border-b-0 hover:ps-3"
                  >
                    <span dir="auto">{article.title}</span>
                    <ChevronRight className="group-hover:text-primary size-4 shrink-0 text-[#a09d9a] transition group-hover:translate-x-1" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          <HumanSupportPanel
            liveChatHref={liveChatHref}
            emailSupportHref={emailSupportHref}
          />
        </div>
      </ResponsiveContentFrame>
    </section>
  );
}
function QuickAction({
  label,
  href,
  icon: Icon,
}: {
  label: string;
  href: string;
  icon: typeof Compass;
}) {
  return (
    <Link
      href={href}
      className="group hover:border-primary hover:text-primary inline-flex items-center gap-1.5 rounded-full border border-transparent bg-[#f0ece6] px-4 py-2 text-[13px] font-semibold text-[#4a4a4a] transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
    >
      <Icon className="group-hover:text-primary size-3.5 text-[#626262] transition" />
      {label}
    </Link>
  );
}
function DefaultCategoryIcon() {
  return (
    <svg className="size-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.75 6.75c0-1.1.9-2 2-2h3.05c.54 0 1.06.22 1.44.61l1.01 1.03c.38.39.9.61 1.44.61h3.56c1.1 0 2 .9 2 2v8.25c0 1.1-.9 2-2 2H6.75c-1.1 0-2-.9-2-2V6.75Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8 12h8M8 15h5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
function HumanSupportPanel({
  liveChatHref,
  emailSupportHref,
}: {
  liveChatHref: string;
  emailSupportHref: string;
}) {
  const t = useUiTranslations();
  return (
    <div className="flex min-h-[260px] flex-col justify-between rounded-2xl border border-[#ffdcd4] bg-[linear-gradient(135deg,#fffcfb_0%,#fff3ed_100%)] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
      <div>
        <h2 className="mb-4 text-lg font-extrabold tracking-[-0.02em] text-[#1a1a1a]">
          {t("Human support")}
        </h2>
        <h3 className="mb-1.5 text-[22px] font-extrabold tracking-[-0.02em] text-[#1a1a1a]">
          {t("Still need help?")}
        </h3>
        <p className="max-w-[360px] text-[13px] leading-snug font-medium text-[#8e584c]">
          {t(
            "Our dedicated forwarding advisors are online to assist with order tracking, customs, returns and weight updates",
          )}
        </p>
        <div className="my-4 flex items-center gap-3">
          <div className="flex">
            {["L", "S", "A"].map((item, index) => (
              <span
                key={item}
                className="text-primary grid size-7 place-items-center rounded-full border-2 border-[#fffcfb] text-[10px] font-bold first:ms-0"
                style={{
                  marginInlineStart: index === 0 ? 0 : -8,
                  zIndex: 3 - index,
                  backgroundColor:
                    index === 0
                      ? "#ffdcd4"
                      : index === 1
                        ? "#ffe8e2"
                        : "#e3f5f4",
                  color: index === 2 ? "#16716e" : undefined,
                }}
              >
                {item}
              </span>
            ))}
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#ffdcd4]/50 bg-white/70 px-3 py-1.5 text-[11px] font-bold text-[#8c4c3e]">
            <span className="relative size-[7px] rounded-full bg-[#2ec4b6] before:absolute before:inset-0 before:animate-ping before:rounded-full before:bg-[#2ec4b6]" />
            {t("Advisors online (Avg response < 12h)")}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3 md:flex-row">
        <SupportLink
          href={liveChatHref}
          primary
          icon={MessageSquare}
          label={t("Live chat")}
        />
        <SupportLink
          href={emailSupportHref}
          icon={Mail}
          label={t("Email support")}
        />
      </div>
    </div>
  );
}
function SupportLink({
  href,
  label,
  icon: Icon,
  primary = false,
}: {
  href: string;
  label: string;
  icon: typeof Mail;
  primary?: boolean;
}) {
  const className = primary
    ? "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-primary px-4 py-3 text-[13.5px] font-bold text-white transition hover:-translate-y-px hover:bg-primary/90"
    : "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border border-[#ffd8cf] bg-white px-4 py-3 text-[13.5px] font-bold text-[#6d3326] transition hover:-translate-y-px hover:bg-[#fff5f2] hover:text-primary";
  if (!href) {
    return (
      <button type="button" className={className}>
        <Icon className="size-4" />
        {label}
      </button>
    );
  }
  return (
    <a className={className} href={href}>
      <Icon className="size-4" />
      {label}
    </a>
  );
}
