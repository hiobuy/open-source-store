import { SiteFooterGate } from "@/components/layout/site-footer-gate";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { CustomerService } from "@/components/layout/customer-service";
export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooterGate>
        <SiteFooter />
      </SiteFooterGate>
      <CustomerService />
    </>
  );
}
