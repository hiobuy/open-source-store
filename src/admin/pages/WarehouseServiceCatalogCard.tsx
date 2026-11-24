import { useQuery } from "@tanstack/react-query";
import { Card, LoadingBlock } from "../components/ui";
import type { WarehouseServiceCatalog, WarehouseStage } from "../../domain/warehouse-service-catalog";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useDemoPreview } from "./shared";

export function WarehouseServiceCatalogCard({ stage }: { stage: WarehouseStage }) {
  const { t, locale } = useI18n();
  const demo = useDemoPreview();
  const language = locale === "zh-Hans" ? "zh-CN" : locale === "zh-Hant" ? "zh-TW" : "en";
  const resource = stage === "INBOUND" ? "packages" : "shipments";
  const catalog = useQuery({
    queryKey: ["admin", "warehouse-services", stage, language],
    queryFn: () => api<WarehouseServiceCatalog>(`/api/admin/${resource}/services/catalog?language=${language}`),
    enabled: !demo,
    staleTime: 60_000,
    retry: false,
  });
  if (demo) return null;
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: "CNY" });
  return <Card>
    <h3 className="mb-3 text-sm font-semibold">{t(stage === "INBOUND" ? "Package service catalog" : "Shipment service catalog")}</h3>
    {catalog.isPending ? <LoadingBlock rows={2} /> : catalog.isError ? <p role="status">{t("Warehouse services are temporarily unavailable")}</p> : <>
      {catalog.data.items.length ? <ul className="divide-y divide-slate-100">
        {catalog.data.items.map(item => <li className="flex justify-between gap-4 py-2 text-sm" key={item.code}>
          <div><p>{item.name}</p>{item.description && <p className="text-xs text-slate-500">{item.description}</p>}</div>
          <span className="whitespace-nowrap tabular-nums">{money.format(item.price)}</span>
        </li>)}
      </ul> : <p className="text-sm text-slate-500">{t("No active warehouse services")}</p>}
      {!catalog.data.requestListAvailable && <p role="status" className="mt-3 text-sm text-amber-700">{t("Warehouse services are temporarily unavailable")}</p>}
    </>}
  </Card>;
}
