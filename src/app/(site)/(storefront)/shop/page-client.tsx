"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useProcurementShopSubscription } from "@/hooks/use-procurement-favorite";
import { LOCALE_HTML_LANG, parseLocale } from "@/lib/locale";
import {
  procurementChannel,
  procurementShopBrowsable,
} from "@/lib/procurement/catalog";
import {
  ProcurementApiError,
  searchShopProducts,
} from "@/lib/procurement/client";
import {
  purchaseLoginHref,
  purchaseProductHref,
} from "@/lib/procurement/purchase";
import type {
  ProcurementProductChannel,
  ProductSearchItem,
  ProductSearchPage,
} from "@/lib/procurement/types";
import { usePriceConvert } from "@/lib/store/common";
import { Heart, HeartPlus, Search } from "lucide-react";
import { useLocale, useTranslations as useUiTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useState } from "react";
const PLATFORM_IMAGES: Record<string, string> = {
  "1688": "/assets/images/common/1688.png",
  taobao: "/assets/images/common/taobao.png",
  weidian: "/assets/images/common/weidian.png",
};
const PAGE_SIZE = 20;
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
function fetchShopPage(
  channel: ProcurementProductChannel | undefined,
  shopId: string,
  keyword: string,
  page: number,
  language: string,
): Promise<ProductSearchPage> {
  // Taobao shops have no listing API yet: show the empty state.
  if (!procurementShopBrowsable(channel) || !shopId) {
    return Promise.resolve({ items: [], total: 0, hasMore: false });
  }
  return searchShopProducts({
    channel,
    shopId,
    keyword,
    page,
    page_size: PAGE_SIZE,
    language,
  });
}
/** The listing API requires a session: send guests to login. */
function redirectGuestToLogin(
  error: unknown,
  router: ReturnType<typeof useRouter>,
) {
  if (error instanceof ProcurementApiError && error.status === 401) {
    const { pathname, search } = window.location;
    router.replace(purchaseLoginHref(`${pathname}${search}`));
  }
}
export default function PageClient() {
  const translateUi = useUiTranslations();

  const router = useRouter();
  const language = LOCALE_HTML_LANG[parseLocale(useLocale())];
  const searchParams = useSearchParams();
  const shopName = searchParams.get("shop_name") ?? "";
  const platform = searchParams.get("platform") ?? "1688";
  const shopId = searchParams.get("shop_id") ?? "";
  const listingShopId = searchParams.get("listing_shop_id") || shopId;
  const channel = procurementChannel(platform);
  const logoUrl = PLATFORM_IMAGES[platform] || PLATFORM_IMAGES["1688"];
  const normalizedPageSize = PAGE_SIZE;
  const priceConvert = usePriceConvert();
  const subscription = useProcurementShopSubscription(
    platform,
    shopId,
    shopName,
    listingShopId,
  );
  const [keyword, setKeyword] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [items, setItems] = useState<ProductSearchItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadedPage, setLoadedPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const productsKey = JSON.stringify([
    normalizedPageSize,
    platform,
    listingShopId,
    submittedKeyword,
    language,
  ]);
  const [previousProductsKey, setPreviousProductsKey] = useState<string | null>(
    null,
  );
  if (previousProductsKey !== productsKey) {
    setPreviousProductsKey(productsKey);
    setLoading(true);
    setLoadedPage(1);
    setItems([]);
    setHasMore(false);
  }
  const fetchPage = (page: number) =>
    fetchShopPage(channel, listingShopId, submittedKeyword, page, language);
  const handleFetchError = (error: unknown) =>
    redirectGuestToLogin(error, router);
  useEffect(() => {
    let cancelled = false;
    fetchShopPage(channel, listingShopId, submittedKeyword, 1, language)
      .then((page) => {
        if (!cancelled) {
          setItems(page.items);
          setHasMore(page.hasMore);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) redirectGuestToLogin(error, router);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channel, listingShopId, submittedKeyword, language, router]);
  const handleSearch = () => {
    setSubmittedKeyword(keyword.trim());
  };
  const handleSeeMore = () => {
    if (loadingMore) return;
    const nextPage = loadedPage + 1;
    setLoadingMore(true);
    fetchPage(nextPage)
      .then((page) => {
        setItems((prev) => [...prev, ...page.items]);
        setHasMore(page.hasMore);
        setLoadedPage(nextPage);
      })
      .catch(handleFetchError)
      .finally(() => setLoadingMore(false));
  };
  return (
    <section>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-[#ff6a00]">
            <img
              src={logoUrl}
              alt=""
              className="h-full w-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="min-w-0 truncate text-sm font-semibold text-[#333333]">
            {shopName || translateUi.raw("Shop")}
          </div>
          <button
            type="button"
            onClick={() => void subscription.toggle()}
            disabled={subscription.loading || !subscription.available}
            aria-pressed={subscription.collected}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[#d7d7d7] bg-white px-3 text-xs text-[#333333] transition-colors hover:bg-[#f7f7f7]"
          >
            {subscription.loading ? (
              <Spinner className="h-4 w-4" />
            ) : subscription.collected ? (
              <Heart className="fill-primary text-primary h-4 w-4" />
            ) : (
              <HeartPlus className="h-4 w-4" />
            )}
            {subscription.collected
              ? translateUi("Favorited")
              : translateUi("Add to Favorites")}
          </button>
        </div>

        <div className="focus-within:border-primary focus-within:ring-primary/15 flex h-11 w-full rounded-full border border-[#d7d7d7] bg-white transition-[border-color,box-shadow] focus-within:ring-2 md:max-w-[390px]">
          <input
            type="text"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSearch();
            }}
            placeholder={translateUi("Product Name")}
            className="min-w-0 flex-1 rounded-s-full bg-transparent px-5 text-sm text-[#333333] outline-none placeholder:text-[#8a8a8a]"
          />
          <button
            type="button"
            onClick={handleSearch}
            className="bg-primary m-1 inline-flex shrink-0 items-center gap-1.5 rounded-full px-5 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            <Search className="h-4 w-4" />
            {translateUi("Search")}
          </button>
        </div>
      </div>

      {loading ? (
        <ProductSkeletons count={Math.min(normalizedPageSize, 10)} />
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">
          {translateUi("No products found")}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-4 lg:grid-cols-5">
            {items.map((product) => {
              const imageUrl = product.imageUrl;
              const card = (
                <article className="relative min-w-0 transition-transform duration-300 ease-out hover:z-10 hover:-translate-y-[6px] hover:scale-[1.03]">
                  <div className="relative aspect-square overflow-hidden">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={product.title}
                        className="h-full w-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] text-gray-400">
                        {translateUi.raw("No image available")}
                      </div>
                    )}
                  </div>
                  <h3 className="mt-2 line-clamp-2 min-h-8 text-xs text-[#333333] lg:min-h-12 lg:text-base">
                    {product.title}
                  </h3>
                  {product.price !== undefined && (
                    <div className="text-primary mt-1 text-sm font-bold lg:text-base">
                      <bdi dir="ltr">
                        {priceConvert(product.price, {
                          useSymbol: true,
                          needFormat: true,
                        })}
                      </bdi>
                    </div>
                  )}
                </article>
              );
              return product.channel ? (
                <Link
                  key={product.id}
                  href={purchaseProductHref(
                    product.channel,
                    String(product.id),
                    product.title,
                  )}
                  className="block min-w-0"
                >
                  {card}
                </Link>
              ) : (
                <React.Fragment key={product.id}>{card}</React.Fragment>
              );
            })}
          </div>

          {hasMore && (
            <div className="relative mt-5 flex justify-center">
              <button
                type="button"
                onClick={handleSeeMore}
                disabled={loadingMore}
                className="bg-primary relative rounded-full px-5 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <span className="invisible">{translateUi("See More")}</span>
                    <Spinner
                      aria-label={translateUi.raw("Load more shop products")}
                      className="absolute start-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                    />
                  </>
                ) : (
                  translateUi("See More")
                )}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
