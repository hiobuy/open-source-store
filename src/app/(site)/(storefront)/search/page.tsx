import { RouteLoading } from "@/components/route-loading";
import { MarketplaceProductSearch } from "@/components/features/search/marketplace-product-search";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("Product search") };
}
export default function Page() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <>
        <style>{"body {\n  background-color: #fff;\n}"}</style>
        <main className="min-w-0 flex-1">
          <section className="m-[0px] rounded-[0px] p-[0px_0px_30px]">
            <div className="site-container">
              <MarketplaceProductSearch />
            </div>
          </section>
        </main>
      </>
    </Suspense>
  );
}
