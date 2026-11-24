import { OrderTrackingButton } from "./OrderTrackingButton";
import { Link } from "react-router";
import { Checkbox } from "../components/ui/checkbox";
import { shipmentViewStatus } from "../../domain/admin-shipment-view";
import { adminHref } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { cn } from "../lib/utils";
import type { ShipmentView } from "./shipment-types";
import { ShipmentAddress, ShipmentBadge, ShipmentCost, ShipmentFreight, ShipmentOwner, ShipmentPacking, ShipmentTimes } from "./ShipmentViewParts";

export function ShipmentList({ items, selected, onSelect, onOpen, canReadCosts, canPay }: {
  items: ShipmentView[]; selected: string[]; onSelect: (ids: string[]) => void;
  onOpen: (id: string) => void; canReadCosts: boolean; canPay: boolean;
}) {
  const { t } = useI18n();
  const columns = ["Logistics order", "Customer", "Destination address / route", "Packing information", "Customer freight", ...(canReadCosts ? ["Logistics cost"] : []), "Time records", "Actions"];
  const all = items.every(item => selected.includes(item.id));
  const selectAll = <Checkbox aria-label={t("Select shipments on this page")} checked={all || (selected.length > 0 && "indeterminate")} onCheckedChange={checked => onSelect(checked === true ? items.map(item => item.id) : [])} />;
  const mobileLabel = (label: string) => <p className="mb-2 text-xs font-medium text-slate-500 md:hidden">{t(label)}</p>;
  return <div className="admin-shipment-list max-w-full overflow-x-auto">
    <label className="flex items-center gap-2 border-b border-line bg-slate-50 px-4 py-2 text-xs text-slate-500 md:hidden">{selectAll}{t("Select shipments on this page")}</label>
    <table aria-label={t("Logistics orders")} className="block w-full text-left md:table md:min-w-[1180px] md:table-fixed">
      <colgroup className="hidden md:table-column-group">{["2.5rem", "12%", "10%", "17%", "13%", "9%", ...(canReadCosts ? ["12%"] : []), undefined, "6.5%"].map((width, i) => <col key={i} style={{ width }} />)}</colgroup>
      <thead className="hidden border-b border-line bg-slate-50/70 text-xs text-slate-500 md:table-header-group"><tr><th className="py-3 pl-4">{selectAll}</th>{columns.map(label => <th key={label} scope="col" className="px-2.5 py-3 font-medium">{t(label)}</th>)}</tr></thead>
      <tbody className="block divide-y divide-line md:table-row-group">{items.map(item => {
        const checked = selected.includes(item.id);
        return <tr key={item.id} className={cn("relative grid grid-cols-2 gap-4 p-4 text-sm md:table-row md:[&>td]:px-2.5 md:[&>td]:py-5 md:[&>td]:align-top", checked ? "bg-indigo-50/60" : "hover:bg-slate-50/40")}>
          <td className="absolute top-4 right-4 md:static md:pl-4!"><Checkbox aria-label={`${t("Select")} ${item.publicId}`} checked={checked} onCheckedChange={value => onSelect(value === true ? [...selected, item.id] : selected.filter(id => id !== item.id))} /></td>
          <td className="col-span-2 pr-8"><button type="button" className="break-all text-left font-semibold text-ink hover:text-indigo-600" onClick={() => onOpen(item.id)}>{item.publicId}</button><div className="mt-2"><ShipmentBadge status={item.viewStatus ?? shipmentViewStatus(item)} /></div>{item.syncFailed && <p className="mt-2 text-xs text-red-600">{t("Sync failed")}</p>}{item.trackingNumber && <p className="mt-2 break-all text-xs text-slate-500" title={t("International tracking number")}>{item.trackingNumber}</p>}</td>
          <td className="col-span-2"><ShipmentOwner item={item} /></td>
          <td className="col-span-2">{mobileLabel("Destination address / route")}<ShipmentAddress item={item} /></td>
          <td>{mobileLabel("Packing information")}<ShipmentPacking item={item} /></td>
          <td>{mobileLabel("Customer freight")}<ShipmentFreight item={item} /></td>
          {canReadCosts && <td>{mobileLabel("Logistics cost")}<ShipmentCost item={item} /></td>}
          <td>{mobileLabel("Time records")}<ShipmentTimes item={item} /></td>
          <td className="col-span-2"><div className="flex flex-wrap gap-2 text-sm md:flex-col md:items-start">{canPay && item.canPayHioBuy && <Link to={adminHref(`/admin/shipments/${item.id}?pay=1`)} className="font-medium text-amber-700 hover:underline">{t("Pay logistics cost")}</Link>}<button type="button" className="text-indigo-600 hover:underline" onClick={() => onOpen(item.id)}>{t("Details")}</button><OrderTrackingButton kind="international" id={item.id} number={item.publicId} /></div></td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
