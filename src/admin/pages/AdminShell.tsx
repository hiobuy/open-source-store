import { useI18n as useAdminI18n } from "../lib/i18n";
import "./admin.css";
import { Tr, useI18n, LocaleSwitch } from "../lib/i18n";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ChevronRight, BookOpen, Boxes, Calculator, CreditCard, LayoutGrid, LogOut, MapPin, Menu, MessageSquare, Package, PanelLeft, PanelLeftClose, Settings, ShieldAlert, ShoppingBag, Megaphone, Users, Wallet, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { Button, Dialog } from "../components/ui";
import { formatCnyFen } from "../../domain/freight";
import { ApiError, adminHref, api, holdDemoScope } from "../lib/api";
import { useBrand } from "../lib/brand";
import { authClient } from "../lib/auth";
import { cn } from "../lib/utils";
import { allows, useAdminAccess, type AdminOverview } from "./shared";

const STORAGE_KEY = "hiobuy.admin.sidebar";
const iconProps = { size: 18, strokeWidth: 1.65, "aria-hidden": true as const };

const links: { to: string; label: string; icon: LucideIcon; end?: boolean; count?: (overview: AdminOverview) => number }[] = [
  { to: "/admin", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/admin/procurement", label: "Shopping orders", icon: ShoppingBag },
  { to: "/admin/packages", label: "Warehouse packages", icon: Package },
  { to: "/admin/shipments", label: "Logistics orders", icon: Boxes },
  { to: "/admin/users", label: "Customers", icon: Users },
  { to: "/admin/customer-addresses", label: "Customer addresses", icon: MapPin },
  { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { to: "/admin/marketing", label: "Marketing", icon: Megaphone },
  { to: "/admin/payments", label: "Payments", icon: CreditCard, count: (overview) => overview.queues.pendingTopups },
  { to: "/admin/assistant", label: "Assistant", icon: MessageSquare, count: (overview) => overview.queues.unansweredQuestions },
  { to: "/admin/calculator", label: "Calculator", icon: Calculator },
];

const settingsLink = { to: "/admin/settings", label: "Settings", icon: Settings };

function readCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

/** Signed-in admins only. Everyone else gets a clear explanation instead of a blank page. */
export function RequireAdmin() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const me = useAdminAccess(Boolean(session));
  if (isPending || (session && me.isLoading)) return <FullScreen> <Tr k="Loading…" /> </FullScreen>;
  if (!session) return <Navigate to="/admin/login" replace />;
  if (me.isLoading) return <FullScreen> <Tr k="Checking admin access…" /> </FullScreen>;
  if (me.error) {
    const forbidden = me.error instanceof ApiError && me.error.status === 403;
    return (
      <FullScreen>
        <div className="max-w-sm text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-amber-50 text-amber-600">
            <ShieldAlert size={22} aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-ink">{forbidden ? "No admin access" : "Couldn't open the admin area"}</h1>
          <p className="mt-1.5 text-[13px] leading-5 text-slate-500">{me.error.message}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="secondary" href="/"> <Tr k="Back to website" /> </Button>
            <Button
              variant="secondary"
              onClick={() => void authClient.signOut().finally(() => navigate("/admin/login", { replace: true }))}
            >
              <Tr k="Sign out" />
            </Button>
          </div>
        </div>
      </FullScreen>
    );
  }
  return <>
    <AdminShell email={session.user.email} />
    {me.data?.hiobuyApiKeyConfigured === false && (
      <MissingApiKeyDialog key={session.session.id} sessionId={session.session.id} canConfigure={allows(me.data, "secrets.write")} />
    )}
  </>;
}

function MissingApiKeyDialog({ sessionId, canConfigure }: { sessionId: string; canConfigure: boolean }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const storageKey = "hiobuy.admin.dismissedApiKeyReminder";
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(storageKey) === sessionId; }
    catch { return false; }
  });
  function dismiss() {
    setDismissed(true);
    try { sessionStorage.setItem(storageKey, sessionId); }
    catch { /* The reminder stays dismissed while the admin shell is open. */ }
  }
  return (
    <Dialog open={!dismissed} title="HioBuy API key required" onClose={dismiss} footer={<>
      <Button autoFocus variant={canConfigure ? "secondary" : "primary"} onClick={dismiss}>{canConfigure ? "Remind me next login" : "Got it"}</Button>
      {canConfigure && <Button onClick={() => { dismiss(); navigate("/admin/settings?tab=integration"); }}>Configure API key</Button>}
    </>}>
      <p className="text-[13px] leading-5 text-slate-600">{t(canConfigure
        ? "Add a HioBuy API key in Integration to enable purchasing and warehouse fulfillment."
        : "Ask the store owner to add a HioBuy API key to enable purchasing and warehouse fulfillment.")}</p>
    </Dialog>
  );
}

