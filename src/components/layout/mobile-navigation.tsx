// 移动端底部导航
"use client";
import { useTranslations as useUiTranslations } from "next-intl";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { List, Home, MessageCircleMore, ShoppingBag, User } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCommonStore } from "@/lib/store/common";
import { useProcurementCartCount } from "@/lib/procurement/cart-count";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
type MobileBottomNavigationIcon =
  "home" | "categories" | "messages" | "cart" | "my";
type MobileBottomNavigationItem = {
  key: string;
  label: "Home" | "Categories" | "Messages" | "Cart" | "Me";
  href: string;
  icon: MobileBottomNavigationIcon;
};
const DEFAULT_ITEMS: MobileBottomNavigationItem[] = [
  { key: "home", label: "Home", href: "/", icon: "home" },
  {
    key: "categories",
    label: "Categories",
    href: "/categories",
    icon: "categories",
  },
  { key: "messages", label: "Messages", href: "/messages", icon: "messages" },
  { key: "cart", label: "Cart", href: "/cart", icon: "cart" },
  { key: "my", label: "Me", href: "#", icon: "my" },
];
const ICONS: Record<MobileBottomNavigationIcon, typeof Home> = {
  home: Home,
  categories: List,
  messages: MessageCircleMore,
  cart: ShoppingBag,
  my: User,
};
const NAV_HEIGHT = 60;
const NAV_SAFE_HEIGHT = `calc(${NAV_HEIGHT}px + env(safe-area-inset-bottom))`;
const MOBILE_BOTTOM_NAV_HEIGHT_VAR = "--haiou-mobile-bottom-nav-height";
function isItemActive(
  item: Required<MobileBottomNavigationItem>,
  pathname: string,
) {
  return pathname === item.href;
}
export function MobileNavigation() {
  const backgroundColor = "#ffffff",
    borderColor = "#e5e7eb",
    textColor = "#333333",
    iconColor = "#999999",
    iconSize = 22;
  const translateUi = useUiTranslations();

  const pathname = usePathname() || "/";
  const normalizedItems = DEFAULT_ITEMS.map((item) => ({
    ...item,
    label: translateUi.raw(item.label),
  }));
  const legacyCartCount = useCommonStore((s) => s.cartCount);
  const procurementCartCount = useProcurementCartCount((state) => state.count);
  const hasSession = useProcurementSessionStore((state) => state.hasSession);
  const cartCount = hasSession ? procurementCartCount : legacyCartCount;
  useEffect(() => {
    document.documentElement.style.setProperty(
      MOBILE_BOTTOM_NAV_HEIGHT_VAR,
      NAV_SAFE_HEIGHT,
    );
    return () => {
      document.documentElement.style.removeProperty(
        MOBILE_BOTTOM_NAV_HEIGHT_VAR,
      );
    };
  }, []);
  // 显示个人中心菜单
  const showCenterMenu = () => {
    window.dispatchEvent(new CustomEvent("showCenterMenu"));
  };
  return (
    <div className="block lg:hidden" style={{ height: NAV_SAFE_HEIGHT }}>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 lg:hidden"
        style={{
          backgroundColor,
          borderTop: `1px solid ${borderColor}`,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        aria-label={translateUi.raw("Mobile bottom navigation")}
      >
        <div
          className="mx-auto grid max-w-screen-sm"
          style={{
            height: NAV_HEIGHT,
            gridTemplateColumns: `repeat(${normalizedItems.length}, minmax(0, 1fr))`,
          }}
        >
          {normalizedItems.map((item) => {
            const active = isItemActive(item, pathname);
            const Icon = ICONS[item.icon] || Home;
            const content = (
              <>
                <div className="relative">
                  <Icon
                    size={iconSize}
                    strokeWidth={active ? 1.8 : 1.4}
                    className="shrink-0"
                    style={{ color: active ? "var(--primary)" : iconColor }}
                  />
                  {item.key === "cart" && cartCount > 0 && (
                    <span className="absolute -end-3 -top-2 h-5 min-w-5 rounded-full bg-red-500 text-center text-xs leading-5 font-semibold text-white">
                      {cartCount}
                    </span>
                  )}
                </div>
                {
                  <span
                    className={cn(
                      "max-w-full truncate text-xs",
                      active && "font-medium",
                    )}
                    style={{ color: active ? "var(--primary)" : textColor }}
                  >
                    {item.label}
                  </span>
                }
              </>
            );
            return item.key === "my" ? (
              <div
                key={item.key}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center px-1 py-2 text-center",
                  "transition-colors active:opacity-80",
                )}
                aria-current={active ? "page" : undefined}
                onClick={showCenterMenu}
              >
                {content}
              </div>
            ) : (
              <a
                key={item.key}
                href={item.href}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center px-1 py-2 text-center",
                  "transition-colors",
                )}
                aria-current={active ? "page" : undefined}
              >
                {content}
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
