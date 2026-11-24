import { useI18n as useAdminI18n } from "../lib/i18n";
import { ShippingCalculator } from "../shared/ShippingCalculator";
import { AdminHeader } from "./shared";

export function AdminCalculator() {
  const { t: tr } = useAdminI18n();
  return (
    <div>
      <AdminHeader title={tr("Calculator")} meta="Customer quote, HioBuy cost, and estimated gross profit." />
      <ShippingCalculator mode="admin" />
    </div>
  );
}
