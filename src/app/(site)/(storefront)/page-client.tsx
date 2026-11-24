"use client";
import HeroImage from "next/image";
import HeroLink from "next/link";
import { useTranslations } from "next-intl";
import {
  Camera,
  ChevronRight,
  Megaphone,
  Search as SearchIcon,
} from "lucide-react";
import { useProductSearch } from "@/lib/hooks/use-product-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { default as BellIcon } from "@/assets/images/home/bell.svg";
import { LocalizedLink } from "@/components/localized-link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRemoteResource } from "@/hooks/use-remote-resource";
import { LOCALE_HTML_LANG } from "@/lib/locale";
import {
  getProcurementAnnouncement,
  getProcurementAnnouncements,
  searchProducts,
} from "@/lib/procurement/client";
import type { ProcurementAnnouncement } from "@/lib/procurement/types";
import { useLocaleStore } from "@/stores/locale-store";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { HorizontalScroll } from "@/components/ui/horizontal-scroll";
import { purchaseProductHref } from "@/lib/procurement/purchase";
import { usePriceConvert } from "@/lib/store/common";
import { Skeleton } from "@/components/ui/skeleton";
import { useCategoryProductFeed } from "./hooks/use-category-product-feed";
interface PromotionImage {
  image: string;
  alt: string;
  link?: string;
}
const heroPlatforms = ["Taobao", "1688", "Weidian"] as const;
const PHONE_CASE_KEYWORD = "Phone Case";
const AnnouncementDETAIL_BASE_PATH = "/help-center/info";
const AnnouncementINDEX_ANNOUNCEMENT_SEEN_UNIQUE_ID_KEY =
  "announcement-bar2-index-seen-unique-id";
