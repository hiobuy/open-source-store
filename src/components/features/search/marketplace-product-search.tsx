"use client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import Analytics from "@/lib/analytics";
import { useProductSearch } from "@/lib/hooks/use-product-search";
import { useRouterWithProgress } from "@/lib/hooks/use-router-with-progress";
import { LOCALE_HTML_LANG } from "@/lib/locale";
import {
  procurementUploadedImageSrc,
  searchProducts,
  searchProductsByImage,
} from "@/lib/procurement/client";
import type {
  ProcurementProductChannel,
  ProductSearchItem,
  ProductSearchPage,
} from "@/lib/procurement/types";
import { usePriceConvert } from "@/lib/store/common";
import { parseProductTitleFromPathSlug } from "@/lib/utils";
import { getGoodsLink, purchaseProductHref } from "@/lib/procurement/purchase";
import { useLocaleStore } from "@/stores/locale-store";
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Search as SearchIcon,
  ShieldAlert,
  SlidersHorizontal,
  Tag,
  TriangleAlert,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
const SOURCE_TABS = [
  {
    label: "1688",
    value: "1688",
    image: "/assets/images/search/1688.png",
    imageActive: "/assets/images/search/1688_a.png",
  },
  {
    label: "Taobao",
    value: "taobao",
    image: "/assets/images/search/taobao.png",
    imageActive: "/assets/images/search/taobao_a.png",
  },
  {
    label: "Weidian",
    value: "weidian",
    image: "/assets/images/search/weidian.png",
    imageActive: "/assets/images/search/weidian_a.png",
  },
] as const;
const PRICE_INPUT_CLASS =
  "h-9 rounded-[9px] border-[#D1D5DB] bg-white px-3 text-sm shadow-none outline-none focus:border-primary focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0";
