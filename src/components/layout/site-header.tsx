"use client";
import { AccountAvatar } from "@/components/account-avatar";
import { LocalizedLink } from "@/components/localized-link";
import { HeaderTopAds } from "@/components/layout/header-top-ads";
import { getCategoryHref } from "@/lib/store/category";
import {
  CategoryLink,
  CommerceHeaderMobileBar,
  CommerceHeaderSharedSheets,
  isRouteActive,
  MenuLink,
  useCommerceHeaderRuntime,
  type CommerceHeaderProps,
  type CommerceHeaderRuntimeProps,
} from "@/components/layout/commerce-header-shared";
import { ResponsiveContentFrame } from "@/components/layout/responsive-content-frame";
import {
  DropdownMenu,
  DropdownMenuArrow,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getNavMenuBadgeCount,
  NavMenuLabelWithBadge,
} from "@/components/nav-menu-badge";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Globe,
  LayoutGrid,
  Search,
  ShoppingCart,
} from "lucide-react";
import { useTranslations as useUiTranslations } from "next-intl";
type MarketplaceHeaderProps = CommerceHeaderProps;
const HEADER_SETTINGS: MarketplaceHeaderProps = {
  logoLink: "/",
  topAdsAutoPlayInterval: 5,
  topNavItems: [
    { label: "Home", path: "/" },
    { label: "Forwarding", path: "/forwarding" },
    { label: "Fill&buy", path: "/fill-and-buy" },
    { label: "Help Center", path: "/help-center" },
  ],
  showHomeCategoryStrip: true,
};

