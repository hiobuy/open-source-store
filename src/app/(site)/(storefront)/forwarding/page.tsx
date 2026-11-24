import { RouteLoading } from "@/components/route-loading";
import { getTranslations } from "next-intl/server";
import { Fragment, Suspense } from "react";
import PageClient from "./page-client";
export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("Forwarding") };
}
export default async function Page() {
  const t = await getTranslations();
  const steps = [
    "Confirm Order",
    "Submit Parcel",
    "Pay International Shipping",
    "Wait for Delivery",
  ] as const;
  return (
    <Suspense fallback={<RouteLoading />}>
      <>
        <style>{"body {\n  background-color: #fff\n}"}</style>
        <main className="min-w-0 flex-1">
          <section className="m-[0px] rounded-[0px] p-[16px_0px] lg:p-[24px_0px]">
            <div className="site-container">
              <div className="space-y-4">
                <div className="process-steps flex rounded-xl bg-[#F5F5F5] p-2 md:p-4">
                  <div className="flex w-full flex-col gap-1 md:gap-2">
                    <div className="flex w-full items-start">
                      {steps.map((step, index) => (
                        <Fragment key={step}>
                          <div className="flex min-w-0 flex-1 justify-center">
                            <span
                              className={`text-[10px] font-medium md:text-sm ${index === 0 ? "text-primary" : "text-[#A2A2A2]"}`}
                            >
                              {String(index + 1).padStart(2, "0")}
                            </span>
                          </div>
                          {index < steps.length - 1 && (
                            <span
                              className="mx-0.5 h-0 w-3 shrink-0 md:mx-0 md:w-[30px]"
                              aria-hidden
                            />
                          )}
                        </Fragment>
                      ))}
                    </div>
                    <div className="flex w-full items-center">
                      {steps.map((step, index) => (
                        <Fragment key={step}>
                          <div className="flex min-w-0 flex-1 justify-center">
                            <div
                              className={`flex h-9 w-9 items-center justify-center rounded-lg md:h-14 md:w-14 md:rounded-xl ${index === 0 ? "bg-primary/30" : "bg-[#DFDFDF]"}`}
                            >
                              <span
                                className={`inline-block h-5 w-5 shrink-0 md:h-8 md:w-8 ${index === 0 ? "bg-primary" : "bg-[#A2A2A2]"}`}
                                style={{
                                  maskImage: `url(/assets/images/forwarding/step${index + 1}.svg)`,
                                  maskRepeat: "no-repeat",
                                  maskPosition: "center",
                                  maskSize: "contain",
                                  WebkitMaskImage: `url(/assets/images/forwarding/step${index + 1}.svg)`,
                                  WebkitMaskRepeat: "no-repeat",
                                  WebkitMaskPosition: "center",
                                  WebkitMaskSize: "contain",
                                }}
                                aria-hidden
                              />
                            </div>
                          </div>
                          {index < steps.length - 1 && (
                            <span
                              className={`mx-0.5 h-3 w-3 shrink-0 md:mx-0 md:h-[30px] md:w-[30px] ${index === 0 ? "bg-primary/30" : "bg-[#DFDFDF]"}`}
                              style={{
                                clipPath: "polygon(0 0, 100% 50%, 0 100%)",
                              }}
                              aria-hidden
                            />
                          )}
                        </Fragment>
                      ))}
                    </div>
                    <div className="flex w-full items-start">
                      {steps.map((step, index) => (
                        <Fragment key={step}>
                          <span
                            className={`min-w-0 flex-1 px-0.5 text-center text-[9px] leading-tight font-bold md:px-1 md:text-[14px] ${index === 0 ? "text-primary" : "text-[#A2A2A2]"}`}
                          >
                            {t(step)}
                          </span>
                          {index < steps.length - 1 && (
                            <span
                              className="mx-0.5 h-0 w-3 shrink-0 md:mx-0 md:w-[30px]"
                              aria-hidden
                            />
                          )}
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <PageClient />
            </div>
          </section>
        </main>
      </>
    </Suspense>
  );
}
