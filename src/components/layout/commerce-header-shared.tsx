"use client";
import { AccountAvatar } from "@/components/account-avatar";
import { useHydrated } from "@/hooks/use-hydrated";
import { useTranslations as useUiTranslations } from "next-intl";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  isValidCurrencyConfig,
  useCommonStore,
  type CurrencyConfig,
} from "@/lib/store/common";
import {
  getCategoryHref,
  useProductCategories,
  type CategoryItem,
} from "@/lib/store/category";
import { getExchangeRates } from "@/lib/procurement/client";
import { revalidateProcurementProfile } from "@/lib/procurement/profile";
import { useProcurementCartCount } from "@/lib/procurement/cart-count";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
import { SITE_LOGO, SITE_LANGUAGES } from "@/config/site";
import { useLocaleStore } from "@/stores/locale-store";
import type { ThemeLogo } from "@/types/site";
import type { PublishedLanguage } from "@/types/site";
import { DEFAULT_LANGUAGE } from "@/config/site";
import { LocalizedLink } from "@/components/localized-link";
import type { HeaderTopAdItem } from "./header-top-ads";
import {
  extractLanguageFromPath,
  resolveLanguageForClient,
  writeLangCookie,
  type LanguageCode,
} from "@/lib/utils/language";
import { copyToClipboard, DEFAULT_COPY_CLIPBOARD_TOAST } from "@/lib/utils";
import {
  getNavMenuBadgeCount,
  NavMenuLabelWithBadge,
} from "@/components/nav-menu-badge";
import { ResponsiveContentFrame } from "@/components/layout/responsive-content-frame";
import { useProductSearch } from "@/lib/hooks/use-product-search";
import {
  getInlineScrollState,
  scrollInlineBy,
  type InlineScrollDirection,
} from "@/lib/utils/inline-scroll";
import { Spinner } from "@/components/ui/spinner";
import { default as SearchIcon } from "@/assets/images/common/search.svg";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Copy,
  Globe,
  Heart,
  History,
  ClipboardList,
  Footprints,
  Building2,
  LogOut,
  Menu,
  Package,
  ShoppingCart,
  User,
  Wallet,
  X,
  MessageCircle,
  Home,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StorefrontLogoutDialog } from "@/components/layout/storefront-logout-dialog";
