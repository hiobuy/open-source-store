"use client";

import { Section } from "@/components/layout/section";
import { Skeleton } from "@/components/ui/skeleton";
import { useRemoteResource } from "@/hooks/use-remote-resource";
import { getShippingChannel } from "@/lib/procurement/client";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function CenteredState({ message }: { message: string }) {
  return (
    <Section className="px-0">
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-gray-500">{message}</div>
        </div>
      </div>
    </Section>
  );
}

function EstimationDetailsSkeleton({ label }: { label: string }) {
  return (
    <Section className="px-0">
      <div role="status" className="min-h-screen px-4 pt-3 md:px-0 md:pt-4">
        <span className="sr-only">{label}</span>
        <div aria-hidden="true" className="space-y-4">
          <div className="rounded-[12px] bg-white p-4">
            <Skeleton className="h-7 w-40" />
            <div className="mt-2 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
          {["w-24", "w-3/4", "w-1/2"].map((width) => (
            <div key={width} className="space-y-2 rounded-[12px] bg-white p-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className={`h-6 ${width}`} />
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[12px] bg-white p-4">
      <div className="mb-2 text-sm font-bold text-[#333333]">{title}</div>
      {children}
    </div>
  );
}

export default function PageClient() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const code = (searchParams.get("code") || "").trim();
  const country = (searchParams.get("country") || "").trim();
  const resourceKey =
    code && country.length === 2 ? `${code}:${country}` : null;
  const loadChannel = useCallback(
    () => getShippingChannel(code, country),
    [code, country],
  );
  const resource = useRemoteResource(resourceKey, loadChannel);
  const channel = resource.data ?? null;

  useEffect(() => {
    if (resource.error)
      toast.error(t("Failed to fetch freight details, please try again"));
  }, [resource.error, t("Failed to fetch freight details, please try again")]);

  if (!resourceKey)
    return <CenteredState message={t("Please select a shipping channel")} />;
  if (resource.loading)
    return <EstimationDetailsSkeleton label={t("Loading…")} />;
  if (!channel) return <CenteredState message={t("No data")} />;

  const delivery = channel.delivery.filter((item) => item.trim());
  const regions = channel.regions.filter(
    (region) => region.name.trim() || hasText(region.eta),
  );
  const restrictions = channel.restrictions.filter((item) => item.trim());
  const services = channel.services.filter(
    (service) =>
      service.name.trim() ||
      hasText(service.description) ||
      hasText(service.price),
  );

  return (
    <Section className="px-0">
      <div className="min-h-screen px-4 pt-3 md:px-0 md:pt-4">
        <div className="space-y-4">
          <div className="rounded-[12px] bg-white p-4">
            <h1 className="text-xl font-bold text-[#333333]">{channel.name}</h1>
            {hasText(channel.description) ? (
              <p className="mt-2 text-sm leading-6 whitespace-pre-line text-[#666666]">
                {channel.description}
              </p>
            ) : null}
          </div>

          {hasText(channel.range) ? (
            <InfoCard title={t("Weight Range (KG)")}>
              <p className="text-sm leading-6 whitespace-pre-line text-[#666666]">
                {channel.range}
              </p>
            </InfoCard>
          ) : null}

          {hasText(channel.volumetric) ? (
            <InfoCard title={t("Volume-based Billing")}>
              <p className="text-sm leading-6 whitespace-pre-line text-[#666666]">
                {channel.volumetric}
              </p>
            </InfoCard>
          ) : null}

          {delivery.length > 0 ? (
            <InfoCard title={t("Delivery")}>
              <ul className="space-y-1 text-sm leading-6 text-[#666666]">
                {delivery.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </InfoCard>
          ) : null}

          {regions.length > 0 ? (
            <InfoCard title={t("Delivery Area")}>
              <div className="space-y-3">
                {regions.map((region, index) => (
                  <div
                    key={`${region.name}-${index}`}
                    className="flex flex-wrap items-start justify-between gap-2 text-sm leading-6"
                  >
                    <span className="font-medium text-[#333333]">
                      {region.name}
                    </span>
                    {hasText(region.eta) ? (
                      <span className="text-[#666666]">
                        {t("Delivery Time")}: {region.eta}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </InfoCard>
          ) : null}

          {restrictions.length > 0 ? (
            <InfoCard title={t("Channel Restriction Rules")}>
              <ol className="list-decimal space-y-1 ps-5 text-sm leading-6 text-[#666666]">
                {restrictions.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ol>
            </InfoCard>
          ) : null}

          {services.length > 0 ? (
            <InfoCard title={t("Channel Value-Added Services")}>
              <div className="space-y-4">
                {services.map((service, index) => (
                  <div
                    key={`${service.name}-${index}`}
                    className="text-sm leading-6 text-[#666666]"
                  >
                    <div className="font-medium text-[#333333]">
                      {index + 1}. {service.name}
                      {hasText(service.mode) ? (
                        <span className="ms-2 text-xs font-normal text-[#999999]">
                          {service.mode}
                        </span>
                      ) : null}
                    </div>
                    {hasText(service.description) ? (
                      <p className="mt-1 whitespace-pre-line">
                        {service.description}
                      </p>
                    ) : null}
                    {hasText(service.price) ? (
                      <p className="mt-1">
                        <span className="text-[#999999]">{t("Price")}: </span>
                        <bdi dir="ltr">{service.price}</bdi>
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </InfoCard>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