/** Signed-in customers on a demo instance. Staff permissions are not granted. */
export function RequireDemo() {
  const { data: session, isPending } = authClient.useSession();
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  const [release] = useState(holdDemoScope);
  useEffect(() => release, [release]);
  if (isPending) return <FullScreen> <Tr k="Loading…" /> </FullScreen>;
  if (!session) return <Navigate to="/admin/login?next=/admin/demo" replace />;
  return (
    <QueryClientProvider client={client}>
      <DemoGate email={session.user.email} />
    </QueryClientProvider>
  );
}

function DemoGate({ email }: { email: string }) {
  const navigate = useNavigate();
  const me = useAdminAccess(true);
  if (me.isLoading) return <FullScreen> <Tr k="Checking demo access…" /> </FullScreen>;
  if (me.error) {
    const missing = me.error instanceof ApiError && (me.error.status === 404 || me.error.status === 403);
    return (
      <FullScreen>
        <div className="max-w-sm text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500">
            <ShieldAlert size={22} aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-ink">{missing ? "Demo Admin is off" : "Couldn't open the demo"}</h1>
          <p className="mt-1.5 text-[13px] leading-5 text-slate-500">{missing ? "This workspace is not running in demo mode." : me.error.message}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="secondary" href="/"> <Tr k="Back to website" /> </Button>
            <Button
              variant="secondary"
              onClick={() => void authClient.signOut().finally(() => navigate("/admin/login", { replace: true }))}
            >
              <Tr k="Sign out" />
            </Button>
          </div>
        </div>
      </FullScreen>
    );
  }
  return <AdminShell email={email} demo />;
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-dvh place-items-center bg-white p-6 text-sm text-slate-500">{children}</div>;
}

