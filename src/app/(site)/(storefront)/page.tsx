import { RouteLoading } from "@/components/route-loading";
import HomePageClient from "./page-client";
import { default as Service1 } from "@/assets/home/s1.svg";
import { default as Service2 } from "@/assets/home/s2.svg";
import { default as Service3 } from "@/assets/home/s3.svg";
import { default as Service4 } from "@/assets/home/s4.svg";
import { default as Service5 } from "@/assets/home/s5.svg";
import { default as Service6 } from "@/assets/home/s6.svg";

import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
const services = [
  {
    Icon: Service1,
    title: "Professional Purchasing",
    description:
      "One-stop shopping on 1688,Taobao, WeChat Store; DIYorders supported",
  },
  {
    Icon: Service2,
    title: "Forwarding Service",
    description:
      "Send items to HIOBUY warehouse; items can be combined and safely shipped",
  },
  {
    Icon: Service3,
    title: "Full After-Sales",
    description:
      "Track order storage,inspection, and shippingorogress in real time",
  },
  {
    Icon: Service4,
    title: "Storage Service",
    description:
      "Up to 120 days storage, first90 days free; orders can be shipped together",
  },
  {
    Icon: Service5,
    title: "Free QC & Inspection",
    description: "Check item quality upon arrivaland provide inspection photos",
  },
  {
    Icon: Service6,
    title: "Packing & Reinforcement",
    description:
      "Cost-effective packagingbased on item size;professional handling forsafety",
  },
] as const;
export default async function Page() {
  const t = await getTranslations();
  return (
    <Suspense fallback={<RouteLoading />}>
      <>
        <main className="min-w-0 flex-1">
          <HomePageClient
            services={
              <section className="bg-card m-[8px_0px_30px] rounded-[8px] p-[8px] lg:m-[16px_0px_30px] lg:rounded-[16px]">
                <section>
                  <h2 className="mb-6 text-center text-base font-semibold lg:text-xl">
                    {t("Our Service")}
                  </h2>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
                    {services.map(({ Icon, title, description }) => (
                      <article
                        key={title}
                        className="flex h-full flex-col items-center text-center"
                      >
                        <Icon
                          className="text-primary size-8 shrink-0 lg:size-10"
                          aria-hidden="true"
                        />
                        <h3 className="mt-2 text-xs font-semibold text-gray-900 lg:text-sm">
                          {t(title)}
                        </h3>
                        <p className="mt-2 text-[10px] leading-relaxed text-gray-500 lg:text-xs">
                          {t(description)}
                        </p>
                      </article>
                    ))}
                  </div>
                </section>
              </section>
            }
            promotions={[
              {
                image:
                  "https://api-dev.hiobuy.net/uploads/c321a72a-dcb3-446a-a327-0f307dcf96e3/1782187054611-i78ig9.png",
                alt: t.raw("New user guide"),
                link: "/help-center/article/beginners-guide-how-to-buy-products-from-china-with-our-website",
              },
              {
                image:
                  "https://api.hiobuy.net/uploads/be8da146-b57e-41f2-83d0-60b5b664010e/1782805496564-2yzfvb.png",
                alt: t.raw("Jion"),
              },
              {
                image:
                  "https://api-dev.hiobuy.net/uploads/c321a72a-dcb3-446a-a327-0f307dcf96e3/1782187116504-0j9732.png",
                alt: t.raw("global"),
              },
              {
                image: "/assets/images/home/freight-estimation.png",
                alt: t.raw("Freight Estimation"),
                link: "/freight-estimation",
              },
            ]}
          />
        </main>
        <MobileNavigation />
      </>
    </Suspense>
  );
}