type MarketplaceHeaderViewProps = CommerceHeaderRuntimeProps;
export function SiteHeader() {
  const props: MarketplaceHeaderViewProps = HEADER_SETTINGS;

  const translateUi = useUiTranslations();

  const { runtime, bindHeader, bindFileInput, bindCategoryScroll } =
    useCommerceHeaderRuntime(props);
  return (
    <>
      <HeaderTopAds
        items={props.topAdsItems || []}
        autoPlayInterval={props.topAdsAutoPlayInterval || 5}
      />
      <header
        ref={bindHeader}
        data-header-sticky
        className="sticky z-50 w-full"
        style={runtime.headerStyle}
      >
        <CommerceHeaderMobileBar
          bindFileInput={bindFileInput}
          props={props}
          runtime={runtime}
          variant="primary"
        />

        <div className="bg-primary hidden w-full lg:block">
          <ResponsiveContentFrame className="flex items-center justify-between gap-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <LocalizedLink className="shrink-0" href={props.logoLink || "/"}>
                {!!runtime.logo?.url && (
                  <img
                    alt={runtime.logo.alt || "Logo"}
                    className="object-contain"
                    src={runtime.logo.url}
                    style={{
                      width: runtime.logo.width
                        ? `${Math.min(runtime.logo.width, 130)}px`
                        : "auto",
                      height: runtime.logo.height
                        ? `${runtime.logo.height}px`
                        : "auto",
                      maxWidth: "130px",
                    }}
                  />
                )}
              </LocalizedLink>

              <div className="flex items-center gap-1">
                {(props.topNavItems || []).map((item, index) => {
                  const active = isRouteActive(runtime.actualPath, item.path);
                  return (
                    <MenuLink
                      key={`${item.label}-${index}`}
                      className={
                        active
                          ? "rounded-full bg-[#111111] px-4 py-1 text-base font-semibold whitespace-nowrap text-white transition-colors hover:bg-white/15 rtl:px-3 rtl:text-sm"
                          : "rounded-full px-4 py-1 text-base font-semibold whitespace-nowrap text-white transition-colors hover:bg-white/15 rtl:px-3 rtl:text-sm"
                      }
                      item={item}
                    />
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              <button
                type="button"
                className="hidden rounded-full text-white transition-colors hover:bg-white/15 lg:inline-flex lg:p-2"
                onClick={() => runtime.setSearchDrawerOpen(true)}
              >
                <Search className="h-6 w-6" />
              </button>

              <div
                className="hidden lg:block"
                onMouseEnter={runtime.openLocalePopover}
                onMouseLeave={runtime.scheduleLocalePopoverClose}
              >
                <Popover
                  open={runtime.localePopoverOpen}
                  onOpenChange={(open) => {
                    if (open) runtime.prepareLocaleSelection();
                    runtime.setLocalePopoverOpen(open);
                  }}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={(event) => {
                        // Hover may already have opened the menu before the click.
                        event.preventDefault();
                        runtime.openLocalePopover();
                      }}
                      className="flex items-center gap-2 rounded-full px-3 py-2 text-sm text-white/95 transition-colors outline-none hover:bg-white/15 focus-visible:bg-white/15 focus-visible:outline-none"
                    >
                      <Globe className="h-5 w-5" />
                      <bdi className="whitespace-nowrap">
                        {runtime.localeSummary}
                      </bdi>
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    sideOffset={8}
                    className="rounded-lg border border-[#E5E7EB] bg-white p-5 text-sm shadow-none"
                    style={{
                      minWidth: "150px",
                      width: "auto",
                      maxWidth: "min(560px, calc(100vw - 32px))",
                    }}
                    onMouseEnter={runtime.openLocalePopover}
                    onMouseLeave={runtime.scheduleLocalePopoverClose}
                  >
                    <PopoverArrow
                      className="fill-white"
                      width={14}
                      height={7}
                    />
                    <div className="max-h-[calc(100vh-64px)] space-y-5 overflow-y-auto">
                      <div>
                        <div className="mb-3 text-sm font-semibold text-[#333333]">
                          {translateUi.raw("Language")}
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                          {runtime.publishedLanguages.map((lang) => {
                            const selected =
                              runtime.pendingLanguage === lang.code;
                            return (
                              <button
                                key={lang.code}
                                type="button"
                                className="min-h-9 min-w-[100px] rounded-full border px-3 text-sm font-medium transition-colors outline-none focus-visible:opacity-80 focus-visible:outline-none"
                                style={
                                  selected
                                    ? {
                                        background: "var(--primary)",
                                        borderColor: "var(--primary)",
                                        color: "#ffffff",
                                      }
                                    : {
                                        borderColor: "#D9D9D9",
                                        color: "#333333",
                                      }
                                }
                                onClick={() =>
                                  runtime.setPendingLanguage(lang.code)
                                }
                              >
                                {lang.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <div className="mb-3 text-sm font-semibold text-[#333333]">
                          {translateUi.raw("Currency")}
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                          {runtime.rateList.map(({ code }) => {
                            const selected = runtime.pendingCurrency === code;
                            return (
                              <button
                                key={code}
                                type="button"
                                className="min-h-9 min-w-[100px] rounded-full border px-3 text-sm font-medium transition-colors outline-none focus-visible:opacity-80 focus-visible:outline-none"
                                style={
                                  selected
                                    ? {
                                        background: "var(--primary)",
                                        borderColor: "var(--primary)",
                                        color: "#ffffff",
                                      }
                                    : {
                                        borderColor: "#D9D9D9",
                                        color: "#333333",
                                      }
                                }
                                onClick={() => runtime.setPendingCurrency(code)}
                              >
                                {code}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="mx-auto block min-h-10 w-[min(240px,100%)] rounded-full px-6 text-sm font-semibold text-white outline-none focus-visible:opacity-80 focus-visible:outline-none"
                        style={{ background: "var(--primary)" }}
                        onClick={() => runtime.saveLocaleSelection("popover")}
                      >
                        {translateUi.raw("Save")}
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <LocalizedLink
                className="relative rounded-full p-2 text-white transition-colors hover:bg-white/15"
                href="/cart"
              >
                {runtime.cartCount > 0 && (
                  <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-[var(--primary)]">
                    {runtime.cartCount > 99 ? "99+" : runtime.cartCount}
                  </span>
                )}
                <ShoppingCart className="h-6 w-6" />
              </LocalizedLink>

              <div className="hidden shrink-0 lg:flex lg:items-center lg:gap-2">
                {runtime.clientUser ? (
                  <div
                    className="shrink-0"
                    onMouseEnter={runtime.openAvatarMenu}
                    onMouseLeave={runtime.scheduleAvatarMenuClose}
                  >
                    <DropdownMenu
                      modal={false}
                      open={runtime.avatarMenuOpen}
                      onOpenChange={runtime.setAvatarMenuOpen}
                    >
                      <DropdownMenuTrigger asChild>
                        <button
                          aria-label={runtime.userDisplayName}
                          type="button"
                          className="rounded-full transition-[filter] outline-none focus-visible:brightness-90 focus-visible:outline-none"
                        >
                          <AccountAvatar
                            className="h-9 w-9 text-base"
                            name={runtime.avatarName}
                            email={runtime.clientUser.email}
                            src={runtime.clientUser.avatar}
                          />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        sideOffset={8}
                        className="relative overflow-visible bg-white shadow-none"
                        onMouseEnter={runtime.openAvatarMenu}
                        onMouseLeave={runtime.scheduleAvatarMenuClose}
                      >
                        <DropdownMenuArrow
                          className="fill-white"
                          width={14}
                          height={7}
                        />
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <LocalizedLink
                            className="flex w-full cursor-pointer items-center justify-between gap-2"
                            href="/member-center/purchase-orders"
                          >
                            <NavMenuLabelWithBadge
                              badgeCount={getNavMenuBadgeCount(
                                "daigouOrder",
                                runtime.qtyInfo,
                              )}
                              label={translateUi.raw("Orders")}
                            />
                          </LocalizedLink>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <LocalizedLink
                            className="flex w-full cursor-pointer items-center justify-between gap-2"
                            href="/member-center/warehouse"
                          >
                            <NavMenuLabelWithBadge
                              badgeCount={getNavMenuBadgeCount(
                                "warehouse",
                                runtime.qtyInfo,
                              )}
                              label={translateUi.raw("Warehouse")}
                            />
                          </LocalizedLink>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <LocalizedLink
                            className="w-full cursor-pointer"
                            href="/member-center/wallet"
                          >
                            {translateUi.raw("Wallet")}
                          </LocalizedLink>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => runtime.setLogoutDialogOpen(true)}
                        >
                          {translateUi.raw("Logout")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ) : (
                  <>
                    <LocalizedLink
                      className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-[var(--primary)]"
                      href="/login"
                    >
                      {translateUi.raw("Login")}
                    </LocalizedLink>
                    <LocalizedLink
                      className="rounded-full border border-white px-5 py-2 text-sm font-semibold text-white"
                      href="/register"
                    >
                      {translateUi.raw("Sign Up")}
                    </LocalizedLink>
                  </>
                )}
              </div>
            </div>
          </ResponsiveContentFrame>
        </div>

        {props.showHomeCategoryStrip !== false &&
          runtime.isHomePage &&
          runtime.visibleCategories.length > 0 && (
            <div
              className="relative hidden bg-black lg:block"
              onMouseLeave={() => runtime.setCategoryMegaOpen(false)}
            >
              <ResponsiveContentFrame className="flex items-center gap-3 py-2">
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm font-semibold text-white md:hidden"
                  onClick={() => runtime.setCategorySheetOpen(true)}
                >
                  <LayoutGrid className="h-4 w-4" />
                  <span>{translateUi.raw("ALL Categories")}</span>
                </button>
                <button
                  type="button"
                  className="hidden shrink-0 items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20 md:inline-flex"
                  onMouseEnter={() => {
                    runtime.setActiveCategoryIndex((current) =>
                      current < runtime.visibleCategories.length ? current : 0,
                    );
                    runtime.setCategoryMegaOpen(true);
                  }}
                  onClick={() => {
                    runtime.setActiveCategoryIndex((current) =>
                      current < runtime.visibleCategories.length ? current : 0,
                    );
                    runtime.setCategoryMegaOpen(true);
                  }}
                >
                  <LayoutGrid className="h-4 w-4" />
                  <span>{translateUi.raw("ALL Categories")}</span>
                </button>
                <div
                  ref={bindCategoryScroll}
                  className="hide-scrollbar flex min-w-0 flex-1 gap-8 overflow-x-auto"
                >
                  {runtime.visibleCategories.map((item) => (
                    <CategoryLink key={item.id} category={item} />
                  ))}
                </div>
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    aria-label={translateUi.raw("Scroll categories to start")}
                    className="flex h-8 w-7 items-center justify-center rounded-md text-white transition-colors hover:bg-white/15 disabled:cursor-default disabled:opacity-35"
                    disabled={!runtime.categoryCanScrollLeft}
                    onClick={() => runtime.scrollCategories("start")}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label={translateUi.raw("Scroll categories to end")}
                    className="flex h-8 w-7 items-center justify-center rounded-md text-white transition-colors hover:bg-white/15 disabled:cursor-default disabled:opacity-35"
                    disabled={!runtime.categoryCanScrollRight}
                    onClick={() => runtime.scrollCategories("end")}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </ResponsiveContentFrame>
              {runtime.categoryMegaOpen && (
                <>
                  <button
                    type="button"
                    aria-label={translateUi.raw("Close categories")}
                    className="fixed inset-x-0 bottom-0 z-40 hidden cursor-default bg-black/35 md:block"
                    style={{ top: runtime.categoryBackdropTop }}
                    onClick={() => runtime.setCategoryMegaOpen(false)}
                  />
                  <div className="absolute inset-x-0 top-full z-50 hidden md:block">
                    <ResponsiveContentFrame className="flex max-h-[510px] overflow-hidden rounded-b-xl border border-t-0 border-[#E5E7EB] bg-white text-[#333333]">
                      <div className="hide-scrollbar w-[250px] shrink-0 overflow-y-auto border-e border-[#EEEEEE] py-3">
                        {runtime.visibleCategories.map((category, index) => (
                          <button
                            key={category.id}
                            type="button"
                            className="block w-full truncate px-5 py-3 text-start text-sm transition-colors hover:bg-[#FAFAFA]"
                            style={
                              runtime.activeCategoryIndex === index
                                ? {
                                    background:
                                      "color-mix(in srgb, var(--primary) 7%, white)",
                                    color: "var(--primary)",
                                    fontWeight: 600,
                                  }
                                : undefined
                            }
                            onMouseEnter={() =>
                              runtime.setActiveCategoryIndex(index)
                            }
                            onClick={() =>
                              runtime.setActiveCategoryIndex(index)
                            }
                          >
                            {category.name}
                          </button>
                        ))}
                      </div>
                      <div className="hide-scrollbar min-w-0 flex-1 overflow-y-auto p-6">
                        {runtime.activeCategoryChildren.length > 0 ? (
                          <div className="grid grid-cols-5 gap-x-8 gap-y-7">
                            {runtime.activeCategoryChildren.map((category) => (
                              <div key={category.id} className="min-w-0">
                                <LocalizedLink
                                  className="mb-3 block truncate text-sm font-semibold text-[#333333] hover:text-[var(--primary)]"
                                  href={getCategoryHref(category)}
                                  onClick={() =>
                                    runtime.setCategoryMegaOpen(false)
                                  }
                                >
                                  {category.name}
                                </LocalizedLink>
                                <div className="space-y-2.5">
                                  {category.children.map((child) => (
                                    <LocalizedLink
                                      key={child.id}
                                      className="block truncate text-sm text-[#737373] hover:text-[var(--primary)]"
                                      href={getCategoryHref(child)}
                                      onClick={() =>
                                        runtime.setCategoryMegaOpen(false)
                                      }
                                    >
                                      {child.name}
                                    </LocalizedLink>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : runtime.activeCategory ? (
                          <LocalizedLink
                            className="hover:text-primary text-sm font-semibold text-[#333333]"
                            href={getCategoryHref(runtime.activeCategory)}
                            onClick={() => runtime.setCategoryMegaOpen(false)}
                          >
                            {runtime.activeCategory.name}
                          </LocalizedLink>
                        ) : null}
                      </div>
                    </ResponsiveContentFrame>
                  </div>
                </>
              )}
            </div>
          )}
      </header>

      <CommerceHeaderSharedSheets
        props={props}
        runtime={runtime}
        bindFileInput={bindFileInput}
      />
    </>
  );
}