const DEFAULT_PARAMS = {
  keyword: "",
  img: "",
  priceStart: "",
  priceEnd: "",
  page: 1,
  page_size: 20,
  platform: "1688" as ProcurementProductChannel,
  filter: [] as string[],
  sort: "best_match",
};
function searchImagePreviewSrc(img: string) {
  if (/^https?:\/\//i.test(img)) return img;
  return procurementUploadedImageSrc(img);
}
function getKeywordFromCategoryPath(pathname: string): string {
  const idx = pathname.indexOf("/category/");
  if (idx === -1) return "";
  const rest = pathname.slice(idx + "/category/".length);
  const seg = rest.split("/")[0];
  if (!seg) return "";
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}
function getBlockedWordsFromError(error: unknown): string {
  const candidates = [
    error,
    (
      error as {
        data?: unknown;
      }
    )?.data,
    (
      error as {
        response?: {
          data?: unknown;
        };
      }
    )?.response?.data,
  ];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const payload = candidate as {
      error_code?: unknown;
      block_words?: unknown;
    };
    if (payload.error_code === "block_words_exist") {
      return String(payload.block_words || "").trim();
    }
  }
  return "";
}
function ToggleChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-md border px-4 text-sm transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-[#d7d7d7] bg-white text-[#333333] hover:bg-[#f5f5f5]"}`}
    >
      {children}
    </button>
  );
}
function filterButtonClass(active: boolean) {
  return `relative inline-flex h-10 items-center gap-1.5 rounded-md border px-4 text-sm transition-colors ${
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-[#d7d7d7] bg-white text-[#333333] hover:bg-[#f7f7f7]"
  }`;
}
function ProductSkeletons({ count = 10 }: { count?: number }) {
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
function renderRiskTemplate(
  template: string,
  values: Record<string, React.ReactNode>,
) {
  const parts: React.ReactNode[] = [];
  const pattern = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(template)) !== null) {
    if (match.index > lastIndex) {
      parts.push(template.slice(lastIndex, match.index));
    }
    parts.push(values[match[1]] ?? match[0]);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < template.length) {
    parts.push(template.slice(lastIndex));
  }
  return parts.map((part, index) => (
    <React.Fragment key={index}>{part}</React.Fragment>
  ));
}
function BlockedWordsRiskDialog({
  keyword,
  onClose,
}: {
  keyword: string;
  onClose: () => void;
}) {
  const t = useTranslations();

  const displayKeyword = keyword.trim();
  return (
    <Dialog
      open={Boolean(displayKeyword)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="max-w-[480px] overflow-hidden rounded-[22px] border-0 bg-white p-0 shadow-[0_24px_80px_rgba(15,23,42,0.28)]"
      >
        <div className="h-1 bg-[linear-gradient(90deg,#ef233c_0%,#ff6b35_58%,#f5c542_100%)]" />
        <div className="relative p-6 pt-5">
          <button
            type="button"
            aria-label={t("Close")}
            onClick={onClose}
            className="absolute end-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-[#EEF3F9] text-[#64748B] transition hover:bg-[#E2E8F0] hover:text-[#334155]"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3 pe-11">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] border border-[#FBD0D5] bg-[#FFF1F3] text-[#EF233C] shadow-[inset_0_0_0_6px_rgba(239,35,60,0.04)]">
              <TriangleAlert className="h-7 w-7" strokeWidth={2.4} />
            </div>
            <div>
              <DialogTitle className="text-[22px] leading-tight font-extrabold text-[#0F172A]">
                {t("Risk Notice")}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs font-bold tracking-[0.06em] text-[#526987] uppercase">
                {t("Restrictions & Purchasing Compliance")}
              </DialogDescription>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 rounded-[10px] border border-dashed border-[#FDB6BE] bg-[#FFF7F7] px-4 py-3">
            <div className="inline-flex min-w-0 items-center gap-2 text-sm font-bold text-[#B4232D]">
              <Tag className="h-4 w-4 shrink-0" strokeWidth={2.6} />
              <span>{t("Restricted Keyword:")}</span>
            </div>
            <span className="max-w-[190px] truncate rounded-full bg-[#F64852] px-4 py-1.5 text-xs font-extrabold text-white shadow-[0_8px_18px_rgba(246,72,82,0.28)]">
              {displayKeyword}
            </span>
          </div>

          <div className="mt-5 space-y-4 text-[15px] leading-6 text-[#344054]">
            <p>
              {renderRiskTemplate(
                t.raw(
                  "We apologize that purchasing services for items associated with {{keyword}} are temporarily restricted",
                ),
                {
                  keyword: (
                    <strong className="font-extrabold text-[#1F2937]">
                      &quot;{displayKeyword}&quot;
                    </strong>
                  ),
                },
              )}
            </p>
            <div className="flex gap-3 rounded-md bg-[#F8FAFC] py-4 ps-4 pe-5">
              <ShieldAlert
                className="mt-0.5 h-5 w-5 shrink-0 text-[#EF233C]"
                strokeWidth={2.3}
              />
              <p>
                {renderRiskTemplate(
                  t.raw(
                    "This limitation is driven by {{policyText}} or {{requirementText}}",
                  ),
                  {
                    policyText: (
                      <strong className="font-extrabold">
                        {t(
                          "cross-border trade compliance, brand authorization policies,",
                        )}
                      </strong>
                    ),
                    requirementText: (
                      <strong className="font-extrabold">
                        {t("customs clearance requirements")}
                      </strong>
                    ),
                  },
                )}
              </p>
            </div>
            <p className="text-[#526987]">
              {t(
                "To safeguard order delivery and guarantee complete customer protection, please search with an alternative keyword or browse other available products",
              )}
            </p>
          </div>

          <div className="mt-7 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-10 min-w-[104px] rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-5 text-sm font-bold text-[#334155] transition hover:bg-[#EEF2F7]"
            >
              {t("Cancel")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export function MarketplaceProductSearch() {
  const pathname = usePathname() ?? "";
  const pageSize = 20;
  const t = useTranslations();
  const language = useLocaleStore((state) => LOCALE_HTML_LANG[state.locale]);
  const searchParams = useSearchParams();
  const router = useRouterWithProgress();
  const priceConvert = usePriceConvert();
  const routeKeyword =
    searchParams?.get("keyword") || getKeywordFromCategoryPath(pathname) || "";
  const routeImg = searchParams?.get("img") || "";
  const initialKeyword = routeKeyword;
  const [params, setParams] = useState({
    ...DEFAULT_PARAMS,
    keyword: initialKeyword,
    img: routeImg,
    page_size: Number(pageSize) || 20,
  });
  const [draftPriceStart, setDraftPriceStart] = useState("");
  const [draftPriceEnd, setDraftPriceEnd] = useState("");
  const [sortPopoverOpen, setSortPopoverOpen] = useState(false);
  const [pricePopoverOpen, setPricePopoverOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [items, setItems] = useState<ProductSearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const loadMoreRequest = useRef<Promise<ProductSearchPage> | null>(null);
  const [blockedWordsKeyword, setBlockedWordsKeyword] = useState("");
  const {
    handleFileChange,
    fileInputRef,
    searchKeyword,
    setSearchKeyword,
    handleSearch,
    handleImageUpload,
    imageUploading,
  } = useProductSearch(initialKeyword);
  const routeKey = JSON.stringify([
    pathname,
    searchParams.toString(),
    pageSize,
  ]);
  const [previousRouteKey, setPreviousRouteKey] = useState(routeKey);
  if (previousRouteKey !== routeKey) {
    setPreviousRouteKey(routeKey);
    const nextKeyword =
      searchParams.get("keyword") || getKeywordFromCategoryPath(pathname) || "";
    const nextImg = searchParams.get("img") || "";
    setSearchKeyword(nextKeyword);
    setParams((previous) => ({
      ...previous,
      keyword: nextKeyword,
      img: nextImg,
      page: 1,
      page_size: Number(pageSize) || 20,
    }));
  }
  const queryKey = JSON.stringify([
    params.platform,
    params.keyword,
    params.img,
    params.priceStart,
    params.priceEnd,
    params.sort,
    params.filter,
    params.page_size,
    language,
  ]);
  const buildRequestParams = useCallback(
    (page: number) => ({
      platform: params.platform,
      keyword: params.keyword,
      img: params.img || undefined,
      priceStart: params.priceStart,
      priceEnd: params.priceEnd,
      page,
      page_size: params.page_size,
      sort: params.sort,
      filter: params.filter.length > 0 ? params.filter : [],
    }),
    [
      params.filter,
      params.img,
      params.keyword,
      params.page_size,
      params.platform,
      params.priceEnd,
      params.priceStart,
      params.sort,
    ],
  );
  const fetchList = useCallback(
    async (page: number): Promise<ProductSearchPage> => {
      const req = buildRequestParams(page);
      if (req.img) {
        const imageUrl = /^https?:\/\//i.test(req.img) ? req.img : undefined;
        return searchProductsByImage({
          channel: req.platform,
          uploadId: imageUrl ? undefined : req.img,
          imageUrl,
          page,
          page_size: req.page_size,
          language,
        });
      }
      const keyword = req.keyword.trim();
      if (!keyword) return { items: [], total: 0, hasMore: false };
      return searchProducts({
        channel: req.platform,
        keyword,
        page,
        page_size: req.page_size,
        language,
      });
    },
    [buildRequestParams, language],
  );
  const sendEvent = useCallback(
    (products: ProductSearchItem[], type: "list" | "item" = "list") => {
      if (!products.length) return;
      const payload = {
        items: products.map((item) => ({
          item_id: item.sourceUrl ?? String(item.id),
          item_name: item.title,
        })),
      };
      if (type === "list") {
        Analytics.trackViewProductList({ currency: "CNY", ...payload });
      } else {
        Analytics.trackSelectItem(payload);
      }
    },
    [],
  );
  const [previousQueryKey, setPreviousQueryKey] = useState<string | null>(null);
  if (previousQueryKey !== queryKey) {
    setPreviousQueryKey(queryKey);
    setLoading(true);
    setHasMore(false);
    setLoadingMore(false);
    setItems([]);
  }
  useEffect(() => {
    let cancelled = false;
    fetchList(1)
      .then(({ items: list, hasMore }) => {
        if (cancelled) return;
        setItems(list);
        setHasMore(hasMore);
        setParams((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
        sendEvent(list);
      })
      .catch((error) => {
        if (!cancelled) {
          const blockedWords = getBlockedWordsFromError(error);
          if (blockedWords) setBlockedWordsKeyword(blockedWords);
          setItems([]);
          setHasMore(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      loadMoreRequest.current = null;
    };
  }, [queryKey, fetchList, sendEvent]);
  const displayItems = items;
  const isLoading = loading;
  const priceRangeActive = Boolean(params.priceStart || params.priceEnd);
  const sortActive = params.sort !== "best_match";
  const filterCount = params.filter.length;
  const filterActive = filterCount > 0;
  const setFilterValue = (value: string) => {
    setParams((prev) => {
      const active = prev.filter.includes(value);
      const next = active
        ? prev.filter.filter((item) => item !== value)
        : [...prev.filter, value];
      return { ...prev, filter: next, page: 1 };
    });
  };
  const resetFilters = () => {
    setDraftPriceStart("");
    setDraftPriceEnd("");
    setParams((prev) => ({
      ...prev,
      priceStart: "",
      priceEnd: "",
      filter: [],
      sort: "best_match",
      page: 1,
    }));
  };
  const replaceSearchUrl = useCallback(
    (key: "keyword" | "img", value: string) => {
      const nextSearchParams = new URLSearchParams(searchParams?.toString());
      nextSearchParams.delete(key === "keyword" ? "img" : "keyword");
      nextSearchParams.set(key, value);
      router.replace(`/search?${nextSearchParams.toString()}`, {
        scroll: false,
      });
    },
    [router, searchParams],
  );
  const submitSearch = () => {
    const keyword = handleSearch(searchKeyword.trim(), false);
    if (keyword) {
      replaceSearchUrl("keyword", keyword);
    }
  };
  const submitImageSearch = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const imageUrl = await handleFileChange(event, false);
    if (imageUrl) {
      replaceSearchUrl("img", imageUrl);
    }
  };
  const applyPrice = () => {
    setParams((prev) => ({
      ...prev,
      priceStart: draftPriceStart.trim(),
      priceEnd: draftPriceEnd.trim(),
      page: 1,
    }));
    setPricePopoverOpen(false);
  };
  const loadMore = () => {
    if (loading || !hasMore || loadMoreRequest.current) return;
    const nextPage = params.page + 1;
    setLoadingMore(true);
    const pending = fetchList(nextPage);
    loadMoreRequest.current = pending;
    pending
      .then(({ items: list, hasMore }) => {
        if (loadMoreRequest.current !== pending) return;
        setItems((prev) => [...prev, ...list]);
        setHasMore(hasMore);
        setParams((prev) => ({ ...prev, page: nextPage }));
        sendEvent(list);
      })
      .catch((error) => {
        if (loadMoreRequest.current !== pending) return;
        const blockedWords = getBlockedWordsFromError(error);
        if (blockedWords) setBlockedWordsKeyword(blockedWords);
      })
      .finally(() => {
        if (loadMoreRequest.current !== pending) return;
        loadMoreRequest.current = null;
        setLoadingMore(false);
      });
  };
  const keywordText = parseProductTitleFromPathSlug(params.keyword) || "";
  const filterGroups = [
    {
      title: t("Service Guarantee"),
      options: [
        { label: t("Ships Today"), value: "shipInToday" },
        { label: t("Curated"), value: "isQqyx" },
        { label: t("Selection 1688"), value: "1688Selection" },
        { label: t("Ships in 24 hrs"), value: "shipIn24Hours" },
        { label: t("Ships in 48 hrs"), value: "shipIn48Hours" },
        { label: t("7-Day No Reason Return"), value: "noReason7DReturn" },
      ],
    },
    {
      title: t("Service Quality"),
      options: [{ label: t("Certified Factory"), value: "certifiedFactory" }],
    },
  ];
  return (
    <section className="w-full">
      <BlockedWordsRiskDialog
        keyword={blockedWordsKeyword}
        onClose={() => setBlockedWordsKeyword("")}
      />

      <div className="flex justify-center py-4 md:py-5">
        <div className="focus-within:border-primary focus-within:ring-primary/15 flex h-11 w-full max-w-[560px] items-center rounded-full border border-[#d7d7d7] bg-white transition-[border-color,box-shadow] focus-within:ring-2">
          <input
            type="text"
            value={searchKeyword}
            onChange={(event) => setSearchKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitSearch();
            }}
            placeholder={t("Product Name")}
            className="min-w-0 flex-1 rounded-s-full bg-transparent px-4 text-sm text-[#333333] outline-none placeholder:text-[#999999] md:px-5"
          />
          <input
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            type="file"
            onChange={submitImageSearch}
          />
          <button
            className="me-3 shrink-0 text-[#b8b8b8]"
            disabled={imageUploading}
            onClick={handleImageUpload}
          >
            {imageUploading ? (
              <Spinner className="size-5" />
            ) : (
              <Camera className="size-5" />
            )}
          </button>
          <button
            type="button"
            onClick={submitSearch}
            className="bg-primary m-1 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 md:px-5"
          >
            <SearchIcon className="h-4 w-4" />
            {t("Search")}
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-4 text-sm">
        <div className="font-bold text-[#333333]">
          {t("Searching")}
          {keywordText ? (
            <span className="text-primary">&quot;{keywordText}&quot;</span>
          ) : params.img ? (
            <img
              src={searchImagePreviewSrc(params.img)}
              alt=""
              className="mx-1 inline h-6 rounded"
            />
          ) : null}
          {t("… here's what we found")}
        </div>
      </div>

      <div className="mb-4 flex border-b border-[#e5e5e5]">
        {SOURCE_TABS.map((tab) => {
          const active = params.platform === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() =>
                setParams((prev) => ({ ...prev, platform: tab.value, page: 1 }))
              }
              className={`relative flex h-11 items-center gap-1.5 px-6 text-sm transition-colors ${active ? "text-primary" : "hover:text-primary text-[#666666]"}`}
            >
              <img
                src={active ? tab.imageActive : tab.image}
                alt={tab.label}
                className="h-5 w-5"
              />
              {tab.label}
              {active && (
                <span className="bg-primary absolute start-0 bottom-0 h-0.5 w-full" />
              )}
            </button>
          );
        })}
      </div>

      {params.img && (
        <>
          <div className="mb-4 hidden items-center justify-between gap-4 md:flex">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setParams((prev) => ({
                    ...prev,
                    sort: "best_match",
                    page: 1,
                  }))
                }
                className={filterButtonClass(true)}
              >
                {t("Comprehensive")}
              </button>

              <Popover open={sortPopoverOpen} onOpenChange={setSortPopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={filterButtonClass(sortPopoverOpen || sortActive)}
                  >
                    {t("Sort by Price")}
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-36 bg-white p-0 shadow-lg"
                >
                  <div className="py-2">
                    {[
                      { label: t("Low to High"), value: "_bid2" },
                      { label: t("High to low"), value: "bid2" },
                    ].map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => {
                          setParams((prev) => ({
                            ...prev,
                            sort: item.value,
                            page: 1,
                          }));
                          setSortPopoverOpen(false);
                        }}
                        className="w-full px-4 py-2 text-start text-sm text-[#666666] hover:bg-[#f7f7f7]"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <Popover
                open={pricePopoverOpen}
                onOpenChange={setPricePopoverOpen}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={filterButtonClass(
                      pricePopoverOpen || priceRangeActive,
                    )}
                  >
                    {t("Price Range")}
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  onOpenAutoFocus={(event) => event.preventDefault()}
                  className="w-[260px] rounded-lg border border-[#d7d7d7] bg-white p-2 shadow-lg"
                >
                  <div className="flex items-center">
                    <InputGroup>
                      <InputGroupInput
                        value={draftPriceStart}
                        onChange={(event) =>
                          setDraftPriceStart(event.target.value)
                        }
                        placeholder={
                          pathname.includes("/category/")
                            ? t("Min")
                            : t("¥ Min")
                        }
                        className={`${PRICE_INPUT_CLASS} h-8 flex-1`}
                      ></InputGroupInput>
                      <InputGroupAddon>¥</InputGroupAddon>
                    </InputGroup>

                    <span
                      className="mx-1 h-px w-3 shrink-0 bg-[#D1D5DB]"
                      aria-hidden
                    />
                    <InputGroup>
                      <InputGroupInput
                        value={draftPriceEnd}
                        onChange={(event) =>
                          setDraftPriceEnd(event.target.value)
                        }
                        placeholder={
                          pathname.includes("/category/")
                            ? t("Max")
                            : t("¥ Max")
                        }
                        className={`${PRICE_INPUT_CLASS} h-8 flex-1`}
                      ></InputGroupInput>
                      <InputGroupAddon>¥</InputGroupAddon>
                    </InputGroup>
                  </div>
                  <button
                    type="button"
                    onClick={applyPrice}
                    className="bg-primary mt-2 h-8 w-full rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    {t("Confirm")}
                  </button>
                </PopoverContent>
              </Popover>

              <button
                type="button"
                onClick={() => setFilterOpen((open) => !open)}
                className={filterButtonClass(filterActive)}
              >
                {t("Filter")}
                <SlidersHorizontal className="h-4 w-4" />
                {filterCount > 0 && (
                  <span className="absolute -end-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff6a00] px-1 text-[10px] leading-none font-bold text-white">
                    {filterCount}
                  </span>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={resetFilters}
              className="hover:text-primary inline-flex items-center gap-1 text-sm text-[#666666]"
            >
              <span className="text-lg leading-none">↻</span>
              {t("Reset")}
            </button>
          </div>

          <div className="mb-4 flex items-center justify-between pb-3 md:hidden">
            <button
              type="button"
              onClick={() =>
                setParams((prev) => ({ ...prev, sort: "best_match", page: 1 }))
              }
              className="text-sm font-semibold text-[#333333]"
            >
              {t("Comprehensive")}
            </button>
            <button
              type="button"
              onClick={() =>
                setParams((prev) => ({
                  ...prev,
                  sort: prev.sort === "_bid2" ? "bid2" : "_bid2",
                  page: 1,
                }))
              }
              className="inline-flex items-center gap-1 text-sm text-[#666666]"
            >
              {t("Price")}
              <span className="inline-flex flex-col -space-y-1">
                <ChevronUp
                  className={`h-3 w-3 ${params.sort === "bid2" ? "text-primary" : "text-[#b8b8b8]"}`}
                />
                <ChevronDown
                  className={`h-3 w-3 ${params.sort === "_bid2" ? "text-primary" : "text-[#b8b8b8]"}`}
                />
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftPriceStart(params.priceStart);
                setDraftPriceEnd(params.priceEnd);
                setFilterSheetOpen(true);
              }}
              className="inline-flex items-center gap-1 text-sm text-[#666666]"
            >
              {t("Filter")}
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>

          {filterOpen && (
            <div className="mb-5 hidden rounded-lg border border-[#d7d7d7] bg-white px-4 py-3 md:block">
              <div className="flex flex-wrap items-center gap-3">
                <div className="me-1 min-w-24 text-sm font-medium text-[#333333]">
                  {t("Service Quality")}
                </div>
                <ToggleChip
                  active={params.filter.includes("certifiedFactory")}
                  onClick={() => setFilterValue("certifiedFactory")}
                >
                  {t("Certified Factory")}
                </ToggleChip>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="me-1 min-w-24 text-sm font-medium text-[#333333]">
                  {t("Service Guarantee")}
                </div>
                {[
                  { label: t("Ships Today"), value: "shipInToday" },
                  { label: t("Curated"), value: "isQqyx" },
                  { label: t("Selection 1688"), value: "1688Selection" },
                  { label: t("Ships in 24 hrs"), value: "shipIn24Hours" },
                  { label: t("Ships in 48 hrs"), value: "shipIn48Hours" },
                  {
                    label: t("7-Day No Reason Return"),
                    value: "noReason7DReturn",
                  },
                ].map((option) => (
                  <ToggleChip
                    key={option.value}
                    active={params.filter.includes(option.value)}
                    onClick={() => setFilterValue(option.value)}
                  >
                    {option.label}
                  </ToggleChip>
                ))}
              </div>
            </div>
          )}

          <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
            <SheetContent
              side="bottom"
              onOpenAutoFocus={(event) => event.preventDefault()}
              className="flex h-[min(86vh,640px)] flex-col overflow-hidden rounded-t-2xl bg-white p-0"
            >
              <SheetHeader className="shrink-0 border-b border-[#f0f0f0] px-4 pt-4 pb-3 text-start">
                <SheetTitle className="text-base font-bold">
                  {t("Filter")}
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
                <div>
                  <div className="mb-2 text-sm text-[#666666]">
                    {t("Price")}
                  </div>
                  <div className="flex items-center">
                    <Input
                      value={draftPriceStart}
                      onChange={(event) =>
                        setDraftPriceStart(event.target.value)
                      }
                      placeholder={t("Minimum Price")}
                      className={`${PRICE_INPUT_CLASS} flex-1`}
                    />
                    <span
                      className="h-px w-3 shrink-0 bg-[#D6DCE3]"
                      aria-hidden
                    />
                    <Input
                      value={draftPriceEnd}
                      onChange={(event) => setDraftPriceEnd(event.target.value)}
                      placeholder={t("Maximum Price")}
                      className={`${PRICE_INPUT_CLASS} flex-1`}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() =>
                        setParams((prev) => ({
                          ...prev,
                          sort: "bid2",
                          page: 1,
                        }))
                      }
                      className={`h-10 rounded-md text-sm font-semibold ${params.sort === "bid2" ? "bg-primary text-white" : "bg-[#f0f0f0] text-[#333333]"}`}
                    >
                      {t("High to low")}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setParams((prev) => ({
                          ...prev,
                          sort: "_bid2",
                          page: 1,
                        }))
                      }
                      className={`h-10 rounded-md text-sm font-semibold ${params.sort === "_bid2" ? "bg-primary text-white" : "bg-[#f0f0f0] text-[#333333]"}`}
                    >
                      {t("Low to High")}
                    </button>
                  </div>
                </div>

                {filterGroups.map((group) => (
                  <div key={group.title}>
                    <div className="mb-2 text-sm text-[#666666]">
                      {group.title}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {group.options.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setFilterValue(option.value)}
                          className={`min-h-10 rounded-md px-2 text-sm transition-colors ${
                            params.filter.includes(option.value)
                              ? "bg-primary text-white"
                              : "bg-[#f0f0f0] text-[#333333]"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="shrink-0 border-t border-[#f0f0f0] bg-white px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <div className="flex gap-5">
                  <button
                    type="button"
                    onClick={() => {
                      resetFilters();
                      setFilterSheetOpen(false);
                    }}
                    className="border-primary text-primary h-11 flex-1 rounded-full border text-sm font-semibold"
                  >
                    {t("Reset")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      applyPrice();
                      setFilterSheetOpen(false);
                    }}
                    className="bg-primary h-11 flex-1 rounded-full text-sm font-semibold text-white"
                  >
                    {t("Confirm")}
                  </button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}

      {isLoading ? (
        <ProductSkeletons count={Math.min(params.page_size, 10)} />
      ) : displayItems.length === 0 ? (
        <div className="py-16 text-center text-sm text-[#999999]">
          {t("No products found")}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-4 lg:grid-cols-5">
            {displayItems.map((product) => {
              const { channel, imageUrl, sourceUrl, title, id, price } =
                product;
              const href = channel
                ? purchaseProductHref(channel, String(id), title)
                : sourceUrl
                  ? getGoodsLink(sourceUrl, title)
                  : undefined;
              const card = (
                <article className="relative min-w-0 transition-transform duration-300 ease-out hover:z-10 hover:-translate-y-1.5 hover:scale-[1.03]">
                  <div className="relative aspect-square overflow-hidden">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={title}
                        className="h-full w-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                  </div>
                  <h3 className="mt-2 line-clamp-2 min-h-8 text-xs text-[#333333] lg:min-h-12 lg:text-base">
                    {title}
                  </h3>
                  {price !== undefined && (
                    <div className="text-primary mt-1 text-sm font-bold lg:text-base">
                      <bdi dir="ltr">
                        {priceConvert(price, {
                          useSymbol: true,
                          needFormat: true,
                        })}
                      </bdi>
                    </div>
                  )}
                </article>
              );
              return href ? (
                <Link
                  key={id}
                  href={href}
                  className="block min-w-0"
                  onClick={() => sendEvent([product], "item")}
                >
                  {card}
                </Link>
              ) : (
                <React.Fragment key={id}>{card}</React.Fragment>
              );
            })}
          </div>

          {hasMore && (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="bg-primary relative rounded-full px-5 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <span className="invisible">{t("See More")}</span>
                    <Spinner
                      aria-label={t("Load more products")}
                      className="absolute start-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                    />
                  </>
                ) : (
                  t("See More")
                )}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
