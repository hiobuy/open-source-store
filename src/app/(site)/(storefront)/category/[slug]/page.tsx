import { RouteLoading } from "@/components/route-loading";
import { MarketplaceProductSearch } from "@/components/features/search/marketplace-product-search";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
interface Props {
  params: Promise<{ slug: string }>;
}
export async function generateMetadata({ params }: Props) {
  const [{ slug }, t] = await Promise.all([params, getTranslations()]);
  let name = slug;
  try {
    name = decodeURIComponent(slug);
  } catch {}
  return { title: name.trim() || t("Categories") };
}
export default function Page() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <>
        <style>{"body {\n  background-color: #fff;\n}"}</style>
        <main className="min-w-0 flex-1">
          <section className="m-[0px] rounded-[0px] p-[0px_0px_16px] lg:p-[0px_0px_24px]">
            <div className="site-container">
              <MarketplaceProductSearch />
            </div>
          </section>
        </main>
      </>
    </Suspense>
  );
}