export const HEADER_HEIGHT_VAR = "--header-height";
export const SEARCH_HISTORY_KEY = "haiou_search_history";
export const MAX_HISTORY_ITEMS = 10;
export const PLATFORM_ICON_PATHS = [
  "/assets/images/home/1688.png",
  "/assets/images/home/taobao.png",
  "/assets/images/home/weidian.png",
];
export const MOBILE_MENU_PATHS = new Set([
  "/",
  "/categories",
  "/messages",
  "/cart",
]);
export interface CommerceHeaderLinkItem {
  label: string;
  path: string;
}
export interface CommerceHeaderProps {
  topAdsItems?: HeaderTopAdItem[];
  logoLink?: string;
  topAdsAutoPlayInterval?: number;
  topNavItems?: CommerceHeaderLinkItem[];
  showHomeCategoryStrip?: boolean;
}
export type CommerceHeaderRuntimeProps = CommerceHeaderProps;
export function pickLanguageForSelect(
  pathLang: LanguageCode,
  langs: PublishedLanguage[],
  defaultLang: string,
): string {
  const codes = langs.map((item) => item.code);
  if (codes.includes(pathLang)) return pathLang;
  if (codes.includes(defaultLang)) return defaultLang;
  return langs[0]?.code ?? pathLang;
}
function normalizeHistory(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string" && !!item.trim(),
      )
    : [];
}
function getSavedSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return normalizeHistory(
      JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || "[]"),
    );
  } catch {
    return [];
  }
}
export function isExternalPath(path: string) {
  return (
    /^https?:\/\//i.test(path) ||
    path.startsWith("mailto:") ||
    path.startsWith("tel:")
  );
}
export function isRouteActive(currentPath: string, targetPath: string) {
  if (!targetPath || isExternalPath(targetPath)) return false;
  const normalizedTarget =
    targetPath.split(/[?#]/, 1)[0].replace(/\/$/, "") || "/";
  const normalizedCurrent = currentPath.replace(/\/$/, "") || "/";
  return normalizedTarget === "/"
    ? normalizedCurrent === "/"
    : normalizedCurrent === normalizedTarget ||
        normalizedCurrent.startsWith(`${normalizedTarget}/`);
}
export function normalizeHeaderPath(path: string) {
  return path.split(/[?#]/, 1)[0].replace(/\/$/, "") || "/";
}
export function MenuLink({
  item,
  className,
  onClick,
}: {
  item: CommerceHeaderLinkItem;
  className?: string;
  onClick?: () => void;
}) {
  if (!item.path) {
    return <span className={className}>{item.label}</span>;
  }
  if (isExternalPath(item.path)) {
    return (
      <a
        className={className}
        href={item.path}
        target="_blank"
        rel="noreferrer"
        onClick={onClick}
      >
        {item.label}
      </a>
    );
  }
  return (
    <LocalizedLink className={className} href={item.path} onClick={onClick}>
      {item.label}
    </LocalizedLink>
  );
}
export function CategoryLink({ category }: { category: CategoryItem }) {
  return (
    <LocalizedLink
      className="shrink-0 text-sm whitespace-nowrap text-white/90 transition-colors hover:text-white"
      href={getCategoryHref(category)}
    >
      {category.name}
    </LocalizedLink>
  );
}

const EXCHANGE_RATE_STORAGE_KEY = "procurement_exchange_rates";

function getDisplayCurrencySymbol(code: string): string {
  return (
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? code
  );
}

export function useCommerceHeaderRuntime(props: CommerceHeaderRuntimeProps) {
  const t = useUiTranslations();
  const router = useRouter();
  const pathname = usePathname() || "/";
  const { actualPath } = extractLanguageFromPath(
    pathname,
    DEFAULT_LANGUAGE.code,
  );
  const isHomePage = actualPath === "/";
  const procurementHasSession = useProcurementSessionStore(
    (state) => state.hasSession,
  );
  const procurementUser = useProcurementSessionStore((state) => state.user);
  const procurementUserId = procurementUser?.id;
  const clientUser = procurementHasSession
    ? {
        id: procurementUser?.id ?? "",
        name: procurementUser?.name ?? "",
        email: procurementUser?.email,
        avatar: procurementUser?.avatar ?? undefined,
      }
    : null;
  const avatarName = clientUser?.name?.trim();
  const procurementCartCount = useProcurementCartCount((state) => state.count);
  const currency = useCommonStore((state) => state.currency);
  const saveCurrencyInfo = useCommonStore((state) => state.saveCurrencyInfo);
  const { categories } = useProductCategories();
  const logo: ThemeLogo = SITE_LOGO;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [categoryMegaOpen, setCategoryMegaOpen] = useState(false);
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(0);
  const [categoryBackdropTop, setCategoryBackdropTop] = useState(0);
  const [searchDrawerOpen, setSearchDrawerOpen] = useState(false);
  const hydrated = useHydrated();
  const [historyOverride, setSearchHistory] = useState<string[] | null>(null);
  const searchHistory =
    historyOverride ?? (hydrated ? getSavedSearchHistory() : []);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [localeSheetOpen, setLocaleSheetOpen] = useState(false);
  const [localePopoverOpen, setLocalePopoverOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const defaultLanguage = DEFAULT_LANGUAGE.code;
  const publishedLanguages: PublishedLanguage[] = SITE_LANGUAGES;
  const [rateList, setRateList] = useState<CurrencyConfig[]>([]);
  const [pendingLanguage, setPendingLanguage] = useState<string>(
    DEFAULT_LANGUAGE.code,
  );
  const [pendingCurrency, setPendingCurrency] = useState<string>("USD");
  const currentLang = useLocaleStore((state) => state.locale);
  const [announcementBarHeight, setAnnouncementBarHeight] = useState<
    string | null
  >(null);
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const {
    fileInputRef,
    handleFileChange: searchByImage,
    handleImageUpload,
    handleSearch: searchProducts,
    imageUploading,
    searchKeyword,
    setSearchKeyword,
  } = useProductSearch(undefined, {
    uploadFailed: t("Image upload failed, please try again"),
  });
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const localeCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const avatarCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [categoryCanScrollLeft, setCategoryCanScrollLeft] = useState(false);
  const [categoryCanScrollRight, setCategoryCanScrollRight] = useState(false);
  const searchParams = useSearchParams();
  const localeSummary = useMemo(() => {
    const code = currentLang || defaultLanguage;
    const language =
      publishedLanguages.find((item) => item.code === code) || DEFAULT_LANGUAGE;
    return `${language.name} / ${currency.code || "USD"}`;
  }, [currentLang, defaultLanguage, publishedLanguages, currency.code]);
  const showMobileMenuButton = MOBILE_MENU_PATHS.has(
    normalizeHeaderPath(actualPath),
  );
  useEffect(() => {
    const inviteId = searchParams.get("invite_id");
    if (inviteId && typeof window !== "undefined") {
      localStorage.setItem("invite_id", inviteId);
    }
  }, [searchParams]);
  useEffect(() => {
    let active = true;
    const loadRates = async () => {
      try {
        const cachedRaw = localStorage.getItem(EXCHANGE_RATE_STORAGE_KEY);
        if (cachedRaw) {
          try {
            const cached = JSON.parse(cachedRaw);
            if (
              Array.isArray(cached) &&
              cached.length > 0 &&
              cached.every(isValidCurrencyConfig)
            ) {
              setRateList(cached);
            } else {
              localStorage.removeItem(EXCHANGE_RATE_STORAGE_KEY);
            }
          } catch {
            localStorage.removeItem(EXCHANGE_RATE_STORAGE_KEY);
          }
        }

        const { items, settlementCurrency, baseCurrency } =
          await getExchangeRates();
        if (!active) return;
        const nextRates = items
          .filter(
            ({ currency, unitsPerCnyE8 }) =>
              /^[A-Z]{3}$/.test(currency) &&
              Number.isSafeInteger(unitsPerCnyE8) &&
              unitsPerCnyE8 > 0,
          )
          .map(({ currency: code, unitsPerCnyE8 }) => ({
            code,
            symbol: getDisplayCurrencySymbol(code),
            unitsPerCnyE8,
          }));
        // Keep the current selection when the response has no usable rates.
        if (nextRates.length === 0) return;
        setRateList(nextRates);

        const savedCode = localStorage.getItem("currency_info")
          ? useCommonStore.getState().currency.code
          : undefined;
        const selected = nextRates.find(({ code }) => code === savedCode) ??
          nextRates.find(({ code }) => code === settlementCurrency) ??
          nextRates.find(({ code }) => code === "USD") ??
          nextRates.find(({ code }) => code === baseCurrency) ??
          nextRates[0] ?? {
            code: baseCurrency,
            symbol: getDisplayCurrencySymbol(baseCurrency),
            unitsPerCnyE8: 100000000,
          };
        saveCurrencyInfo(selected);
        localStorage.setItem(
          EXCHANGE_RATE_STORAGE_KEY,
          JSON.stringify(nextRates),
        );
      } catch {}
    };
    void loadRates();
    return () => {
      active = false;
    };
  }, [saveCurrencyInfo]);
  useEffect(() => {
    if (!procurementHasSession) return;
    void revalidateProcurementProfile().catch(() => {});
  }, [procurementHasSession, procurementUserId]);
  useEffect(() => {
    const syncScrollState = () => setIsHeaderScrolled(window.scrollY > 0);
    syncScrollState();
    window.addEventListener("scroll", syncScrollState, { passive: true });
    return () => window.removeEventListener("scroll", syncScrollState);
  }, []);
  useEffect(() => {
    const updateHeaderHeight = () => {
      const el = headerRef.current;
      const height = el ? Math.ceil(el.getBoundingClientRect().height) : 0;
      document.documentElement.style.setProperty(
        HEADER_HEIGHT_VAR,
        `${height}px`,
      );
    };
    updateHeaderHeight();
    const el = headerRef.current;
    const observer = el ? new ResizeObserver(updateHeaderHeight) : null;
    if (el) observer?.observe(el);
    window.addEventListener("resize", updateHeaderHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateHeaderHeight);
      document.documentElement.style.removeProperty(HEADER_HEIGHT_VAR);
    };
  }, [
    searchDrawerOpen,
    mobileMenuOpen,
    categorySheetOpen,
    pathname,
    announcementBarHeight,
  ]);
  useEffect(() => {
    const updateHeaderPosition = () => {
      const height = getComputedStyle(document.documentElement)
        .getPropertyValue("--announcement-bar-height")
        .trim();
      setAnnouncementBarHeight(height || null);
    };
    updateHeaderPosition();
    const intervalId = window.setInterval(updateHeaderPosition, 150);
    window.addEventListener("resize", updateHeaderPosition);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("resize", updateHeaderPosition);
    };
  }, []);
  useEffect(() => {
    if (!categoryMegaOpen) return;
    const updateCategoryBackdropTop = () => {
      const rect = headerRef.current?.getBoundingClientRect();
      setCategoryBackdropTop(rect ? Math.max(0, rect.bottom) : 0);
    };
    updateCategoryBackdropTop();
    const observer = headerRef.current
      ? new ResizeObserver(updateCategoryBackdropTop)
      : null;
    if (headerRef.current) observer?.observe(headerRef.current);
    window.addEventListener("scroll", updateCategoryBackdropTop, {
      passive: true,
    });
    window.addEventListener("resize", updateCategoryBackdropTop);
    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", updateCategoryBackdropTop);
      window.removeEventListener("resize", updateCategoryBackdropTop);
    };
  }, [categoryMegaOpen]);
  useEffect(() => {
    const handler = () => setMobileMenuOpen(true);
    window.addEventListener("showCenterMenu", handler);
    return () => window.removeEventListener("showCenterMenu", handler);
  }, []);
  const userDisplayName = (clientUser?.name || "").trim() || t("User");
  const visibleCategories = categories;
  const activeCategory = visibleCategories[activeCategoryIndex];
  const activeCategoryChildren = activeCategory?.children ?? [];
  const prepareLocaleSelection = () => {
    setPendingLanguage(
      pickLanguageForSelect(
        currentLang as LanguageCode,
        publishedLanguages,
        defaultLanguage,
      ),
    );
    setPendingCurrency(currency.code || "USD");
  };
  const openLocalePopover = () => {
    if (localeCloseTimerRef.current) clearTimeout(localeCloseTimerRef.current);
    if (!localePopoverOpen) prepareLocaleSelection();
    setLocalePopoverOpen(true);
  };
  const scheduleLocalePopoverClose = () => {
    if (localeCloseTimerRef.current) clearTimeout(localeCloseTimerRef.current);
    localeCloseTimerRef.current = setTimeout(
      () => setLocalePopoverOpen(false),
      240,
    );
  };
  const openAvatarMenu = () => {
    if (avatarCloseTimerRef.current) clearTimeout(avatarCloseTimerRef.current);
    setAvatarMenuOpen(true);
  };
  const scheduleAvatarMenuClose = () => {
    if (avatarCloseTimerRef.current) clearTimeout(avatarCloseTimerRef.current);
    avatarCloseTimerRef.current = setTimeout(
      () => setAvatarMenuOpen(false),
      240,
    );
  };
  useEffect(() => {
    return () => {
      if (localeCloseTimerRef.current)
        clearTimeout(localeCloseTimerRef.current);
      if (avatarCloseTimerRef.current)
        clearTimeout(avatarCloseTimerRef.current);
    };
  }, []);
  const updateCategoryScrollState = () => {
    const element = categoryScrollRef.current;
    if (!element) return;
    const { canScrollStart, canScrollEnd } = getInlineScrollState(element);
    setCategoryCanScrollLeft(canScrollStart);
    setCategoryCanScrollRight(canScrollEnd);
  };
  const scrollCategories = (direction: InlineScrollDirection) => {
    const element = categoryScrollRef.current;
    if (!element) return;
    scrollInlineBy(element, direction, 320);
    window.setTimeout(updateCategoryScrollState, 300);
  };
  useEffect(() => {
    updateCategoryScrollState();
    const element = categoryScrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(updateCategoryScrollState);
    observer.observe(element);
    element.addEventListener("scroll", updateCategoryScrollState, {
      passive: true,
    });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", updateCategoryScrollState);
    };
  }, [visibleCategories.length]);
  const handleSearch = (keyword: string) => {
    let nextKeyword = keyword.trim();
    if (!nextKeyword && searchHistory.length > 0) {
      nextKeyword = searchHistory[0];
    }
    if (!nextKeyword) return;
    const nextHistory = [
      nextKeyword,
      ...searchHistory.filter((item) => item !== nextKeyword),
    ].slice(0, MAX_HISTORY_ITEMS);
    setSearchHistory(nextHistory);
    searchProducts(nextKeyword);
    setSearchDrawerOpen(false);
  };
  const removeHistoryItem = (keyword: string) => {
    const nextHistory = searchHistory.filter((item) => item !== keyword);
    setSearchHistory(nextHistory);
    if (typeof window !== "undefined") {
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(nextHistory));
    }
  };
  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const imageUrl = await searchByImage(event);
    if (imageUrl) {
      setSearchDrawerOpen(false);
    }
  };
  const handleMobileBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  };
  const saveLocaleSelection = (close: "popover" | "sheet") => {
    const data = rateList.find(({ code }) => code === pendingCurrency);
    if (data) saveCurrencyInfo(data);
    const effectiveLang = resolveLanguageForClient(
      pathname || "/",
      defaultLanguage,
    );
    if (pendingLanguage !== effectiveLang) writeLangCookie(pendingLanguage);
    if (close === "popover") setLocalePopoverOpen(false);
    if (close === "sheet") setLocaleSheetOpen(false);
    window.location.reload();
  };
  const bindHeader = (element: HTMLElement | null) => {
    headerRef.current = element;
  };
  const bindCategoryScroll = (element: HTMLDivElement | null) => {
    categoryScrollRef.current = element;
  };
  const bindFileInput = (element: HTMLInputElement | null) => {
    fileInputRef.current = element;
  };
  const headerStyle: React.CSSProperties = { top: announcementBarHeight || 0 };
  return {
    bindHeader,
    bindFileInput,
    bindCategoryScroll,
    runtime: {
      actualPath,
      activeCategory,
      activeCategoryChildren,
      activeCategoryIndex,
      avatarName,
      avatarMenuOpen,
      cartCount: procurementCartCount,
      categoryBackdropTop,
      categoryCanScrollLeft,
      categoryCanScrollRight,
      categoryMegaOpen,
      categorySheetOpen,
      clientUser,
      currency,
      defaultLanguage,
      handleFileChange,
      handleImageUpload,
      handleMobileBack,
      handleSearch,
      headerStyle,
      imageUploading,
      isHeaderScrolled,
      isHomePage,
      localePopoverOpen,
      localeSheetOpen,
      localeSummary,
      logo,
      logoutDialogOpen,
      mobileMenuOpen,
      openAvatarMenu,
      openLocalePopover,
      pendingCurrency,
      pendingLanguage,
      prepareLocaleSelection,
      publishedLanguages,
      qtyInfo: {},
      rateList,
      removeHistoryItem,
      saveLocaleSelection,
      scheduleAvatarMenuClose,
      scheduleLocalePopoverClose,
      searchDrawerOpen,
      searchHistory,
      searchKeyword,
      scrollCategories,
      setActiveCategoryIndex,
      setAvatarMenuOpen,
      setCategoryMegaOpen,
      setCategorySheetOpen,
      setLocalePopoverOpen,
      setLocaleSheetOpen,
      setLogoutDialogOpen,
      setMobileMenuOpen,
      setPendingCurrency,
      setPendingLanguage,
      setSearchDrawerOpen,
      setSearchKeyword,
      showMobileMenuButton,
      userDisplayName,
      visibleCategories,
    },
  };
}
export type CommerceHeaderRuntime = ReturnType<
  typeof useCommerceHeaderRuntime
