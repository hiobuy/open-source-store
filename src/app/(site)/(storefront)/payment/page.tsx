import { RouteLoading } from "@/components/route-loading";
import { DaigouOrderSteps } from "@/components/features/checkout/order-steps";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import PageClient from "./page-client";
export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("Pay for order") };
}
export default function Page() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <>
        <style>{"body {\n  background-color: #fff;\n}"}</style>
        <main className="min-w-0 flex-1">
          <section className="m-[0px] rounded-[0px] p-[10px_0px_0px] lg:p-[24px_0px_0px]">
            <div className="site-container">
              <DaigouOrderSteps activeStep={3} />
              <PageClient />
            </div>
          </section>
        </main>
      </>
    </Suspense>
  );
}