function announcementReadSeenIndexAnnouncementUniqueId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(
      AnnouncementINDEX_ANNOUNCEMENT_SEEN_UNIQUE_ID_KEY,
    );
  } catch {
    return null;
  }
}
function announcementSaveSeenIndexAnnouncementUniqueId(uniqueId: string) {
  if (typeof window === "undefined" || !uniqueId) return;
  try {
    localStorage.setItem(
      AnnouncementINDEX_ANNOUNCEMENT_SEEN_UNIQUE_ID_KEY,
      uniqueId,
    );
  } catch {
    // ignore quota / private mode
  }
}
type AnnouncementIndexAnnouncement = ProcurementAnnouncement;
interface AnnouncementAnnouncementBar2Props {
  backgroundColor?: string;
  textColor?: string;
  iconSource?: "builtIn" | "custom";
  builtInIcon?: "legacy" | "notice";
  customIcon?: string;
  paddingLeft?: number;
  paddingRight?: number;
  /** 自动切换间隔（秒，编辑器）；存盘值 ≥1000 时仍按历史毫秒解析 */
  autoPlayInterval?: number;
  /** 每页条数 */
  perPage?: number;
}
function announcementStripHtmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
type AnnouncementAnnouncementSlide = {
  id: string;
  line: string;
  href?: string;
};
function AnnouncementIndexAnnouncementDialog({
  announcement,
  open,
  onOpenChange,
}: {
  announcement: AnnouncementIndexAnnouncement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!announcement) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="flex max-h-[88dvh] w-[calc(100vw-2rem)] max-w-[640px] flex-col gap-0 overflow-hidden rounded-3xl border-0 bg-white p-0 shadow-[0_24px_64px_rgba(16,24,40,0.2)] [&>button]:end-4 [&>button]:top-4 [&>button]:z-20 [&>button]:rounded-full [&>button]:bg-white/15 [&>button]:p-2 [&>button]:text-white [&>button]:opacity-100 [&>button]:transition-colors [&>button]:hover:bg-white/25 [&>button>svg]:size-5"
      >
        <div
          className="relative flex h-20 shrink-0 items-center justify-center overflow-hidden sm:h-25"
          style={{
            backgroundColor: "var(--primary)",
            backgroundImage:
              "radial-gradient(circle at 18% -30%, rgba(255,255,255,0.38), transparent 52%), linear-gradient(118deg, color-mix(in srgb, var(--primary) 88%, white), var(--primary) 46%, color-mix(in srgb, var(--primary) 76%, #111827))",
          }}
        >
          <div className="pointer-events-none absolute -end-14 -top-20 size-44 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/20" />
          <BellIcon
            className="relative size-15 text-white sm:size-20"
            aria-hidden="true"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-7 sm:px-8 sm:py-8">
          <div className="mb-6">
            <DialogHeader className="mt-2 gap-0 p-0 text-start">
              <DialogTitle className="text-lg font-bold text-[#333] sm:text-xl">
                {announcement.title || ""}
              </DialogTitle>
            </DialogHeader>
            <div
              className="mt-5 h-1 w-10 rounded-full"
              style={{ backgroundColor: "var(--primary)" }}
            />
          </div>
          {announcement.content ? (
            <p className="text-sm whitespace-pre-wrap text-[#374151] md:text-base">
              {announcement.content}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
function AnnouncementBuiltInAnnouncementIcon({
  icon,
}: {
  icon: AnnouncementAnnouncementBar2Props["builtInIcon"];
}) {
  if (icon === "notice") {
    return (
      <svg
        aria-hidden="true"
        className="text-primary h-6 w-6 shrink-0"
        viewBox="0 0 24 24"
      >
        <use href="/assets/images/home/notice.svg#notice-icon" />
      </svg>
    );
  }
  return <Megaphone className="text-primary h-6 w-6 shrink-0" />;
}
function AnnouncementAnnouncementIcon({
  source,
  builtInIcon,
  customIcon,
}: {
  source: AnnouncementAnnouncementBar2Props["iconSource"];
  builtInIcon: AnnouncementAnnouncementBar2Props["builtInIcon"];
  customIcon: string;
}) {
  if (source === "custom" && customIcon) {
    return (
      <img
        alt=""
        className="h-6 w-6 shrink-0 object-contain"
        src={customIcon}
      />
    );
  }
  return <AnnouncementBuiltInAnnouncementIcon icon={builtInIcon} />;
}
const AnnouncementAnnouncementBar2Defaults: Partial<AnnouncementAnnouncementBar2Props> =
  {
    textColor: "#333333",
    backgroundColor: "#FFFFFF",
    autoPlayInterval: 5,
    perPage: 20,
    iconSource: "builtIn",
    builtInIcon: "legacy",
    customIcon: "",
    paddingLeft: 12,
    paddingRight: 12,
  };
const ANNOUNCEMENT_BAR_LIMIT = 10;
const ANNOUNCEMENT_BAR_CONFIG = {
  ...AnnouncementAnnouncementBar2Defaults,
  textColor: "#333333",
  backgroundColor: "#FFE3E3",
  autoPlayInterval: 5,
  perPage: ANNOUNCEMENT_BAR_LIMIT,
  iconSource: "builtIn" as const,
  builtInIcon: "notice" as const,
  customIcon: "",
  paddingLeft: 0,
  paddingRight: 0,
};
interface CarouselImageCarouselListItem {
  image: string;
  alt: string;
  link?: string;
}
function carouselGetSingleItemScrollAmount(viewport: HTMLDivElement) {
  const first = viewport.querySelector<HTMLElement>(
    "[data-image-carousel-item]",
  );
  const second = first?.nextElementSibling as HTMLElement | null;
  if (first && second)
    return Math.max(second.offsetLeft - first.offsetLeft, first.offsetWidth);
  return first?.offsetWidth || Math.max(viewport.clientWidth * 0.8, 240);
}
function CategoriesCategorySkeletons() {
  const translateUi = useTranslations();
  return (
    <div
      className="flex gap-2 overflow-hidden py-2"
      aria-label={translateUi.raw("Loading categories")}
    >
      {[92, 78, 88, 96, 82, 90, 76].map((width, index) => (
        <Skeleton
          key={index}
          className="h-8 shrink-0 rounded-full lg:h-10"
          style={{ width }}
        />
      ))}
    </div>
  );
}
function CategoriesProductSkeletons({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="min-w-0">
          <Skeleton className="aspect-square w-full rounded-none" />
          <Skeleton className="mt-2 h-2.5 w-full" />
          <Skeleton className="mt-1 h-2.5 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
export default function HomePageClient({
  services,
  promotions,
}: {
  services: ReactNode;
  promotions: PromotionImage[];
}) {
  // 首页搜索
  const heroT = useTranslations();
  const {
    fileInputRef: heroFileInputRef,
    searchKeyword: heroSearchKeyword,
    setSearchKeyword: heroSetSearchKeyword,
    handleSearch: heroHandleSearch,
    handleImageUpload: heroHandleImageUpload,
    handleFileChange: heroHandleFileChange,
    imageUploading: heroImageUploading,
  } = useProductSearch();
  // 公告
  const {
    backgroundColor: announcementBackgroundColor,
    textColor: announcementTextColor,
    autoPlayInterval: announcementAutoPlayInterval,
    perPage: announcementPerPage,
    iconSource: announcementIconSource,
    builtInIcon: announcementBuiltInIcon,
    customIcon: announcementCustomIcon,
    paddingLeft: announcementPaddingLeft,
    paddingRight: announcementPaddingRight,
  }: {
    backgroundColor: string;
    textColor: string;
    autoPlayInterval: number;
    perPage: number;
    iconSource: AnnouncementAnnouncementBar2Props["iconSource"];
    builtInIcon: AnnouncementAnnouncementBar2Props["builtInIcon"];
    customIcon: string;
    paddingLeft: number;
    paddingRight: number;
  } = ANNOUNCEMENT_BAR_CONFIG;
  const announcementTranslateUi = useTranslations();
  const language = useLocaleStore((state) => LOCALE_HTML_LANG[state.locale]);
  const [announcementItems, announcementSetItems] = useState<
    ProcurementAnnouncement[]
  >([]);
  const [announcementSlidePosition, announcementSetIndex] = useState(0);
  const [announcementIndexAnnouncement, announcementSetIndexAnnouncement] =
    useState<AnnouncementIndexAnnouncement | null>(null);
  const [
    announcementIndexAnnouncementOpen,
    announcementSetIndexAnnouncementOpen,
  ] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const announcements = await getProcurementAnnouncements(
          1,
          announcementPerPage,
          language,
        );
        if (!active) return;
        announcementSetItems(announcements.slice(0, ANNOUNCEMENT_BAR_LIMIT));
        const pinned = announcements.find((item) => item.pinned);
        if (!pinned) return;
        const seenUniqueId = announcementReadSeenIndexAnnouncementUniqueId();
        if (seenUniqueId && seenUniqueId === pinned.id) return;
        const popup = pinned.content
          ? pinned
          : await getProcurementAnnouncement(pinned.id, language);
        if (!active) return;
        announcementSetIndexAnnouncement(popup);
        announcementSetIndexAnnouncementOpen(true);
      } catch (error) {
        if (active) announcementSetItems([]);
        console.error("Failed to load announcements:", error);
      }
    })();
    return () => {
      active = false;
    };
  }, [announcementPerPage, language]);
  const announcementHandleIndexAnnouncementOpenChange = useCallback(
    (open: boolean) => {
      announcementSetIndexAnnouncementOpen(open);
      if (!open && announcementIndexAnnouncement) {
        announcementSaveSeenIndexAnnouncementUniqueId(
          announcementIndexAnnouncement.id,
        );
      }
    },
    [announcementIndexAnnouncement],
  );
  const announcementSlides: AnnouncementAnnouncementSlide[] = useMemo(() => {
    return announcementItems.slice(0, ANNOUNCEMENT_BAR_LIMIT).map((item) => ({
      id: String(item.id),
      line: announcementStripHtmlToText(String(item.title ?? "")),
      href: `${AnnouncementDETAIL_BASE_PATH}?type=notice&id=${item.id}`,
    }));
  }, [announcementItems]);
  const announcementIndex =
    announcementSlides.length === 0
      ? 0
      : announcementSlidePosition % announcementSlides.length;
  const announcementIntervalMs =
    announcementAutoPlayInterval >= 1000
      ? announcementAutoPlayInterval
      : announcementAutoPlayInterval * 1000;
  useEffect(() => {
    if (announcementSlides.length <= 1) return;
    const t = window.setInterval(() => {
      announcementSetIndex((i) => (i + 1) % announcementSlides.length);
    }, announcementIntervalMs);
    return () => clearInterval(t);
  }, [announcementSlides.length, announcementIntervalMs]);
  const announcementCurrentSlide = announcementSlides[announcementIndex];
  const announcementCurrentHref = announcementCurrentSlide?.href;
  // 推广轮播
  const carouselItems = promotions;
  const loadPhoneCases = useCallback(
    () =>
      searchProducts({
        channel: "1688",
        keyword: PHONE_CASE_KEYWORD,
        page: 1,
        page_size: 12,
        language,
      }),
    [language],
  );
  const phoneCases = useRemoteResource(language, loadPhoneCases);
  // 分类商品
  const categoriesTranslateUi = useTranslations();
  const categoriesSeeMoreText = categoriesTranslateUi.raw("View More");
  const categoriesFeed = useCategoryProductFeed(20);
  const categoriesPriceConvert = usePriceConvert();
  const categoriesCategoryContent = categoriesFeed.categoriesLoading ? (
    <CategoriesCategorySkeletons />
  ) : (
    <HorizontalScroll
      scrollAmount={200}
      contentClassName="min-w-max gap-2 py-2"
      arrowClassName="size-6 bg-white hover:bg-white [&_svg]:size-3.5 [&_svg]:text-[#333333]"
    >
      {categoriesFeed.categories.map((category) => {
        const active = categoriesFeed.currentCategory === category.id;
        return (
          <button
            type="button"
            key={category.id}
            onClick={() => categoriesFeed.setCurrentCategory(category.id)}
            className={`inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors lg:min-h-10 lg:px-4 lg:text-base ${
              active
                ? "bg-primary text-white"
                : "bg-[#ececec] text-[#333333] hover:bg-[#dddddd]"
            }`}
          >
            {category.name}
          </button>
        );
      })}
    </HorizontalScroll>
  );
  const heroContent = (() => {
    return (
      <section className="home-search-hero relative isolate overflow-hidden text-white">
        {/* Soft glow that lifts the illustration off the flat red. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -end-48 top-1/2 -z-10 hidden size-[760px] -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,196,140,0.32),transparent)] lg:block"
        />
        <div className="site-container grid grid-cols-1 items-center gap-10 py-6 md:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:py-14">
          <div className="min-w-0">
            <h1 className="text-[clamp(24px,calc(10px+2.6vw),52px)] leading-[1.1] font-extrabold tracking-tight">
              {heroT("Shop the World")}
              <span className="text-hero-highlight block">
                {heroT("Start Here")}
              </span>
            </h1>
            <p className="mt-3 text-[clamp(13px,calc(10px+0.5vw),19px)] text-white/85 md:mt-4">
              {heroT("Buy from China & worldwide delivery")}
            </p>
            <form
              className="mt-6 max-w-[640px] rounded-full bg-white p-1 shadow-[0_14px_36px_rgba(90,0,0,0.28)] md:mt-8 md:p-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                heroHandleSearch(heroSearchKeyword);
              }}
            >
              <div className="flex items-center gap-1">
                <input
                  ref={heroFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={heroHandleFileChange}
                />
                <Input
                  className="h-10 min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 ps-4 text-sm text-[#2a2a2a] shadow-none placeholder:text-[#b5b5b5] focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0 md:h-12 md:ps-6 md:text-base"
                  aria-label={heroT("Enter product name/link")}
                  placeholder={heroT("Enter product name/link")}
                  value={heroSearchKeyword}
                  onChange={(event) => heroSetSearchKeyword(event.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="hover:text-primary size-10 shrink-0 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200/70 md:size-11"
                  aria-label={heroT("Upload image to search")}
                  onClick={heroHandleImageUpload}
                  disabled={heroImageUploading}
                >
                  {heroImageUploading ? (
                    <Spinner className="size-5 md:size-6" />
                  ) : (
                    <Camera className="size-5 md:size-6" />
                  )}
                </Button>
                <Button
                  type="submit"
                  aria-label={heroT("Search")}
                  className="size-10 shrink-0 rounded-full p-0 text-sm font-semibold sm:w-auto sm:px-6 md:h-12 md:px-9 md:text-base"
                >
                  {/* Icon-only on phones so the input keeps its width. */}
                  <SearchIcon className="size-5 sm:hidden" />
                  <span className="hidden sm:inline">{heroT("Search")}</span>
                </Button>
              </div>
            </form>
            {/* One line on every width: names collapse to icons on phones and
                the freight label truncates rather than wrapping. */}
            <div className="mt-5 flex items-center gap-3 text-xs text-white/90 md:mt-6 md:gap-5 md:text-sm">
              <ul className="flex shrink-0 items-center gap-2 md:gap-3">
                {heroPlatforms.map((platform) => (
                  <li
                    key={platform}
                    className="inline-flex items-center gap-1.5"
                  >
                    <HeroImage
                      width={20}
                      height={20}
                      alt={heroT(platform)}
                      src={`/assets/images/home/${platform.toLowerCase()}-white.png`}
                      className="size-5"
                    />
                    <span aria-hidden className="hidden sm:inline">
                      {heroT(platform)}
                    </span>
                  </li>
                ))}
              </ul>
              <span aria-hidden className="h-4 w-px shrink-0 bg-white/30" />
              <HeroLink
                href="/freight-estimation"
                className="group inline-flex min-w-0 items-center gap-1.5 font-semibold text-white"
              >
                <HeroImage
                  width={16}
                  height={16}
                  alt=""
                  className="size-3.5 shrink-0 md:size-4"
                  src="/assets/images/home/fe.png"
                />
                <span className="truncate underline-offset-4 group-hover:underline">
                  {heroT("Freight Estimator")}
                </span>
                <ChevronRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
              </HeroLink>
            </div>
          </div>
          <div className="hidden justify-center lg:flex">
            <HeroImage
              width={942}
              height={720}
              alt={heroT("Start Here")}
              src="/assets/images/home/banner.png"
              className="h-auto max-h-[380px] w-auto max-w-full object-contain drop-shadow-[0_24px_36px_rgba(90,0,0,0.3)]"
              priority
            />
          </div>
        </div>
      </section>
    );
  })();
  const announcementContent =
    announcementSlides.length === 0
      ? null
      : (() => {
          return (
            <div>
              <AnnouncementIndexAnnouncementDialog
                announcement={announcementIndexAnnouncement}
                open={announcementIndexAnnouncementOpen}
                onOpenChange={announcementHandleIndexAnnouncementOpenChange}
              />
              <div
                className="relative w-full overflow-hidden rounded-md py-2 text-sm"
                style={{
                  backgroundColor: announcementBackgroundColor,
                  paddingInlineStart: announcementPaddingLeft,
                  paddingInlineEnd: announcementPaddingRight,
                }}
              >
                <div
                  className="relative z-10 flex items-center justify-between gap-2 md:gap-0"
                  style={{ color: announcementTextColor }}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <AnnouncementAnnouncementIcon
                      source={announcementIconSource}
                      builtInIcon={announcementBuiltInIcon}
                      customIcon={announcementCustomIcon}
                    />
                    <div className="h-5 min-w-0 flex-1 overflow-hidden">
                      <div
                        className="flex flex-col transition-transform duration-500 ease-out motion-reduce:transition-none"
                        style={{
                          transform: `translateY(calc(-${announcementIndex} * 1.25rem))`,
                        }}
                      >
                        {announcementSlides.map((slide) => (
                          <div
                            key={slide.id}
                            className="flex h-5 max-h-5 min-h-5 shrink-0 items-center"
                          >
                            {slide.href ? (
                              <LocalizedLink
                                href={slide.href}
                                className="block w-full min-w-0 truncate transition-opacity hover:opacity-90"
                                aria-label={slide.line}
                              >
                                {slide.line}
                              </LocalizedLink>
                            ) : (
                              <span className="block w-full min-w-0 truncate">
                                {slide.line}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {announcementCurrentHref ? (
                    <LocalizedLink
                      href={announcementCurrentHref}
                      className="shrink-0 rounded p-0.5 transition-opacity hover:opacity-80"
                      aria-label={announcementTranslateUi.raw(
                        "View announcement",
                      )}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </LocalizedLink>
                  ) : (
                    <span className="shrink-0 opacity-50" aria-hidden>
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })();
  const carouselContent = (() => {
    return (
      <HorizontalScroll
        autoScroll
        autoScrollInterval={3500}
        pauseAutoScrollOnHover
        scrollAmount={carouselGetSingleItemScrollAmount}
        contentClassName="items-stretch gap-3"
        arrowClassName="size-7 bg-[#101010]/35 shadow-none hover:bg-[#101010]/45"
        viewportClassName="-mx-0"
      >
        {carouselItems.map((item, index) => {
          const image = (
            <img
              src={item.image}
              alt={item.alt}
              className="h-full w-full object-cover"
            />
          );
          return (
            <div
              className="aspect-[2.5/1] w-[220px] shrink-0 overflow-hidden rounded-[8px] lg:w-[340px]"
              data-image-carousel-item
              key={`${item.image}-${index}`}
            >
              {item.link ? (
                <HeroLink className="block h-full w-full" href={item.link}>
                  {image}
                </HeroLink>
              ) : (
                image
              )}
            </div>
          );
        })}
      </HorizontalScroll>
    );
  })();
  const phoneCaseContent = (() => {
    if (phoneCases.loading) {
      return (
        <div className="bg-white">
          <Skeleton className="mb-2.5 h-[30px] w-44 rounded" />
          <div className="flex gap-2 overflow-hidden lg:gap-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton
                key={index}
                className="aspect-square w-20 shrink-0 rounded-lg lg:w-[180px]"
              />
            ))}
          </div>
        </div>
      );
    }
    const products = phoneCases.data?.items ?? [];
    if (products.length === 0) return null;
    return (
      <div className="bg-white">
        <div className="mb-2.5 flex items-center gap-2">
          <img
            alt=""
            aria-hidden="true"
            className="h-5 w-5 shrink-0 object-contain md:h-[30px] md:w-[30px]"
            src="/assets/images/home/bag.png"
          />
          <h2 className="text-sm font-bold text-[#2F2F2F] lg:text-2xl">
            {PHONE_CASE_KEYWORD}
          </h2>
        </div>

        <HorizontalScroll
          autoScroll
          autoScrollInterval={3500}
          pauseAutoScrollOnHover
          contentClassName="gap-2 lg:gap-3"
          arrowClassName="size-6 md:size-8 bg-[#101010]/30 shadow-none hover:bg-[#101010]/40"
        >
          {products.map(({ id, imageUrl, title }) => {
            const card = (
              <div
                className="aspect-square w-20 shrink-0 overflow-hidden rounded-lg bg-[#F2F2F2] lg:w-[180px]"
                key={id}
              >
                {imageUrl ? (
                  <img
                    alt={title}
                    className="h-full w-full object-contain"
                    referrerPolicy="no-referrer"
                    src={imageUrl}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-3 text-center text-xs text-[#9CA3AF]">
                    {heroT.raw("No image")}
                  </div>
                )}
              </div>
            );
            return (
              <HeroLink
                href={purchaseProductHref("1688", String(id), title)}
                key={id}
              >
                {card}
              </HeroLink>
            );
          })}
        </HorizontalScroll>
      </div>
    );
  })();
  const categoriesContent = (() => {
    return (
      <section>
        {categoriesCategoryContent}

        <div className="pt-2">
          {categoriesFeed.categoriesLoading || categoriesFeed.loading ? (
            <CategoriesProductSkeletons count={10} />
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-4 lg:grid-cols-5">
              {categoriesFeed.items.map((product) => {
                const { imageUrl, title, id, price } = product;
                const card = (
                  <article className="min-w-0 transition-transform duration-300 ease-out hover:z-10 hover:-translate-y-[6px] hover:scale-[1.03]">
                    <div className="aspect-square overflow-hidden">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={title}
                          className="h-full w-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-gray-400">
                          {categoriesTranslateUi.raw("No image available")}
                        </div>
                      )}
                    </div>
                    <h3 className="mt-2 line-clamp-2 min-h-8 text-xs text-[#333333] lg:min-h-12 lg:text-base">
                      {title}
                    </h3>
                    {price !== undefined && (
                      <div className="text-primary mt-1 text-sm font-bold lg:text-base">
                        <bdi dir="ltr">
                          {categoriesPriceConvert(price, {
                            useSymbol: true,
                            needFormat: true,
                          })}
                        </bdi>
                      </div>
                    )}
                  </article>
                );
                return (
                  <HeroLink
                    key={id}
                    href={purchaseProductHref("1688", String(id), title)}
                    className="block min-w-0"
                  >
                    {card}
                  </HeroLink>
                );
              })}
            </div>
          )}
        </div>

        {categoriesFeed.hasMore && (
          <div className="relative mt-5 flex justify-center">
            <button
              type="button"
              onClick={categoriesFeed.loadMore}
              disabled={categoriesFeed.loadingMore}
              className="bg-primary relative rounded-full px-5 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {categoriesFeed.loadingMore ? (
                <>
                  <span className="invisible">{categoriesSeeMoreText}</span>
                  <Spinner
                    aria-label={categoriesTranslateUi.raw("Load more products")}
                    className="absolute start-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                  />
                </>
              ) : (
                categoriesSeeMoreText
              )}
            </button>
          </div>
        )}
      </section>
    );
  })();
  return (
    <>
      {heroContent}
      {announcementContent ? (
        <section className="bg-announcement m-[0px] rounded-[0px] p-[0px]">
          <div className="site-container">{announcementContent}</div>
        </section>
      ) : null}
      <div className="site-container">
        <section className="m-[10px_0px_0px] rounded-[0px] p-[0px] lg:m-[16px_0px_0px]">
          {carouselContent}
          {phoneCaseContent && (
            <section className="bg-card m-[8px_0px_0px] rounded-[8px] p-[8px] lg:rounded-[16px] lg:p-[16px]">
              {phoneCaseContent}
            </section>
          )}
          {(categoriesFeed.categoriesLoading ||
            categoriesFeed.categories.length > 0) && (
            <section className="bg-card m-[8px_0px_0px] rounded-[8px] p-[8px] lg:m-[30px_0px_0px] lg:rounded-[16px] lg:p-[16px]">
              {categoriesContent}
            </section>
          )}
          {services}
        </section>
      </div>
    </>
  );
}
