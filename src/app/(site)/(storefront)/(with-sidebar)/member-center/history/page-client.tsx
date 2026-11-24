"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import dayjs from "dayjs";
import { MemberEmptyState } from "@/components/features/account/member-empty-state";
import { ProcurementSavedProductSkeletonGrid } from "@/components/features/catalog/procurement-saved-product";
import { LogisticsLoadState } from "@/components/features/logistics/procurement-logistics";
import { LocalizedLink } from "@/components/localized-link";
import { Button } from "@/components/ui/button";
import { useProcurementResource } from "@/hooks/use-procurement-resource";
import { LOCALE_CONFIG, parseLocale } from "@/lib/locale";
import { procurementChannel } from "@/lib/procurement/catalog";
import { getProcurementBrowsingHistory } from "@/lib/procurement/client";
import { localizedText } from "@/lib/procurement/localized-text";
import { purchaseProductHref } from "@/lib/procurement/purchase";
import type { ProcurementBrowsingRecord } from "@/lib/procurement/types";

async function loadHistory() {
  const first = await getProcurementBrowsingHistory({ page: 1, pageSize: 50 });
  const items = [...first.items];
  for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page++) {
    const next = await getProcurementBrowsingHistory({
      page,
      pageSize: first.pageSize,
    });
    items.push(...next.items);
  }
  return items;
}

export default function BrowsingHistoryPage() {
  const t = useTranslations();
  const { htmlLang } = LOCALE_CONFIG[parseLocale(useLocale())];
  const result = useProcurementResource(loadHistory, true);
  const days = new Map<string, ProcurementBrowsingRecord[]>();
  for (const item of result.data ?? []) {
    const date = dayjs(item.lastViewedAt).format("YYYY-MM-DD");
    const group = days.get(date);
    if (group) group.push(item);
    else days.set(date, [item]);
  }

  return (
    <div className="my-2 min-h-[calc(100vh-120px)] overflow-x-hidden rounded-lg bg-white md:my-4 md:min-h-[calc(100vh-200px)] md:rounded-xl">
      <div className="p-4 md:p-5">
        {result.loading ? (
          <ProcurementSavedProductSkeletonGrid withTimestamp />
        ) : result.error ? (
          <LogisticsLoadState {...result} />
        ) : days.size === 0 ? (
          <MemberEmptyState variant="history" label={t("No browsing history")}>
            <Button asChild size="sm" className="md:h-10">
              <LocalizedLink href="/">{t("Keep shopping")}</LocalizedLink>
            </Button>
          </MemberEmptyState>
        ) : (
          Array.from(days, ([date, items], index) => (
            <section key={date} className="pt-1 md:pt-2">
              <h2 className="mb-2 text-sm font-bold text-[#1a1a1a] md:mb-3">
                {date}
              </h2>
              <div className="grid grid-cols-4 gap-2 md:grid-cols-5 md:gap-3">
                {items.map((item) => {
                  const channel = procurementChannel(item.channel);
                  const image = item.product.images[0];
                  const titles = item.product.title;
                  const title =
                    localizedText(titles, htmlLang) ||
                    item.productId;
                  const thumbnail = (
                    <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-[#f5f5f5] md:aspect-auto md:h-[200px] md:rounded-xl">
                      {image && (
                        <Image
                          src={image}
                          alt={title}
                          fill
                          unoptimized
                          className="object-cover"
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </div>
                  );
                  return channel ? (
                    <LocalizedLink
                      key={item.id}
                      href={purchaseProductHref(channel, item.productId, title)}
                      className="min-w-0"
                    >
                      {thumbnail}
                    </LocalizedLink>
                  ) : (
                    <div key={item.id} className="min-w-0">
                      {thumbnail}
                    </div>
                  );
                })}
              </div>
              {index < days.size - 1 && <div className="mt-6 h-4 md:mt-8" />}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