function AdminShell({ email, demo = false }: { email: string; demo?: boolean }) {
  const { t } = useI18n();
  const overview = useQuery({ queryKey: ["admin", "overview"], queryFn: () => api<AdminOverview>("/api/admin/overview") });
  const location = useLocation();
  const navigate = useNavigate();
  const main = useRef<HTMLElement>(null);
  const routePath = location.pathname.replace(/^\/admin\/demo(?=\/|$)/, "/admin");
  const currentPage = [...links, settingsLink, { to: "/admin/guide", label: "Developer Guide" }]
    .filter(link => link.to === "/admin" ? routePath === link.to : routePath === link.to || routePath.startsWith(`${link.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0]?.label ?? "Admin";
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "collapsed" : "expanded");
    } catch {
      /* private mode */
    }
  }, [collapsed]);

  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!demo) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href?.startsWith("/admin") || href.startsWith("/admin/demo")) return;
      event.preventDefault();
      navigate(`/admin/demo${href.slice("/admin".length)}`);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [demo, navigate]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="admin-shell flex h-dvh">
      <aside
        className={cn(
          "admin-sidebar hidden shrink-0 flex-col border-r border-line bg-white transition-[width] duration-200 ease-out md:flex",
          collapsed ? "w-[72px]" : "w-[232px]",
        )}
      >
        <SideNav email={email} collapsed={collapsed} overview={overview.data} demo={demo} onToggle={() => setCollapsed((value) => !value)} />
      </aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" className="dialog-backdrop absolute inset-0 bg-slate-950/40" aria-label={t("Close menu")} onClick={() => setDrawerOpen(false)} />
          <div className="admin-sidebar drawer-in relative flex h-full w-[260px] max-w-[85vw] flex-col border-r border-line bg-white" role="dialog" aria-modal="true" aria-label={t("Admin menu")}>
            <SideNav email={email} collapsed={false} overview={overview.data} demo={demo} onNavigate={() => setDrawerOpen(false)} onClose={() => setDrawerOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="admin-topbar">
          <div className="admin-breadcrumb">
            <button type="button" className="admin-icon-button md:hidden" aria-label={t("Open menu")} aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>
              <Menu {...iconProps} />
            </button>
            <Link to={demo ? "/admin/demo" : "/admin"} className="hidden sm:inline">{t("Workspace")}</Link>
            <ChevronRight size={14} className="hidden shrink-0 sm:block" aria-hidden="true" />
            <span className="truncate font-medium text-ink" aria-current="page">{t(currentPage)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <LocaleSwitch tone="muted" />
            <span className="admin-avatar hidden sm:grid" title={email} aria-label={email}>{email.slice(0, 1).toUpperCase()}</span>
          </div>
        </header>
        <main ref={main} className="scroll-area min-h-0 flex-1 overflow-y-auto">
          {demo ? <DemoBanner /> : null}
          <div className="admin-content">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function SideNav({
  email,
  collapsed,
  overview,
  demo = false,
  onToggle,
  onNavigate,
  onClose,
}: {
  email: string;
  collapsed: boolean;
  overview?: AdminOverview;
  demo?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const { t: tr } = useAdminI18n();
  const { t } = useI18n();
  const navigate = useNavigate();
  const access = useAdminAccess();
  const permissions = access.data?.permissions ?? [];
  const visibleLinks = links.filter(link => {
    if (link.to === "/admin/customer-addresses") return !demo && allows(access.data,"customers.read");
    if (link.to === "/admin/procurement") return demo || allows(access.data, "procurement.read");
    if (link.to === "/admin/announcements") return !demo && allows(access.data, "announcements.read");
    if (link.to === "/admin/marketing") return demo || allows(access.data, "marketing.read");
    return link.to === "/admin/payments" ? allows(access.data, "payments.read") : true;
  });
  const showSettings = allows(access.data, "settings.read") || allows(access.data, "team.manage");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("admin-brand flex shrink-0 items-center", collapsed ? "flex-col gap-2 px-2 py-5" : "gap-2 px-5 py-6")}>
        <Link to={demo ? "/admin/demo" : "/admin"} className="flex min-w-0 items-center gap-2" onClick={onNavigate}>
          <Mark />
          {collapsed ? null : <div className="min-w-0"><BrandName /><span className="admin-brand-caption">{tr("WORKSPACE")}</span></div>}
        </Link>
        {onClose ? (
          <button type="button" className="ml-auto grid size-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-ink" aria-label={t("Close menu")} onClick={onClose}>
            <X {...iconProps} />
          </button>
        ) : null}
        {onToggle ? (
          <button
            type="button"
            className={cn("grid size-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-ink", !collapsed && "ml-auto")}
            aria-label={t(collapsed ? "Expand sidebar" : "Collapse sidebar")}
            aria-expanded={!collapsed}
            title={t(collapsed ? "Expand sidebar" : "Collapse sidebar")}
            onClick={onToggle}
          >
            {collapsed ? <PanelLeft {...iconProps} /> : <PanelLeftClose {...iconProps} />}
          </button>
        ) : null}
      </div>

      <nav className="admin-navigation min-h-0 flex-1 overflow-y-auto px-3 pb-3" aria-label={t("Admin")}>
        {[{ title: tr("Management workspace"), items: visibleLinks.filter(link => !["/admin/assistant", "/admin/calculator"].includes(link.to)) },
          { title: tr("Tools & settings"), items: visibleLinks.filter(link => ["/admin/assistant", "/admin/calculator"].includes(link.to)) }].map(group => (
          <div className="admin-nav-group" key={group.title}>
            {!collapsed && <p className="admin-nav-label">{t(group.title)}</p>}
            <div className="flex flex-col gap-1">
              {group.items.map(link => <SideLink key={link.to} to={adminHref(link.to)} label={link.label} icon={link.icon} end={link.end} collapsed={collapsed} count={overview && link.count ? link.count(overview) : 0} onNavigate={onNavigate} />)}
            </div>
          </div>
        ))}
        <div className="admin-nav-footer">
          {allows({ permissions }, "wallet.read") ? <SidebarWallet collapsed={collapsed} onNavigate={onNavigate} /> : null}
          <SideLink to={adminHref("/admin/guide")} label={tr("Developer Guide")} icon={BookOpen} collapsed={collapsed} onNavigate={onNavigate} />
          {showSettings ? <SideLink to={adminHref(settingsLink.to)} label={settingsLink.label} icon={settingsLink.icon} collapsed={collapsed} onNavigate={onNavigate} /> : null}
        </div>
      </nav>

      <div className="shrink-0 space-y-2 border-t border-line px-3 py-3">
        <a
          href="/"
          title={t("Website")}
          onClick={onNavigate}
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-md text-[13px] text-slate-600 hover:bg-slate-50 hover:text-ink",
            collapsed ? "justify-center" : "px-2",
          )}
        >
          <ArrowUpRight {...iconProps} />
          {collapsed ? <span className="sr-only">{t("Website")}</span> : <span className="truncate">{t("Website")}</span>}
        </a>
        <button
          type="button"
          title={t("Sign out")}
          onClick={() => {
            onNavigate?.();
            void authClient.signOut().finally(() => navigate("/admin/login", { replace: true }));
          }}
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-md text-[13px] text-slate-600 hover:bg-slate-50 hover:text-ink",
            collapsed ? "justify-center" : "px-2",
          )}
        >
          <LogOut {...iconProps} />
          {collapsed ? <span className="sr-only">{t("Sign out")}</span> : <span className="truncate">{t("Sign out")}</span>}
        </button>
        <div className={cn("flex min-h-10 items-center gap-2.5", collapsed ? "justify-center" : "px-2")} title={email}>
          <span className="admin-avatar">{email.slice(0, 1).toUpperCase()}</span>
          {collapsed ? <span className="sr-only">{email}</span> : <span className="min-w-0"><span className="block truncate text-xs font-semibold text-ink">{access.data?.name || email}</span><span className="block truncate text-[11px] text-slate-500">{email}</span></span>}
        </div>
      </div>
    </div>
  );
}

function SidebarWallet({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ["admin", "hiobuy-wallet"],
    queryFn: () => api<{ balance: { availableFen: number } }>("/api/admin/settings/hiobuy-wallet"),
    retry: false,
  });
  const disconnected = query.error instanceof ApiError && query.error.status === 409;
  const amount = query.data ? formatCnyFen(query.data.balance.availableFen) : disconnected ? t("Not connected") : query.isError ? t("Unavailable") : "…";
  return (
    <Link
      to={adminHref("/admin/settings?tab=wallet")}
      title={`${t("HioBuy wallet")} ${amount}`}
      onClick={onNavigate}
      className={cn("admin-wallet text-slate-600 hover:text-ink", collapsed ? "flex justify-center rounded-lg py-3" : "admin-wallet-card block")}
    >
      {collapsed ? <><Wallet {...iconProps} /><span className="sr-only"> <Tr k="HioBuy wallet" /> {amount}</span></> : (
        <>
          <span className="admin-wallet-heading"><Wallet {...iconProps} /><Tr k="HioBuy wallet" /></span>
          <span className={cn("admin-wallet-amount", !query.data && "admin-wallet-placeholder")} aria-live="polite">{amount}</span>
          {query.data && !query.isError && <span className="admin-wallet-purpose"><span className="admin-wallet-dot" aria-hidden="true" /><Tr k="Available for purchasing and shipping payments" /></span>}
        </>
      )}
    </Link>
  );
}

function SideLink({
  to,
  label,
  icon: Icon,
  end,
  collapsed,
  count = 0,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  collapsed: boolean;
  count?: number;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? t(label) : undefined}
      aria-label={count ? `${t(label)}, ${count}` : t(label)}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "admin-nav-link relative flex min-h-10 items-center gap-3 rounded-lg text-[13px]",
          collapsed ? "justify-center" : "px-3 py-2.5",
          isActive ? "admin-nav-active font-semibold" : "text-slate-500 hover:bg-slate-50 hover:text-ink",
        )
      }
    >
      <Icon {...iconProps} />
      {collapsed ? null : <span className="min-w-0 flex-1 truncate">{t(label)}</span>}
      {count ? (
        collapsed ? (
          <span className="absolute top-0.5 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-ink px-1 text-[10px] font-medium text-white tabular-nums">{count}</span>
        ) : (
          <span className="admin-nav-count min-w-5 rounded px-1.5 text-center text-[10px] leading-5 font-medium tabular-nums">{count}</span>
        )
      ) : null}
    </NavLink>
  );
}

function DemoBanner() {
  const access = useAdminAccess();
  const github = access.data?.githubUrl;
  return (
    <div className="border-b border-slate-200 bg-slate-50">
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[12px] text-slate-600 sm:px-6 lg:px-8">
        <p className="min-w-0"> <Tr k="Demo Mode — Sample data only. Changes are not saved." /> </p>
        <span className="ml-auto flex flex-wrap items-center gap-3">
          <a href="/" className="font-medium text-ink hover:underline"> <Tr k="Back to website" /> </a>
          {github ? <a href={github} target="_blank" rel="noreferrer" className="font-medium text-ink hover:underline"> <Tr k="View GitHub Repository" /> </a> : null}
        </span>
      </div>
    </div>
  );
}

function Mark() {
  const brand = useBrand();
  const initial = brand.name.trim().charAt(0).toUpperCase() || "F";
  if (brand.logos.square || brand.logos.primary) {
    const kind = brand.logos.square ? "square" : "primary";
    return <img src={`/api/branding/assets/${kind}?v=${brand.updatedAt}`} alt="" className="size-8 shrink-0 rounded-lg bg-white object-contain" />;
  }
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg text-lg font-semibold text-white" style={{ backgroundColor: brand.primaryColor }}>
      {initial}
    </span>
  );
}

function BrandName() {
  const brand = useBrand();
  return <span className="block truncate text-[15px] font-bold tracking-tight">{brand.name}</span>;
}
