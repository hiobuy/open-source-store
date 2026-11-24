import type { PackageItem } from "../../types/api";
import { useI18n } from "../lib/i18n";
import { DataRow } from "./ui";
import { ProductImage } from "./ProductImage";

export function PackageGoodsDetails({ item }: { item: PackageItem }) {
  const { t } = useI18n();
  return <>
    {!!item.goodsItems?.length && <ul className="mt-3 divide-y divide-slate-100">
      {item.goodsItems.map((goods, index) => <li key={index} className="flex gap-3 py-3">
        <ProductImage url={goods.imageUrl} name={goods.name} />
        <div className="min-w-0"><p className="break-words text-sm">{goods.name}</p><p className="mt-1 text-sm text-slate-500">{t("Quantity")}: {goods.quantity}</p></div>
      </li>)}
    </ul>}
    <dl className="mt-3 divide-y divide-slate-100">
      {!item.goodsItems?.length && <DataRow label={t("Name")} value={item.productName ?? "—"} />}
      <DataRow label={t("Quantity")} value={item.quantity ?? "—"} />
      <DataRow label={t("Declared value")} value={item.declaredValueFen == null ? "—" : `${item.declaredCurrency ?? "USD"} ${(item.declaredValueFen / 100).toFixed(2)}`} />
    </dl>
  </>;
}
