import { ProcurementNotifications } from "@/components/features/logistics/procurement-notifications";
import { Section } from "@/components/layout/section";

export default function PageClient() {
  return (
    <Section>
      <div className="py-4">
        <ProcurementNotifications />
      </div>
    </Section>
  );
}
