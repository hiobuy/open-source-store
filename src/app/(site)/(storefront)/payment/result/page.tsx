import { RouteLoading } from "@/components/route-loading";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import PageClient from "./page-client";
interface Props {
  searchParams: Promise<{ status?: string | string[] }>;
}
export async function generateMetadata({ searchParams }: Props) {
  const [{ status }, t] = await Promise.all([searchParams, getTranslations()]);
  return {
    title: t(status === "failed" ? "Payment failed" : "Payment successful"),
  };
}
export default function Page() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <>
        <main className="min-w-0 flex-1">
          <section className="m-[0px] rounded-[0px] p-[12px_0px] lg:p-[24px_0px]">
            <PageClient />
          </section>
        </main>
      </>
    </Suspense>
  );
}
