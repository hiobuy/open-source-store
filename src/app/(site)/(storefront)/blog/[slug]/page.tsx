import { LOCALE_HTML_LANG, parseLocale } from "@/lib/locale";
import { getBlogPost } from "@/lib/server/blog";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
interface Props {
  params: Promise<{ slug: string }>;
}
function load(slug: string) {
  const post = getBlogPost(slug);
  if (!post) notFound();
  return post;
}
export async function generateMetadata({ params }: Props) {
  const data = await load((await params).slug);
  return { title: data.title };
}
export default async function Page({ params }: Props) {
  const post = load((await params).slug);
  const [locale, t] = await Promise.all([getLocale(), getTranslations()]);
  const publishedAt = post.published_at ? new Date(post.published_at) : null;
  const publishedDate =
    publishedAt && !Number.isNaN(publishedAt.getTime())
      ? publishedAt.toLocaleDateString(LOCALE_HTML_LANG[parseLocale(locale)], {
          timeZone: "UTC",
        })
      : null;

  return (
    <>
      <main className="min-w-0 flex-1">
        <section className="m-[0px] rounded-[0px] p-[12px_0px] lg:p-[24px_0px]">
          <article className="site-container flex min-h-[300px] flex-col items-start">
            <h1 className="w-full text-center text-[20px] font-bold text-gray-900">
              {post.title || t("Untitled")}
            </h1>
            {publishedDate && (
              <div className="px-4 md:px-0">
                <div className="mx-auto h-full w-full max-w-[1280px]">
                  <time
                    dateTime={post.published_at ?? undefined}
                    className="text-muted-foreground text-sm"
                  >
                    {publishedDate}
                  </time>
                </div>
              </div>
            )}
            <div className="px-4 md:px-0">
              <div className="mx-auto h-full w-full max-w-[1280px]">
                <div
                  dir="auto"
                  className="article-rich-text blog-article-rich-text prose prose-p:leading-relaxed prose-headings:leading-tight max-w-none leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: post.content || "" }}
                />
              </div>
            </div>
          </article>
        </section>
      </main>
    </>
  );
}
