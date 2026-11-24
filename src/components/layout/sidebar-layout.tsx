"use client";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Home,
  Heart,
  Footprints,
  ClipboardList,
  Building2,
  Package,
  MessageCircle,
  Wallet,
  User,
  LogOut,
} from "lucide-react";
import { NavMenuLabelWithBadge } from "@/components/nav-menu-badge";
import { getMatchedItem, type NavItem } from "@/lib/store/menu-store";
import { StorefrontLogoutDialog } from "@/components/layout/storefront-logout-dialog";
import {
  getProcurementNav,
  procurementClaimsChanged,
} from "@/lib/procurement/client";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
import { cn } from "@/lib/utils";
export const iconMap = {
  Home: <Home size={20} />,
  Heart: <Heart size={20} />,
  Footprints: <Footprints size={20} />,
  ClipboardList: <ClipboardList size={20} />,
  Building2: <Building2 size={20} />,
  Package: <Package size={20} />,
  Consult: <MessageCircle size={20} />,
  Wallet: <Wallet size={20} />,
  User: <User size={20} />,
  LogOut: <LogOut size={20} />,
};
export type IconKey = keyof typeof iconMap;
export const defaultNavItems: NavItem[] = [
  { path: "/", label: "Home", keyName: "home", icon: "Home", hidden: "false" },
  {
    path: "/member-center/favorites",
    label: "My favorite",
    keyName: "collect",
    icon: "Heart",
    hidden: "false",
  },
  {
    path: "/member-center/history",
    label: "Browsing history",
    keyName: "browseRecord",
    icon: "Footprints",
    hidden: "false",
  },
  {
    path: "/member-center/purchase-orders",
    label: "Purchase Order",
    keyName: "daigouOrder",
    icon: "ClipboardList",
    hidden: "false",
  },
  {
    path: "/member-center/warehouse",
    label: "Warehouse",
    keyName: "warehouse",
    icon: "Building2",
    hidden: "false",
  },
  {
    path: "/member-center/shipments",
    label: "Parcel",
    keyName: "parcelList",
    icon: "Package",
    hidden: "false",
  },
  {
    path: "/member-center/inquiries",
    label: "Messages",
    keyName: "consult",
    icon: "Consult",
    hidden: "false",
  },
  {
    path: "/member-center/wallet",
    label: "Wallet",
    keyName: "wallet",
    icon: "Wallet",
    hidden: "false",
  },
  {
    path: "/member-center/profile",
    label: "My account",
    keyName: "account",
    icon: "User",
    hidden: "false",
  },
  {
    path: "__logout__",
    label: "Logout",
    keyName: "logout",
    icon: "LogOut",
    hidden: "false",
  },
];

export function SidebarLayout({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const procurementUserId = useProcurementSessionStore(
    (state) => state.user?.id,
  );
  const [procurementNav, setProcurementNav] = useState<{
    userId: string;
    claims: number;
    unpaidShipments: number;
  }>();
  const [logoutOpen, setLogoutOpen] = useState(false);
  useEffect(() => {
    if (!procurementUserId) return;
    let request = 0;
    function refresh() {
      const current = ++request;
      getProcurementNav().then(
        ({ claims, unpaidShipments }) => {
          if (current === request && procurementUserId)
            setProcurementNav({
              userId: procurementUserId,
              claims,
              unpaidShipments,
            });
        },
        (error: unknown) => {
          if (current === request)
            console.error("Failed to fetch member navigation counts:", error);
        },
      );
    }
    refresh();
    window.addEventListener(procurementClaimsChanged, refresh);
    return () => {
      request += 1;
      window.removeEventListener(procurementClaimsChanged, refresh);
    };
  }, [procurementUserId, pathname]);
  const active = getMatchedItem(defaultNavItems, pathname);
  const nav =
    procurementNav?.userId === procurementUserId ? procurementNav : undefined;
  const copy = (key: string) =>
    (t.raw as (key: string) => string)(key.replaceAll(".", ""));
  return (
    <>
      <main className="min-w-0 flex-1">
        <div
          className={cn(
            "site-container mt-0 flex min-h-screen gap-4 max-md:w-full md:mt-4",
            [
              "/member-center/profile",
              "/member-center/purchase-orders",
              "/member-center/shipments",
            ].includes(pathname) && "max-md:w-full!",
          )}
        >
          <aside className="hidden w-[200px] shrink-0 md:sticky md:top-[calc(var(--header-height,0px)+var(--announcement-bar-height,0px)+1rem)] md:block md:max-h-[calc(100dvh-var(--header-height,0px)-var(--announcement-bar-height,0px)-2rem)] md:self-start md:overflow-y-auto">
            <nav className="py-2">
              {defaultNavItems.map((item) => {
                const label = copy(item.label);
                const count =
                  (item.keyName === "parcelList"
                    ? nav?.unpaidShipments
                    : item.keyName === "warehouse"
                      ? nav?.claims
                      : 0) ?? 0;
                const contents = (
                  <>
                    {iconMap[item.icon]}
                    <NavMenuLabelWithBadge label={label} badgeCount={count} />
                  </>
                );
                const className = cn(
                  "flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm transition-colors hover:bg-black/5",
                  active?.keyName === item.keyName
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-foreground",
                );
                return item.path === "__logout__" ? (
                  <button
                    key={item.keyName}
                    type="button"
                    className={className}
                    onClick={() => setLogoutOpen(true)}
                  >
                    {contents}
                  </button>
                ) : (
                  <Link
                    key={item.keyName}
                    href={item.path}
                    className={className}
                  >
                    {contents}
                  </Link>
                );
              })}
            </nav>
          </aside>
          <div className="min-w-0 flex-1 overflow-x-clip">{children}</div>
          <StorefrontLogoutDialog
            open={logoutOpen}
            onOpenChange={setLogoutOpen}
            title={copy("Logout")}
            description={copy("Are you sure you want to logout?")}
            cancel={copy("Cancel")}
            confirm={copy("Logout")}
          />
        </div>
      </main>
    </>
  );
}