>["runtime"];
export function CommerceHeaderMobileBar({
  props,
  runtime,
  bindFileInput,
  variant = "primary",
}: {
  props: CommerceHeaderRuntimeProps;
  runtime: CommerceHeaderRuntime;
  bindFileInput: React.RefCallback<HTMLInputElement>;
  variant?: "primary" | "white";
}) {
  const t = useUiTranslations();

  const isWhite = variant === "white";
  const showCollapsedSearch = ["/", "/search"].includes(
    normalizeHeaderPath(runtime.actualPath),
  );
  return (
    <div
      className={
        isWhite ? "w-full bg-white lg:hidden" : "bg-primary w-full lg:hidden"
      }
    >
      <ResponsiveContentFrame className="flex items-center justify-between gap-2 py-3">
        <div className="flex items-center gap-2">
          {runtime.showMobileMenuButton ? (
            <button
              type="button"
              className={isWhite ? "text-primary" : "text-white"}
              onClick={() => runtime.setMobileMenuOpen(true)}
              aria-label={t.raw("Open menu")}
            >
              <Menu className="size-6" />
            </button>
          ) : (
            <button
              type="button"
              className={isWhite ? "text-primary" : "text-white"}
              onClick={runtime.handleMobileBack}
              aria-label={t.raw("Back")}
            >
              <ChevronLeft className="size-6" />
            </button>
          )}
          <button
            type="button"
            className={isWhite ? "text-primary" : "text-white"}
            aria-label={t.raw("Language / Currency")}
            onClick={() => {
              runtime.prepareLocaleSelection();
              runtime.setLocaleSheetOpen(true);
            }}
          >
            <Globe className="h-6 w-6" />
          </button>
        </div>

        <div className="flex min-w-0 flex-1 items-center">
          {showCollapsedSearch ? (
            <button
              type="button"
              className={`ms-auto inline-flex shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80 ${isWhite ? "text-primary" : "text-white"}`}
              onClick={() => runtime.setSearchDrawerOpen(true)}
              aria-label={t("Search")}
              title={t("Search")}
            >
              <SearchIcon
                aria-hidden="true"
                className="h-6 w-6 [&_path]:fill-current"
              />
            </button>
          ) : (
            <div
              className={`flex h-10 min-w-0 flex-1 items-center rounded-full bg-white ps-3 pe-1${isWhite ? "border-primary border" : ""}`}
            >
              <input
                ref={bindFileInput}
                accept="image/*"
                className="hidden"
                type="file"
                onChange={runtime.handleFileChange}
              />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm text-[#333333] outline-none placeholder:text-[#999999]"
                placeholder={t("Paste Product Name / Link")}
                value={runtime.searchKeyword}
                onChange={(event) =>
                  runtime.setSearchKeyword(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    runtime.handleSearch(runtime.searchKeyword);
                  }
                }}
              />
              <button
                type="button"
                className="mx-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#999999]"
                onClick={runtime.handleImageUpload}
                disabled={runtime.imageUploading}
                aria-label={t("Upload image to search")}
                title={t("Upload image to search")}
              >
                {runtime.imageUploading ? (
                  <Spinner className="size-5" />
                ) : (
                  <Camera className="h-5 w-5" />
                )}
              </button>
              <button
                type="button"
                className="bg-primary inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                onClick={() => runtime.handleSearch(runtime.searchKeyword)}
                aria-label={t("Search")}
              >
                <img
                  alt=""
                  className="h-5 w-5"
                  src="/assets/images/common/search.svg"
                />
              </button>
            </div>
          )}
        </div>

        <LocalizedLink
          className={
            isWhite
              ? "text-primary hover:bg-primary/10 relative rounded-full p-2 transition-colors"
              : "relative rounded-full p-2 text-white transition-colors hover:bg-white/15"
          }
          href="/cart"
        >
          {runtime.cartCount > 0 && (
            <span className="text-primary absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold">
              {runtime.cartCount > 99 ? "99+" : runtime.cartCount}
            </span>
          )}
          <ShoppingCart className="h-6 w-6" />
        </LocalizedLink>
      </ResponsiveContentFrame>
    </div>
  );
}
export function CommerceHeaderSharedSheets({
  props,
  runtime,
  bindFileInput,
}: {
  props: CommerceHeaderRuntimeProps;
  runtime: CommerceHeaderRuntime;
  bindFileInput: React.RefCallback<HTMLInputElement>;
}) {
  const t = useUiTranslations();

  return (
    <>
      <Sheet
        open={runtime.searchDrawerOpen}
        onOpenChange={runtime.setSearchDrawerOpen}
      >
        <SheetContent
          side="top"
          className="border-0 bg-white px-3 pt-6 pb-8 shadow-none sm:px-5 [&>button]:hidden"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t("Search History")}</SheetTitle>
          </SheetHeader>
          <ResponsiveContentFrame>
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#dedede] ps-4 pe-1 transition-colors focus-within:border-black sm:ps-5 md:min-h-13 md:rounded-2xl">
                <input
                  ref={bindFileInput}
                  accept="image/*"
                  className="hidden"
                  type="file"
                  onChange={runtime.handleFileChange}
                />
                <input
                  className="min-w-0 flex-1 bg-transparent text-base text-[#404040] outline-none placeholder:text-[#B9B9B9]"
                  placeholder={t("Paste Product Name / Link")}
                  value={runtime.searchKeyword}
                  onChange={(event) =>
                    runtime.setSearchKeyword(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      runtime.handleSearch(runtime.searchKeyword);
                    }
                  }}
                />
                <div className="hidden items-center gap-2 md:flex">
                  {PLATFORM_ICON_PATHS.map((iconPath) => (
                    <img
                      key={iconPath}
                      alt=""
                      className="h-7 w-7 rounded-full object-cover opacity-70"
                      src={iconPath}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="inline-flex rounded-full border border-[#ECECEC] bg-[#F8F8F8] p-2 text-[#969696]"
                  onClick={runtime.handleImageUpload}
                  disabled={runtime.imageUploading}
                  title={t("Upload image to search")}
                >
                  {runtime.imageUploading ? (
                    <Spinner className="size-5" />
                  ) : (
                    <Camera className="h-5 w-5" />
                  )}
                </button>
                <button
                  type="button"
                  className="bg-primary shrink-0 rounded-xl px-4 py-2 text-sm font-bold whitespace-nowrap text-white sm:px-6 md:text-lg"
                  onClick={() => runtime.handleSearch(runtime.searchKeyword)}
                >
                  {t("Search")}
                </button>
              </div>
              <button
                type="button"
                className="hidden rounded-full p-1.5 text-[#404040] transition-colors hover:bg-[#F4F4F5] md:block"
                onClick={() => runtime.setSearchDrawerOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-8">
              <div className="mb-5 font-bold">{t("Search History")}</div>
              {runtime.searchHistory.length > 0 ? (
                <div className="grid min-w-0 gap-x-10 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
                  {runtime.searchHistory.map((keyword) => (
                    <div
                      key={keyword}
                      className="flex min-w-0 items-center justify-between gap-3 overflow-hidden rounded-lg transition-colors hover:bg-[#F9FAFB] md:rounded-2xl md:px-3 md:py-3"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-start"
                        onClick={() => runtime.handleSearch(keyword)}
                      >
                        <History className="h-5 w-5 shrink-0 text-[#7C7C7C]" />
                        <span className="min-w-0 flex-1 truncate text-base text-[#3F3F46]">
                          {keyword}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="rounded-full p-1 text-[#8A8A8A] transition-colors hover:bg-[#EFEFF1] hover:text-[#1F1F1F]"
                        onClick={() => runtime.removeHistoryItem(keyword)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-base text-[#8A8A8A]">
                  {t("No recent searches")}
                </div>
              )}
            </div>
          </ResponsiveContentFrame>
        </SheetContent>
      </Sheet>

      <Sheet
        open={runtime.mobileMenuOpen}
        onOpenChange={runtime.setMobileMenuOpen}
      >
        <SheetContent
          side="left"
          className="flex h-dvh w-[min(300px,85vw)] flex-col overflow-hidden bg-white p-0 [&>button]:hidden"
        >
          <div className="bg-primary shrink-0 border-b p-5 text-white">
            {runtime.clientUser ? (
              <div className="flex items-center gap-3">
                <AccountAvatar
                  className="h-14 w-14 text-2xl"
                  name={runtime.avatarName}
                  email={runtime.clientUser.email}
                  src={runtime.clientUser.avatar}
                />
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">
                    {runtime.userDisplayName}
                  </div>
                  {runtime.clientUser?.id ? (
                    <button
                      type="button"
                      className="mt-1 inline-flex items-center gap-1 text-sm text-white/80"
                      onClick={() =>
                        copyToClipboard(String(runtime.clientUser?.id || ""), {
                          success: t("Successfully copied to clipboard"),
                          error: t("Failed to copy to clipboard"),
                        })
                      }
                    >
                      <span>
                        {t.raw("ID:")} {runtime.clientUser.id}
                      </span>
                      <Copy className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-4 text-sm text-white/85">
                  {t("Welcome! Join us to get started")}
                </div>
                <div className="flex gap-3">
                  <LocalizedLink
                    className="flex-1 rounded-full bg-white px-4 py-2 text-center text-sm font-semibold text-[var(--primary)]"
                    href="/login"
                    onClick={() => runtime.setMobileMenuOpen(false)}
                  >
                    {t("Login")}
                  </LocalizedLink>
                  <LocalizedLink
                    className="flex-1 rounded-full border border-white px-4 py-2 text-center text-sm font-semibold text-white"
                    href="/register"
                    onClick={() => runtime.setMobileMenuOpen(false)}
                  >
                    {t("Sign Up")}
                  </LocalizedLink>
                </div>
              </div>
            )}
          </div>

          <div className="hide-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto py-2">
            <LocalizedLink
              className="flex items-center gap-3 px-5 py-3 text-[#1F1F1F]"
              href="/"
              onClick={() => runtime.setMobileMenuOpen(false)}
            >
              <Home className="h-5 w-5 text-[#666666]" />
              <span>{t("Home")}</span>
            </LocalizedLink>
            {(props.topNavItems || [])
              .filter((item) => item.path !== "/")
              .map((item, index) => (
                <MenuLink
                  key={`${item.label}-mobile-${index}`}
                  className="px-12 py-3 text-[#555555]"
                  item={item}
                  onClick={() => runtime.setMobileMenuOpen(false)}
                />
              ))}

            {!!runtime.clientUser && (
              <>
                <LocalizedLink
                  className="flex items-center gap-3 px-5 py-3 text-[#1F1F1F]"
                  href="/member-center/favorites"
                  onClick={() => runtime.setMobileMenuOpen(false)}
                >
                  <Heart className="h-5 w-5 text-[#666666]" />
                  <span>{t("Favorites")}</span>
                </LocalizedLink>
                <LocalizedLink
                  className="flex items-center gap-3 px-5 py-3 text-[#1F1F1F]"
                  href="/member-center/history"
                  onClick={() => runtime.setMobileMenuOpen(false)}
                >
                  <Footprints className="h-5 w-5 text-[#666666]" />
                  <span>{t("Browsing history")}</span>
                </LocalizedLink>
                <LocalizedLink
                  className="flex items-center gap-3 px-5 py-3 text-[#1F1F1F]"
                  href="/member-center/purchase-orders"
                  onClick={() => runtime.setMobileMenuOpen(false)}
                >
                  <ClipboardList className="h-5 w-5 text-[#666666]" />
                  <NavMenuLabelWithBadge
                    badgeCount={getNavMenuBadgeCount(
                      "daigouOrder",
                      runtime.qtyInfo,
                    )}
                    label={t("Orders")}
                  />
                </LocalizedLink>
                <LocalizedLink
                  className="flex items-center gap-3 px-5 py-3 text-[#1F1F1F]"
                  href="/member-center/warehouse"
                  onClick={() => runtime.setMobileMenuOpen(false)}
                >
                  <Building2 className="h-5 w-5 text-[#666666]" />
                  <NavMenuLabelWithBadge
                    badgeCount={getNavMenuBadgeCount(
                      "warehouse",
                      runtime.qtyInfo,
                    )}
                    label={t("Warehouse")}
                  />
                </LocalizedLink>
                <LocalizedLink
                  className="flex items-center gap-3 px-5 py-3 text-[#1F1F1F]"
                  href="/member-center/shipments"
                  onClick={() => runtime.setMobileMenuOpen(false)}
                >
                  <Package className="h-5 w-5 text-[#666666]" />
                  <span>{t("Parcels")}</span>
                </LocalizedLink>
                <LocalizedLink
                  className="flex items-center gap-3 px-5 py-3 text-[#1F1F1F]"
                  href="/member-center/inquiries"
                  onClick={() => runtime.setMobileMenuOpen(false)}
                >
                  <MessageCircle className="h-5 w-5 text-[#666666]" />
                  <NavMenuLabelWithBadge
                    badgeCount={getNavMenuBadgeCount(
                      "consult",
                      runtime.qtyInfo,
                    )}
                    label={t("Messages")}
                  />
                </LocalizedLink>
                <LocalizedLink
                  className="flex items-center gap-3 px-5 py-3 text-[#1F1F1F]"
                  href="/member-center/wallet"
                  onClick={() => runtime.setMobileMenuOpen(false)}
                >
                  <Wallet className="h-5 w-5 text-[#666666]" />
                  <span>{t("Wallet")}</span>
                </LocalizedLink>
                <LocalizedLink
                  className="flex items-center gap-3 px-5 py-3 text-[#1F1F1F]"
                  href="/member-center/profile"
                  onClick={() => runtime.setMobileMenuOpen(false)}
                >
                  <User className="h-5 w-5 text-[#666666]" />
                  <span>{t("My Account")}</span>
                </LocalizedLink>
                <button
                  type="button"
                  className="flex items-center gap-3 px-5 py-3 text-start text-[#1F1F1F]"
                  onClick={() => runtime.setLogoutDialogOpen(true)}
                >
                  <LogOut className="h-5 w-5 text-[#666666]" />
                  <span>{t("Logout")}</span>
                </button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={runtime.categorySheetOpen}
        onOpenChange={runtime.setCategorySheetOpen}
      >
        <SheetContent
          side="left"
          className="w-[min(340px,88vw)] overflow-y-auto bg-white p-0 [&>button]:top-4"
        >
          <div className="border-b px-5 py-4">
            <div className="text-lg font-semibold text-[#111111]">
              {t("ALL Categories")}
            </div>
          </div>
          <div className="flex flex-col py-2">
            {runtime.visibleCategories.map((item) => (
              <LocalizedLink
                key={item.id}
                className="flex items-center justify-between px-5 py-3 text-[#1F1F1F]"
                href={getCategoryHref(item)}
                onClick={() => runtime.setCategorySheetOpen(false)}
              >
                <span>{item.name}</span>
                <ChevronRight className="h-4 w-4 text-[#9A9A9A]" />
              </LocalizedLink>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={runtime.localeSheetOpen}
        onOpenChange={(open) => {
          runtime.setLocaleSheetOpen(open);
          if (open) {
            runtime.prepareLocaleSelection();
          }
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-[24px] bg-white p-6 md:max-h-[80vh]"
        >
          <SheetHeader className="mb-4">
            <SheetTitle>{t("Language / Currency")}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-sm font-medium text-[#444444]">
                {t("Language")}
              </div>
              <Select
                value={runtime.pendingLanguage}
                onValueChange={runtime.setPendingLanguage}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("Select language")} />
                </SelectTrigger>
                <SelectContent>
                  {runtime.publishedLanguages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.flag} {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-[#444444]">
                {t("Currency")}
              </div>
              <Select
                value={runtime.pendingCurrency}
                onValueChange={runtime.setPendingCurrency}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("Select currency")} />
                </SelectTrigger>
                <SelectContent>
                  {runtime.rateList.map(({ code, symbol }) => (
                    <SelectItem key={code} value={code}>
                      {code} {symbol && code !== symbol ? `(${symbol})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button
              type="button"
              className="w-full rounded-full px-4 py-3 text-sm font-semibold text-white"
              style={{ background: "var(--primary)" }}
              onClick={() => runtime.saveLocaleSelection("sheet")}
            >
              {t("Save")}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <StorefrontLogoutDialog
        open={runtime.logoutDialogOpen}
        onOpenChange={runtime.setLogoutDialogOpen}
        title={t("Logout")}
        description={t("Are you sure you want to logout?")}
        cancel={t("Cancel")}
        confirm={t("Logout")}
      />
    </>
  );
}
