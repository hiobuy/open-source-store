import { AdminAnnouncements } from "./pages/AdminAnnouncements";
import { Navigate, Outlet, Route, Routes } from "react-router";
import { Package, ShoppingBag, Truck } from "lucide-react";
import { brandHomeHref } from "../domain/site";
import { BrandLockup, marketingAccent, useBrand, useSiteMode } from "./lib/brand";
import { LocaleSwitch, useI18n } from "./lib/i18n";
import { authClient } from "./lib/auth";
import { AdminCustomerAddresses } from "./pages/AdminCustomerAddresses";
import { LoginPage } from "./auth/AuthPages";
import { InvitePage } from "./auth/InvitePage";
import { Ms } from "./components/icon";
import { AdminAssistant } from "./pages/AdminAssistant";
import { AdminCalculator } from "./pages/AdminCalculator";
import { AdminPayments } from "./pages/AdminPayments";
import { AdminOverview } from "./pages/AdminOverview";
import { AdminPackageDetail } from "./pages/AdminPackageDetail";
import { AdminPackages } from "./pages/AdminPackages";
import { RequireAdmin, RequireDemo } from "./pages/AdminShell";
import { AdminShipmentDetail } from "./pages/AdminShipmentDetail";
import { AdminShipments } from "./pages/AdminShipments";
import { AdminSettings } from "./pages/AdminSettings";
import { AdminGuide } from "./pages/AdminGuide";
import { AdminUsers } from "./pages/AdminUsers";
import { AdminProcurement } from "./pages/AdminProcurement";
import { AdminMarketing } from "./pages/AdminMarketing";

function FullScreenStatus({ label }: { label: string }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-screen place-items-center text-sm text-slate-500" role="status">
      {t(label)}
    </div>
  );
}

function GuestOnly() {
  const { data, isPending } = authClient.useSession();
  if (isPending) return <FullScreenStatus label="Loading…" />;
  if (data) return <Navigate to="/admin" replace />;
  return <AuthOutlet />;
}

function AuthOutlet() {
  const { t } = useI18n();
  const brand = useBrand();
  const site = useSiteMode();
  const { data } = authClient.useSession();
  const home = site.ready ? brandHomeHref({ mode: site.mode, publicUrl: brand.website.publicUrl, signedIn: Boolean(data) }) : brand.website.publicUrl || undefined;
  const help = brand.supportEmail ? `mailto:${brand.supportEmail}` : brand.website.supportUrl || "";
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-800 lg:flex-row" style={marketingAccent(brand)}>
      <aside aria-labelledby="admin-login-workspace" className="auth-grid relative flex shrink-0 flex-col overflow-hidden px-6 py-5 text-white sm:px-12 lg:min-h-dvh lg:flex-1 lg:justify-between lg:p-12 xl:p-16">
        <div aria-hidden="true" className="pointer-events-none absolute -top-32 -left-32 size-96 rounded-full bg-teal-500/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute right-0 -bottom-32 h-[480px] w-[480px] rounded-full bg-teal-600/15 blur-[120px]" />
        <div className="relative z-10">
          <BrandLockup tone="light" href={home} />
        </div>
        <div className="relative z-10 mt-4 max-w-lg lg:my-12">
          <h2 id="admin-login-workspace" className="text-2xl leading-tight font-semibold tracking-tight text-white lg:text-5xl">
            {t("Store operations")}
          </h2>
          <p className="mt-4 hidden text-base leading-relaxed text-slate-300 lg:block">
            {t("Follow each customer order from purchase through warehouse receipt to international delivery.")}
          </p>
        </div>
        <ul className="relative z-10 hidden gap-5 border-t border-white/15 pt-6 lg:grid lg:grid-cols-3">
          {[
            { icon: ShoppingBag, title: "Shopping orders", detail: "Track purchases and supplier dispatch." },
            { icon: Package, title: "Warehouse packages", detail: "Review received items and warehouse photos." },
            { icon: Truck, title: "Logistics orders", detail: "Check freight payments and delivery progress." },
          ].map(({ icon: Icon, title, detail }) => (
            <li key={title}>
              <Icon size={21} strokeWidth={1.6} aria-hidden="true" className="mb-3 text-teal-300" />
              <p className="text-sm font-semibold">{t(title)}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{t(detail)}</p>
            </li>
          ))}
        </ul>
      </aside>
      <main className="flex flex-1 flex-col justify-between bg-white px-6 py-8 sm:px-12 lg:px-16">
        <div className="flex items-center justify-end gap-4 text-xs font-medium text-slate-500">
          <LocaleSwitch tone="muted" />
          {help ? (
            <a className="inline-flex items-center gap-1.5 hover:text-[#087b73]" href={help}>
              <Ms name="help" className="text-[16px] text-slate-400" />
              {t("Need help?")}
            </a>
          ) : null}
        </div>
        <div className="mx-auto my-auto w-full max-w-md py-8">
          <Outlet />
        </div>
        <p className="sr-only">{brand.name}</p>
      </main>
    </div>
  );
}

function adminPages() {
  return [
    <Route key="procurement" path="procurement" element={<AdminProcurement />} />,
    <Route key="announcements" path="announcements" element={<AdminAnnouncements />} />,
    <Route key="marketing" path="marketing" element={<AdminMarketing />} />,
    <Route key="index" index element={<AdminOverview />} />,
    <Route key="settings" path="settings" element={<AdminSettings />} />,
    <Route key="guide" path="guide" element={<AdminGuide />} />,
    <Route key="guide-rest" path="guide/*" element={<AdminGuide />} />,
    <Route key="payments" path="payments" element={<AdminPayments />} />,
    <Route key="freight" path="freight" element={<AdminFreightRedirect />} />,
    <Route key="packages" path="packages" element={<AdminPackages />} />,
    <Route key="package" path="packages/:id" element={<AdminPackageDetail />} />,
    <Route key="shipments" path="shipments" element={<AdminShipments />} />,
    <Route key="shipment" path="shipments/:id" element={<AdminShipmentDetail />} />,
    <Route key="users" path="users" element={<AdminUsers />} />,
    <Route key="assistant" path="assistant" element={<AdminAssistant />} />,
    <Route key="calculator" path="calculator" element={<AdminCalculator />} />,
  ];
}

function AdminFreightRedirect() {
  const demo = window.location.pathname.startsWith("/admin/demo");
  return <Navigate to={demo ? "/admin/demo/settings" : "/admin/settings"} replace />;
}


export function App() {
  return (
    <Routes>
      <Route path="/admin/invite" element={<InvitePage />} />
      <Route element={<GuestOnly />}>
        <Route path="/admin/login" element={<LoginPage />} />
      </Route>
      <Route path="/admin" element={<RequireAdmin />}>
        <Route path="customer-addresses" element={<AdminCustomerAddresses />} />
        {adminPages()}
      </Route>
      <Route path="/admin/demo" element={<RequireDemo />}>
        {adminPages()}
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
