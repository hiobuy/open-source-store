import { getHelpArticle, getHelpCategory } from "@/lib/server/help-center";
import { ChevronRight, ChevronUp } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import type messages from "../../../../../../../messages/en.json";
const HEADING_RE = /<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/gi;
function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function getExistingHeadingId(attrs: string) {
  const match = attrs.match(/\sid=(["'])(.*?)\1/i);
  return match?.[2]?.trim() || "";
}
function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
function normalizeHeadingId(text: string, fallback: string) {
  const slug = text
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || fallback;
}
function createUniqueId(base: string, used: Map<string, number>) {
  const count = used.get(base) || 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}
function prepareArticleContent(content: string) {
  const headings: Array<{ id: string; text: string }> = [];
  const used = new Map<string, number>();
  let headingIndex = 0;
  const html = content.replace(
    HEADING_RE,
    (match, level: string, attrs: string, innerHtml: string) => {
      const text = stripHtml(innerHtml);
      if (!text) return match;
      headingIndex += 1;
      const existingId = getExistingHeadingId(attrs);
      const id =
        existingId ||
        createUniqueId(
          normalizeHeadingId(text, `heading-${headingIndex}`),
          used,
        );
      if (existingId) used.set(existingId, (used.get(existingId) || 0) + 1);
      if (Number(level) === 2) headings.push({ id, text });
      return existingId
        ? match
        : `<h${level}${attrs} id="${escapeAttr(id)}">${innerHtml}</h${level}>`;
    },
  );
  return { html, headings };
}

interface Props {
  params: Promise<{ slug: string }>;
}
function load(slug: string) {
  const article = getHelpArticle(slug);
  if (!article) notFound();
  return article;
}
export async function generateMetadata({ params }: Props) {
  const data = await load((await params).slug);
  return { title: data.title };
}
export default async function Page({ params }: Props) {
  const data = await load((await params).slug);
  const article = data;
  const category = getHelpCategory(String(data.category_id));
  const t = await getTranslations();
  const { html, headings } = prepareArticleContent(article.content || "");
  const hasToc = headings.length > 0;
  const categoryKey = category?.name.replaceAll(
    ".",
    "",
  ) as keyof typeof messages;
  const categoryName =
    category && t.has(categoryKey) ? t.raw(categoryKey) : category?.name;
  return (
    <>
      <main className="min-w-0 flex-1">
        <section className="m-[0px] rounded-[0px] p-[12px_0px] lg:p-[24px_0px]">
          <div className="site-container">
            <>
              <div
                className={
                  hasToc
                    ? "grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_260px] lg:grid-cols-[minmax(0,1fr)_300px]"
                    : ""
                }
              >
                <article className="min-w-0 rounded-xl bg-white p-5 md:rounded-2xl md:p-8">
                  <nav className="mb-6 hidden items-center gap-1.5 text-sm font-semibold text-[#8c817a] md:flex">
                    <Link
                      className="hover:text-primary transition"
                      href="/help-center"
                    >
                      {t("Help Center")}
                    </Link>
                    {category && (
                      <>
                        <ChevronRight className="size-4 shrink-0" />
                        <Link
                          className="hover:text-primary shrink-0 transition"
                          href={`/help-center/search?category_id=${category.id}`}
                        >
                          {categoryName}
                        </Link>
                      </>
                    )}
                    {article.title && (
                      <>
                        <ChevronRight className="size-4 shrink-0" />
                        <span className="line-clamp-1 min-w-0 text-[#1a1a1a]">
                          {article.title}
                        </span>
                      </>
                    )}
                  </nav>
                  {article.title && (
                    <h1
                      dir="auto"
                      className="mb-6 text-[24px] leading-tight font-extrabold tracking-[-0.03em] text-[#333] md:mb-10 md:text-[40px]"
                    >
                      {article.title}
                    </h1>
                  )}
                  <div
                    dir="auto"
                    className="article-rich-text prose prose-gray help-center-article-rich-text max-w-none"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                </article>
                {hasToc && (
                  <aside className="hidden md:sticky md:top-24 md:block">
                    <details
                      open
                      className="group overflow-hidden rounded-[2px] border border-[#AEB6C2] bg-white text-[#6f6f6f]"
                    >
                      <summary className="flex w-full cursor-pointer list-none items-center justify-between border-b border-[#AEB6C2] px-5 py-4 text-start text-base font-bold text-[#555] [&::-webkit-details-marker]:hidden">
                        {t("Table of Contents")}
                        <ChevronUp className="size-4 rotate-180 transition group-open:rotate-0" />
                      </summary>
                      <nav className="space-y-2 px-5 py-4">
                        {headings.map((heading) => (
                          <a
                            key={heading.id}
                            href={`#${encodeURIComponent(heading.id)}`}
                            className="hover:text-primary flex w-full items-start gap-2 text-start text-xs leading-5 text-[#777] transition"
                          >
                            <span className="mt-[0.55em] size-1 shrink-0 rounded-full bg-current" />
                            <span className="line-clamp-1">{heading.text}</span>
                          </a>
                        ))}
                      </nav>
                    </details>
                  </aside>
                )}
              </div>
              <style
                dangerouslySetInnerHTML={{
                  __html: `
            @media (prefers-reduced-motion: no-preference) {
              html:has(.help-center-article-rich-text) { scroll-behavior: smooth; }
            }
            .help-center-article-rich-text { line-height: 1.7; color: #333; }
            .help-center-article-rich-text h1,
            .help-center-article-rich-text h2,
            .help-center-article-rich-text h3,
            .help-center-article-rich-text h4,
            .help-center-article-rich-text h5,
            .help-center-article-rich-text h6 { scroll-margin-top: 96px; color: #333; font-weight: 700; }
            .help-center-article-rich-text h2 { font-size: 1.5rem; margin: 2rem 0 0.75rem; }
            .help-center-article-rich-text h3 { font-size: 1.25rem; margin: 1.5rem 0 0.5rem; }
            .help-center-article-rich-text h4 { font-size: 1.125rem; margin: 1.25rem 0 0.5rem; }
            .help-center-article-rich-text p { margin: 0.75rem 0; }
            .help-center-article-rich-text ul,
            .help-center-article-rich-text ol { margin: 0.75rem 0; padding-inline-start: 1.5rem; }
            .help-center-article-rich-text li { margin: 0.35rem 0; }
            .help-center-article-rich-text a { color: var(--primary); text-decoration: underline; }
          `,
                }}
              />
            </>
          </div>
        </section>
      </main>
    </>
  );
}
