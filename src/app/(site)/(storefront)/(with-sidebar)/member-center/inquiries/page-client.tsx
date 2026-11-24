import { ProcurementNotifications } from "@/components/features/logistics/procurement-notifications";
import { Section } from "@/components/layout/section";

export default function PageClient() {
  return (
    <Section className="px-0">
      <div className="mt-4 rounded-lg bg-gray-100 md:bg-white md:p-4">
        <ProcurementNotifications />
      </div>
    </Section>
  );
}
