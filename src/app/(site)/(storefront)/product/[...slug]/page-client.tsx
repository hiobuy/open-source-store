"use client";
import { GoodsProvider, useGoods } from "./components/goods-context";
import { getGoodsShareLink } from "@/lib/product/goods-share-link";
import { GoodsSingleSkuSelectorClient } from "./components/goods-single-sku-selector";
import { GoodsSKUSelectorClient } from "./components/goods-sku-selector";
import { HydrationSafePrice } from "./components/hydration-safe-price";
import type { GoodsSelectionSnapshot } from "@/lib/client/services/goods-types";
import { fixImageUrl } from "@/lib/utils/image-url";
import { Section } from "@/components/layout/section";
import { ImagePreviewLightbox } from "@/components/image-preview-lightbox";
import {
  ProxyShoppingIntroModal,
  useProxyShoppingIntro,
} from "./components/proxy-shopping-intro-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import ActionsFlyToTarget, {
  type FlyToTargetRef,
} from "@/components/ui/fly-to-target";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-mobile";
import { useProcurementResource } from "@/hooks/use-procurement-resource";
import { useRemoteResource } from "@/hooks/use-remote-resource";
import { useProcurementFavorite } from "@/hooks/use-procurement-favorite";
import { useProcurementProductView } from "@/hooks/use-procurement-product-view";
import { getSpuDisplayPrice } from "@/lib/product/cart-payload";
import { getErrorMessage } from "@/lib/error-message";
import {
  procurementShopBrowsable,
  procurementShopPath,
} from "@/lib/procurement/catalog";
import {
  addProcurementCartItem,
  getProcurementWarehouse,
  previewProcurementPurchase,
  ProcurementApiError,
} from "@/lib/procurement/client";
import {
  procurementCartChanged,
  purchaseLoginHref,
  purchaseCheckoutItem,
  purchaseProductHref,
  startPurchaseCheckout,
} from "@/lib/procurement/purchase";
import { extractLanguageFromPath } from "@/lib/utils/language";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
import type {
  ProcurementProduct,
  ProcurementPurchaseLine,
} from "@/lib/procurement/types";
import { useCommonStore } from "@/lib/store/common";
import { sanitizeProductDescription } from "./lib/product-description";
import { productDisplayGoods } from "./lib/product-display-goods";
import { cn, copyToClipboard, DEFAULT_COPY_CLIPBOARD_TOAST } from "@/lib/utils";
import { motion, useAnimationControls } from "framer-motion";
import {
  Camera,
  ChevronDown,
  ChevronsRight,
  ChevronUp,
  ChevronRight,
  ClipboardList,
  Copy,
  Heart,
  Link,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { LOCALE_HTML_LANG, parseLocale } from "@/lib/locale";
import FreightLink from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
export default function PageClient({
  product,
  title,
}: {
  product?: ProcurementProduct;
  title?: string;
}) {
  const goodsInfo = useMemo(
    () => (product && title ? productDisplayGoods(product, title) : null),
    [product, title],
  );
  // Rewrite pasted-link or title-less URLs to `/product/{platform}/{title}/{id}`
  // without reloading.
  useEffect(() => {
    if (!product) return;
    const canonical = purchaseProductHref(product.channel, product.id, title);
    const { pathname, search, hash } = window.location;
    const { actualPath } = extractLanguageFromPath(pathname);
    if (actualPath === canonical) return;
    const prefix = pathname.slice(0, pathname.length - actualPath.length);
    window.history.replaceState(
      window.history.state,
      "",
      `${prefix}${canonical}${search}${hash}`,
    );
  }, [product, title]);
  return (
    <GoodsProvider value={{ goodsInfo, loading: !product, error: null }}>
      <Section className="flex min-h-[300px] w-full flex-col items-start justify-start gap-0 p-0 pt-0 pb-6 max-md:items-stretch max-md:gap-4 md:pt-6">
        <ProductContent product={product} />
      </Section>
    </GoodsProvider>
  );
}
const PurchasePLATFORM_IMAGES: Record<string, string> = {
  "1688": "/assets/images/common/1688.png",
  taobao: "/assets/images/common/taobao.png",
  weidian: "/assets/images/common/weidian.png",
};
function PurchaseRemarkEditor() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2 hidden rounded-md border border-[#D1D5DB] p-2 text-sm">
      <div
        className="flex cursor-pointer items-center justify-between gap-1"
        onClick={() => setOpen(!open)}
      >
        <span>{t("Message")}:</span>
        <ChevronDown
          className={cn(
            "size-4 text-[#999999] transition-transform duration-300",
            open ? "rotate-180" : "",
          )}
        />
      </div>
      <div
        className={cn(
          "transition-all duration-300",
          open ? "h-auto" : "h-0 overflow-hidden",
        )}
      >
        <textarea
          disabled
          placeholder={t("Notes for buyer agent (leave blank if none)")}
          className="min-h-10 w-full resize-none py-3 text-sm outline-none placeholder:text-[#999999]"
        />
        <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center gap-1 rounded-[4px] border border-dashed border-[#D1D5DB] text-center text-xs font-bold text-[#999999]">
          <button
            type="button"
            disabled
            className="flex h-full w-full flex-col items-center justify-center gap-1"
            aria-label={t("Message")}
          >
            <Camera className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
const DisclaimerDAIGOU_DISCLAIMER_CHANGE = "daigouDisclaimerChange";
const DisclaimerDAIGOU_DISCLAIMER_REQUEST = "daigouDisclaimerRequest";
const DisclaimerDAIGOU_DISCLAIMER_ATTENRION = "daigouDisclaimerAttention";
const ActionsMOBILE_DISCLAIMER_STORAGE_KEY = "daigou_mobile_disclaimer_agreed";
function yuanFromCents(cents: number | null | undefined) {
  return typeof cents === "number" ? cents / 100 : null;
}
function actionsGetMobileDisclaimerAgreed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ActionsMOBILE_DISCLAIMER_STORAGE_KEY) === "1";
}
function actionsSetMobileDisclaimerAgreed(agreed: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    ActionsMOBILE_DISCLAIMER_STORAGE_KEY,
    agreed ? "1" : "0",
  );
}
function ProductContent({ product }: { product?: ProcurementProduct }) {
  const t = useTranslations();
  const { goodsInfo, loading } = useGoods();
  const favorite = useProcurementFavorite(product?.channel, product?.id);
  useProcurementProductView(product?.channel, product?.id);
  const sessionVersion = useProcurementSessionStore(
    (state) => state.clientStateVersion,
  );
  const hasSession = useProcurementSessionStore((state) => state.hasSession);
  // 商品图库
  const galleryTranslateUi = useTranslations();
  const galleryProductKey = `${goodsInfo?.platform ?? ""}:${goodsInfo?.num_iid ?? ""}`;
  const [gallerySelectionImage, gallerySetSelectionImage] = useState({
    key: "",
    url: "",
  });
  const gallerySelectedSkuImage =
    gallerySelectionImage.key === galleryProductKey
      ? gallerySelectionImage.url
      : "";
  const [galleryThumbnail, gallerySetThumbnail] = useState({
    key: "",
    url: "",
  });
  const [galleryIsImagePreview, gallerySetIsImagePreview] = useState(false);
  const galleryItemImgs = useMemo(
    () => goodsInfo?.item_imgs ?? [],
    [goodsInfo],
  );
  const galleryPropsImg = useMemo(
    () => goodsInfo?.props_img ?? {},
    [goodsInfo],
  );
  const galleryAllMedia = useMemo(() => {
    const arr: string[] = [];
    galleryItemImgs.forEach((src) => {
      if (!arr.includes(src)) arr.push(src);
    });
    return arr;
  }, [galleryItemImgs]);
  /** 与 effect 同步的首图，避免 loading→false 首帧 currentImgUrl 仍为空导致 src="" */
  const galleryFallbackMainUrl = useMemo(() => {
    if (galleryItemImgs.length) return galleryItemImgs[0];
    const fromProps = Object.values(galleryPropsImg || {}).find(Boolean);
    return fromProps ?? "";
  }, [galleryItemImgs, galleryPropsImg]);
  const galleryImageKey = `${galleryProductKey}:${gallerySelectedSkuImage}:${galleryAllMedia.join("|")}`;
  const galleryDisplayUrl =
    galleryThumbnail.key === galleryImageKey
      ? galleryThumbnail.url
      : gallerySelectedSkuImage || galleryFallbackMainUrl;
  const gallerySetCurrentImgUrl = (url: string) =>
    gallerySetThumbnail({ key: galleryImageKey, url });
  const galleryMainSrc = fixImageUrl(galleryDisplayUrl);
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{
        selectedSkuImage?: string;
      }>;
      const nextImage = ev.detail?.selectedSkuImage;
      gallerySetSelectionImage({
        key: galleryProductKey,
        url: typeof nextImage === "string" ? nextImage : "",
      });
    };
    window.addEventListener("daigouSelectionChange", handler);
    return () => window.removeEventListener("daigouSelectionChange", handler);
  }, [galleryProductKey]);
  const galleryLightboxSlides = useMemo(
    () =>
      [...new Set([...galleryAllMedia, galleryDisplayUrl])]
        .map((src) => fixImageUrl(src))
        .filter(Boolean)
        .map((src) => ({ src })),
    [galleryAllMedia, galleryDisplayUrl],
  );
  // 商品信息与规格
  const purchaseEnterStoreText = t("Enter Store");
  const purchaseProductLinkText = t("Product link");
  const purchaseCopyLinkText = t("Copy link");
  const purchaseRefreshText = t("Force refresh");
  const purchaseQuantityText = t("Quantity");
  const purchaseInventoryText = t("Inventory");
  const purchaseMinimumOrderQuantityText = t("Minimum order quantity");
  const purchaseCopyToastSuccess = t("Successfully copied to clipboard");
  const purchaseCopyToastFailed = t("Failed to copy to clipboard");
  const purchaseHydrated = useHydrated();
  const purchaseIsMobile = useIsMobile();
  const purchaseRenderDesktopSku = purchaseHydrated && !purchaseIsMobile;
  const purchaseCurrency = useCommonStore((state) => state.currency);
  const purchasePlatform = (goodsInfo?.platform as string) || "1688";
  const purchaseLogoUrl =
    PurchasePLATFORM_IMAGES[purchasePlatform] ||
    PurchasePLATFORM_IMAGES["1688"];
  const purchaseCopyOpts = {
    success: purchaseCopyToastSuccess,
    error: purchaseCopyToastFailed,
  };
  const language = LOCALE_HTML_LANG[parseLocale(useLocale())];
  const channel = product?.channel;
  const purchaseShop = product?.shop;
  const purchaseShopId = purchaseShop?.id?.trim() ?? "";
  const purchaseShopDisplayName = purchaseShop?.name?.trim() ?? "";
  // Only platforms with a shop listing API get an "Enter Store" entry.
  const purchaseShopHref = !procurementShopBrowsable(channel)
    ? null
    : purchaseShopId
      ? procurementShopPath(channel, purchaseShopId, purchaseShopDisplayName)
      : purchaseShop?.url?.startsWith("http")
        ? purchaseShop.url
        : null;
  const purchasePriceTiers = (product?.priceTiers ?? []).flatMap((tier) => {
    const price = yuanFromCents(tier.unitPriceCents);
    return price == null ? [] : [{ startQuantity: tier.minQuantity, price }];
  });
  const purchaseDisplayPrice =
    yuanFromCents(product?.price?.unitPriceCents) ??
    purchasePriceTiers[0]?.price ??
    null;
  const purchaseDisplayTitle = goodsInfo?.title || "—";
  const purchaseOnEnterStore = () => {
    if (purchaseShopHref)
      window.open(purchaseShopHref, "_blank", "noopener,noreferrer");
  };
  // 购买声明
  const disclaimerTitle = t("I agreeDisclaimer: ");
  const disclaimerContent = t(
    "Items are from third‑party platforms Our platform provides search, purchasing, and forwarding only We cannot verify quality or authenticity Using our platform means you accept these risks",
  );
  const disclaimerIsMobile = useIsMobile();
  const [disclaimerChecked, disclaimerSetChecked] = useState(false);
  const disclaimerCheckedRef = useRef(false);
  const disclaimerEmitState = (checked: boolean) => {
    window.dispatchEvent(
      new CustomEvent(DisclaimerDAIGOU_DISCLAIMER_CHANGE, {
        detail: { checked },
      }),
    );
  };
  useEffect(() => {
    disclaimerEmitState(disclaimerCheckedRef.current);
    const handleRequest = () => {
      disclaimerEmitState(disclaimerCheckedRef.current);
    };
    window.addEventListener(DisclaimerDAIGOU_DISCLAIMER_REQUEST, handleRequest);
    return () => {
      window.removeEventListener(
        DisclaimerDAIGOU_DISCLAIMER_REQUEST,
        handleRequest,
      );
    };
  }, []);
  const disclaimerControls = useAnimationControls();
  const [disclaimerAttention, disclaimerSetAttention] = useState(false);
  useEffect(() => {
    const handleAttention = () => {
      disclaimerControls.start({
        x: [0, -6, 6, -4, 4, -2, 0],
        transition: {
          duration: 0.45,
          ease: "easeInOut",
        },
      });
      disclaimerSetAttention(true);
    };
    window.addEventListener(
      DisclaimerDAIGOU_DISCLAIMER_ATTENRION,
      handleAttention,
    );
    return () =>
      window.removeEventListener(
        DisclaimerDAIGOU_DISCLAIMER_ATTENRION,
        handleAttention,
      );
  }, [disclaimerControls]);
  const disclaimerOnDisclaimerCheckedChange = (value: boolean) => {
    disclaimerCheckedRef.current = value;
    if (disclaimerAttention && value) {
      disclaimerSetAttention(false);
    }
    disclaimerSetChecked(value);
    disclaimerEmitState(value);
  };
  const disclaimerDisplayContent =
    disclaimerContent?.trim() ||
    "Items are from third‑party platforms. Our platform provides search, purchasing, and forwarding only. We cannot verify quality or authenticity. Using our platform means you accept these risks.";
  // 购买操作
  const actionsAddToCartText = t("Add To Cart");
  const actionsBuyNowText = t("Buy Now");
  const actionsMobileSkuSelectorMode = "single" as const;
  // 占位符由下方渲染处自行替换，需用 t.raw 避免被 ICU 解析
  const actionsSelectedSummaryLabel = t.raw(
    "Selected {styles} styles, {pieces} pcs",
  ) as string;
  const actionsProductAmountLabel = t("Product amount");
  const actionsShippingFeeLabel = t("Domestic freight");
  const actionsTranslateUi = useTranslations();
  const actionsIsMobile = useIsMobile();
  const [actionsSkuSheetOpen, actionsSetSkuSheetOpenState] = useState(false);
  const [actionsSkuSheetAction, actionsSetSkuSheetAction] = useState<
    "addToCart" | "buyNow" | null
  >(null);
  const [actionsMobileDisclaimerChecked, actionsSetMobileDisclaimerChecked] =
    useState(false);
  const [
    actionsMobileDisclaimerAttention,
    actionsSetMobileDisclaimerAttention,
  ] = useState(false);
  const actionsMobileDisclaimerControls = useAnimationControls();
  const [actionsDisclaimerDrawerOpen, actionsSetDisclaimerDrawerOpen] =
    useState(false);
  const [actionsHeaderImagePreviewOpen, actionsSetHeaderImagePreviewOpen] =
    useState(false);
  const [actionsCanAdd, actionsSetCanAdd] = useState(false);
  const actionsFlyRef = useRef<FlyToTargetRef>(null);
  const actionsBarRef = useRef<HTMLDivElement>(null);
  const [actionsMobileBarHeight, actionsSetMobileBarHeight] = useState(0);
  const actionsCartLinkRef = useRef<HTMLElement | null>(null);
  const [actionsSubmitLoading, actionsSetSubmitLoading] = useState(false);
  const actionsLocalCollectionId = favorite.collected;
  const actionsSetSkuSheetOpen = (open: boolean) => {
    actionsSetSkuSheetOpenState(open);
    if (!open) actionsSetDisclaimerDrawerOpen(false);
    else if (actionsIsMobile) {
      actionsSetMobileDisclaimerChecked(actionsGetMobileDisclaimerAgreed());
      actionsSetMobileDisclaimerAttention(false);
    }
  };
  const [actionsSelection, actionsSetSelection] =
    useState<GoodsSelectionSnapshot>({});
  const actionsRouter = useRouter();
  const actionsProxyIntro = useProxyShoppingIntro();
  const submitting = useRef(false);
  const cartProgress = useRef({ key: "", completed: 0 });
  // 动态获取购物车链接的引用（通过 id="cart-icon" 或 data-fly-to-cart，优先使用可见的）
  useEffect(() => {
    const updateCartLinkRef = () => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          "#cart-icon, [data-fly-to-cart]",
        ),
      );
      for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          actionsCartLinkRef.current = el;
          return;
        }
      }
      const first =
        document.getElementById("cart-icon") ??
        document.querySelector<HTMLElement>("[data-fly-to-cart]");
      if (first) actionsCartLinkRef.current = first;
    };
    updateCartLinkRef();
    const observer = new MutationObserver(updateCartLinkRef);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<GoodsSelectionSnapshot>;
      if (ev.detail?.canAdd !== undefined) actionsSetCanAdd(ev.detail.canAdd);
      actionsSetSelection(ev.detail ?? {});
    };
    window.addEventListener("daigouSelectionChange", handler);
    window.dispatchEvent(new Event("daigouSelectionRequest"));
    return () => window.removeEventListener("daigouSelectionChange", handler);
  }, []);
  const actionsDisclaimerStateRef = useRef(false);
  useEffect(() => {
    // 监听免责申明状态
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{
        checked?: boolean;
      }>;
      actionsDisclaimerStateRef.current = ev.detail?.checked === true;
    };
    window.addEventListener("daigouDisclaimerChange", handler);
    window.dispatchEvent(new CustomEvent("daigouDisclaimerRequest"));
    return () => window.removeEventListener("daigouDisclaimerChange", handler);
  }, []);
  useEffect(() => {
    if (!actionsMobileDisclaimerAttention) return;
    actionsMobileDisclaimerControls.start({
      x: [0, -6, 6, -4, 4, -2, 0],
      transition: {
        duration: 0.45,
        ease: "easeInOut",
      },
    });
  }, [actionsMobileDisclaimerAttention, actionsMobileDisclaimerControls]);
  useEffect(() => {
    if (!actionsIsMobile || !actionsSkuSheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [actionsIsMobile, actionsSkuSheetOpen]);
  /** H5 底部固定栏高度占位，避免页面内容被遮挡 */
  useEffect(() => {
    const el = actionsBarRef.current;
    if (!el) return;
    const updateHeight = () => {
      if (window.matchMedia("(max-width: 767px)").matches) {
        actionsSetMobileBarHeight(el.offsetHeight);
      } else {
        actionsSetMobileBarHeight(0);
      }
    };
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    window.addEventListener("resize", updateHeight);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, [loading]);
  useEffect(() => {
    const root = document.documentElement;
    const height =
      actionsIsMobile && !actionsSkuSheetOpen && actionsMobileBarHeight > 0
        ? `${actionsMobileBarHeight}px`
        : "0px";
    root.style.setProperty("--daigou-mobile-action-bar-height", height);
    return () => {
      root.style.setProperty("--daigou-mobile-action-bar-height", "0px");
    };
  }, [actionsIsMobile, actionsMobileBarHeight, actionsSkuSheetOpen]);
  const selectionQuantity = actionsSelection.totalQty ?? 0;
  const selectedLines = useMemo(() => {
    if (!product) return [];
    return product.variants.flatMap(({ skuId, stock }) => {
      const quantity = actionsSelection.sizeProp
        ? (actionsSelection.qtyBySku?.[skuId] ?? 0)
        : actionsSelection.selectedSku?.sku_id === skuId
          ? selectionQuantity
          : 0;
      return Number.isInteger(quantity) &&
        quantity > 0 &&
        quantity <= Math.min(stock ?? 999, 999)
        ? [{ id: product.id, spec_id: skuId, quantity }]
        : [];
    });
  }, [actionsSelection, selectionQuantity, product]);
  const actionsTotalQty = selectedLines.reduce(
    (total, line) => total + line.quantity,
    0,
  );
  const actionsStyleCount = selectedLines.length;
  const actionsHasSummary = actionsStyleCount > 0;
  const initialVariant = product?.variants.find(({ stock }) => stock !== 0);
  const quoteLines: ProcurementPurchaseLine[] = actionsHasSummary
    ? selectedLines
    : product && initialVariant
      ? [{ id: product.id, spec_id: initialVariant.skuId, quantity: 1 }]
      : [];
  const quoteKey =
    hasSession && channel && quoteLines.length && quoteLines.length <= 20
      ? JSON.stringify(quoteLines)
      : null;
  const loadQuote = useCallback(
    (key: string) =>
      previewProcurementPurchase(
        channel!,
        JSON.parse(key) as ProcurementPurchaseLine[],
      ),
    [channel],
  );
  const [requestedQuoteKey, setRequestedQuoteKey] = useState<string | null>(
    null,
  );
  useEffect(() => {
    const timer = setTimeout(() => setRequestedQuoteKey(quoteKey), 400);
    return () => clearTimeout(timer);
  }, [quoteKey]);
  const quote = useProcurementResource(
    loadQuote,
    quoteKey === requestedQuoteKey ? quoteKey : null,
  );
  const displayQuote =
    quote.data?.referencePrice ??
    (quote.data?.currency === "CNY" ? quote.data : undefined);
  const actionsProductAmount = displayQuote
    ? displayQuote.goodsCents / 100
    : null;
  const actionsFreightFee = displayQuote
    ? displayQuote.shippingCents / 100
    : null;
  const actionsFreightFeeLoading =
    quote.loading || Boolean(quoteKey && quoteKey !== requestedQuoteKey);

  async function submitPurchase(buyNow: boolean) {
    if (!product || !selectedLines.length || submitting.current) return;
    submitting.current = true;
    actionsSetSubmitLoading(true);
    const source = window.location.pathname + window.location.search;
    try {
      if (buyNow) {
        const purchaseQuote = await previewProcurementPurchase(
          product.channel,
          selectedLines,
        );
        if (
          useProcurementSessionStore.getState().clientStateVersion ===
          sessionVersion
        ) {
          actionsSetSkuSheetOpen(false);
          actionsSetSkuSheetAction(null);
          actionsRouter.push(
            startPurchaseCheckout(
              purchaseQuote,
              source,
              selectedLines.map(({ spec_id }) =>
                purchaseCheckoutItem(product, spec_id, language),
              ),
              product.channel,
            ),
          );
        }
      } else {
        const key = JSON.stringify([
          sessionVersion,
          product.channel,
          selectedLines,
        ]);
        if (cartProgress.current.key !== key)
          cartProgress.current = { key, completed: 0 };
        const progress = cartProgress.current;
        for (const { id, spec_id, quantity } of selectedLines.slice(
          progress.completed,
        )) {
          if (
            useProcurementSessionStore.getState().clientStateVersion !==
            sessionVersion
          )
            return;
          await addProcurementCartItem({
            channel: product.channel,
            productId: id,
            skuId: spec_id,
            quantity,
          });
          progress.completed++;
          window.dispatchEvent(new Event(procurementCartChanged));
        }
        cartProgress.current = { key: "", completed: 0 };
        if (
          useProcurementSessionStore.getState().clientStateVersion !==
          sessionVersion
        )
          return;
        toast.success(actionsTranslateUi("Added to cart"));
        actionsSetSkuSheetOpen(false);
        actionsSetSkuSheetAction(null);
      }
    } catch (error) {
      if (
        useProcurementSessionStore.getState().clientStateVersion !==
        sessionVersion
      )
        return;
      if (error instanceof ProcurementApiError && error.status === 401) {
        actionsRouter.push(purchaseLoginHref(source));
      } else {
        toast.error(
          getErrorMessage(error) || actionsTranslateUi("Operation failed"),
        );
      }
    } finally {
      submitting.current = false;
      actionsSetSubmitLoading(false);
    }
  }
  const actionsHandleAddCart = (redirectToCommit: boolean) => {
    if (submitting.current || !goodsInfo) return;
    if (actionsDisclaimerStateRef.current === false && !actionsIsMobile) {
      // 未勾选免责申明
      window.dispatchEvent(new CustomEvent("daigouDisclaimerAttention"));
      return;
    }
    // H5：首次点击先展开 SKU 弹层，再次点击才提交
    if (actionsIsMobile && !actionsSkuSheetOpen) {
      actionsSetSkuSheetAction(redirectToCommit ? "buyNow" : "addToCart");
      actionsSetSkuSheetOpen(true);
      return;
    }
    if (actionsIsMobile && !actionsMobileDisclaimerChecked) {
      actionsSetMobileDisclaimerAttention(true);
      return;
    }
    if (
      !actionsCanAdd ||
      !selectedLines.length ||
      (redirectToCommit && selectedLines.length > 20)
    )
      return;
    actionsProxyIntro.runWithIntro(() => void submitPurchase(redirectToCommit));
  };
  const actionsWishLoading = favorite.loading;
  const actionsHandleAddWishlist = () => void favorite.toggle();
  const actionsHasGoods = !!goodsInfo;
  const actionsHeaderImage =
    actionsSelection.selectedSkuImage ||
    goodsInfo?.pic_url ||
    goodsInfo?.item_imgs?.[0] ||
    "";
  const actionsHeaderSpuPrice =
    purchasePriceTiers.length || purchaseDisplayPrice != null
      ? getSpuDisplayPrice(
          actionsTotalQty,
          purchasePriceTiers,
          purchaseDisplayPrice ?? 0,
        )
      : null;
  const actionsHeaderImageSrc = actionsHeaderImage
    ? fixImageUrl(actionsHeaderImage)
    : "";
  const actionsTotalAmount =
    actionsProductAmount == null
      ? null
      : actionsProductAmount + (actionsFreightFee ?? 0);
  const actionsActionDisabled =
    actionsSubmitLoading ||
    actionsFreightFeeLoading ||
    !actionsHasGoods ||
    ((!actionsIsMobile || actionsSkuSheetOpen) &&
      (!actionsCanAdd || !selectedLines.length));
  // 规格与详情
  const descriptionSpecificationTitle = t("Specification");
  const descriptionProductionDetailsTitle = t("Production Details");
  const descriptionFontSize = "14px";
  const descriptionColor = "#666666";
  const [descriptionSpecOpen, descriptionSetSpecOpen] = useState(false);
  const [descriptionProdOpen, descriptionSetProdOpen] = useState(true);
  const descriptionPropsList = goodsInfo?.props;
  const descriptionDesc = goodsInfo?.desc?.trim() ?? "";
  const descriptionHasSpec =
    Array.isArray(descriptionPropsList) && descriptionPropsList.length > 0;
  const descriptionHasDesc = descriptionDesc.length > 0;
  const descriptionHasContent = descriptionHasSpec || descriptionHasDesc;
  // 国内运费与运输信息
  const freightTitle = t(
    "After payment, our team will purchase for you 09:00–18:00 (UTC+8)",
  );
  const freightDomesticLabel = t("Seller");
  const freightDomesticFeeLabel = t("Shipping");
  const freightInternationalLabel = t("Your Address,");
  const freightEstimateButtonText = t("Estimate international shipping fee");
  const freightDomesticFeeUpLabel = t("and up,");
  const warehouse = useRemoteResource(
    hasSession && product ? String(sessionVersion) : null,
    getProcurementWarehouse,
  );
  const freightWarehouseName = warehouse.data?.available
    ? warehouse.data.name
    : "";
  const freightSection = (() => {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <ShoppingBag className="size-4 shrink-0" />
          <span>{freightTitle}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <svg
            className="shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
          >
            <rect
              x="0.665"
              y="0.665"
              width="14.67"
              height="14.67"
              rx="7.335"
              fill="white"
            />
            <rect
              x="0.665"
              y="0.665"
              width="14.67"
              height="14.67"
              rx="7.335"
              stroke="#333333"
              strokeWidth="1.33"
              strokeMiterlimit="bevel"
            />
            <path
              d="M9.1543 12.5H7.77148V6.98633C7.77148 6.80273 7.77344 6.61914 7.77734 6.43555C7.78125 6.25195 7.78516 6.07227 7.78906 5.89648C7.79688 5.7207 7.80664 5.55273 7.81836 5.39258C7.73633 5.48242 7.63477 5.58008 7.51367 5.68555C7.39648 5.79102 7.27148 5.90039 7.13867 6.01367L6.1543 6.79883L5.46289 5.92578L8.00586 3.93359H9.1543V12.5Z"
              fill="#333333"
            />
          </svg>
          <span className="font-semibold">{freightDomesticLabel}</span>
          <ChevronsRight className="size-4 shrink-0" />
          <span>{freightDomesticFeeLabel}</span>
          <div className="min-w-12 border px-2 py-0.5 text-center">
            {actionsFreightFeeLoading ? (
              <Spinner className="inline-block size-3" />
            ) : (
              (actionsFreightFee ?? "—")
            )}
          </div>
          <span>(CNY)</span>
          <span>{freightDomesticFeeUpLabel}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <svg
            className="shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="M8 0.665039C12.051 0.665039 15.335 3.94899 15.335 8C15.335 12.051 12.051 15.335 8 15.335C3.94899 15.335 0.665039 12.051 0.665039 8C0.665039 3.94899 3.94899 0.665039 8 0.665039Z"
              fill="white"
            />
            <path
              d="M8 0.665039C12.051 0.665039 15.335 3.94899 15.335 8C15.335 12.051 12.051 15.335 8 15.335C3.94899 15.335 0.665039 12.051 0.665039 8C0.665039 3.94899 3.94899 0.665039 8 0.665039Z"
              stroke="#333333"
              strokeWidth="1.33"
              strokeLinejoin="bevel"
            />
            <path
              d="M10.9062 12.5H5.10547V11.4629L7.32617 9.21289C7.75586 8.77539 8.10938 8.39844 8.38672 8.08203C8.66406 7.76172 8.86914 7.45898 9.00195 7.17383C9.13867 6.88867 9.20703 6.57812 9.20703 6.24219C9.20703 5.82812 9.08789 5.51562 8.84961 5.30469C8.61133 5.08984 8.29688 4.98242 7.90625 4.98242C7.53516 4.98242 7.19141 5.05664 6.875 5.20508C6.5625 5.34961 6.23828 5.55664 5.90234 5.82617L5.14648 4.91797C5.38477 4.71484 5.63867 4.5293 5.9082 4.36133C6.18164 4.19336 6.48633 4.06055 6.82227 3.96289C7.1582 3.86133 7.54102 3.81055 7.9707 3.81055C8.51367 3.81055 8.98242 3.9082 9.37695 4.10352C9.77148 4.29492 10.0742 4.5625 10.2852 4.90625C10.5 5.25 10.6074 5.65039 10.6074 6.10742C10.6074 6.56836 10.5156 6.99414 10.332 7.38477C10.1484 7.77539 9.88672 8.16211 9.54688 8.54492C9.20703 8.92383 8.80273 9.33594 8.33398 9.78125L6.85156 11.2285V11.293H10.9062V12.5Z"
              fill="#333333"
            />
          </svg>
          <span className="font-semibold whitespace-nowrap">
            {freightWarehouseName || ""}
          </span>
          <ChevronsRight className="size-4 shrink-0" />
          <span className="whitespace-nowrap">{freightInternationalLabel}</span>
          <FreightLink
            href="/freight-estimation"
            className="text-primary font-semibold"
          >
            {freightEstimateButtonText}
          </FreightLink>
        </div>
      </div>
    );
  })();
  const galleryContent = (() => {
    if (loading) {
      return (
        <div className="shrink-0">
          <Skeleton className="mb-5 aspect-square w-full rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="size-16 shrink-0 rounded-lg" />
            <Skeleton className="size-16 shrink-0 rounded-lg" />
          </div>
        </div>
      );
    }
    if (galleryAllMedia.length === 0) {
      return (
        <div className="shrink-0">
          <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-gray-100 text-gray-400">
            {galleryTranslateUi.raw("No image available")}
          </div>
        </div>
      );
    }
    const galleryLightboxIndex = Math.max(
      0,
      galleryLightboxSlides.findIndex((s) => s.src === galleryMainSrc),
    );
    const galleryOpenPreview = () => {
      if (galleryLightboxSlides.length === 0) return;
      gallerySetIsImagePreview(true);
    };
    const galleryClosePreview = () => gallerySetIsImagePreview(false);
    return (
      <div>
        <div className="shrink-0">
          <div className="mb-5">
            <div
              className={`group relative aspect-square w-full overflow-hidden rounded-lg bg-gray-100 ${galleryMainSrc ? "cursor-zoom-in" : ""}`}
              onClick={galleryMainSrc ? galleryOpenPreview : undefined}
              aria-label={
                galleryMainSrc ? galleryTranslateUi.raw("Preview") : undefined
              }
              role={galleryMainSrc ? "button" : undefined}
              tabIndex={galleryMainSrc ? 0 : undefined}
              onKeyDown={
                galleryMainSrc
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        galleryOpenPreview();
                      }
                    }
                  : undefined
              }
            >
              {galleryMainSrc ? (
                <img
                  src={galleryMainSrc}
                  alt=""
                  className="h-full w-full object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
                  {galleryTranslateUi.raw("No image available")}
                </div>
              )}
              {galleryMainSrc ? (
                <img
                  src="/assets/images/goods-details/preview.png"
                  alt=""
                  className="absolute end-4 bottom-4 h-11 w-11 cursor-pointer opacity-80 transition-opacity group-hover:opacity-100"
                  referrerPolicy="no-referrer"
                  onClick={(e) => {
                    e.stopPropagation();
                    galleryOpenPreview();
                  }}
                />
              ) : null}
            </div>
          </div>
          <div className="hide-scrollbar flex gap-2.5 overflow-x-auto px-4 pb-1 md:px-0">
            {galleryItemImgs.map((src, index) => {
              const thumbSrc = fixImageUrl(src);
              if (!thumbSrc) return null;
              return (
                <button
                  key={src}
                  type="button"
                  aria-label={`${galleryTranslateUi.raw("Preview")} ${index + 1}`}
                  onClick={() => gallerySetCurrentImgUrl(src)}
                  className={`size-16 shrink-0 overflow-hidden rounded-lg border-2 ${fixImageUrl(src) === galleryMainSrc ? "border-orange-500" : "border-gray-200"}`}
                >
                  <img
                    src={thumbSrc}
                    alt=""
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* 图片预览：使用公共组件，支持缩放、缩略图，切换不影响主图 */}
        <ImagePreviewLightbox
          open={galleryIsImagePreview}
          onClose={galleryClosePreview}
          slides={galleryLightboxSlides}
          index={galleryLightboxIndex}
          closeOnBackdropClick
        />
      </div>
    );
  })();
  const purchaseContent = (() => {
    if (loading) {
      return (
        <div className="space-y-5">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      );
    }
    if (!goodsInfo) return null;
    return (
      <div className="text-[#333333]">
        <div className="mb-2 hidden items-center gap-2 md:flex">
          <img
            src={purchaseLogoUrl}
            alt=""
            className="h-6 w-6 shrink-0 rounded object-contain"
          />
          <span className="min-w-0 truncate text-sm font-bold">
            {purchaseShopDisplayName}
          </span>
          {purchaseShopHref && (
            <button
              type="button"
              onClick={purchaseOnEnterStore}
              className="shrink-0 cursor-pointer rounded-full bg-[#333333] px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-85"
            >
              {purchaseEnterStoreText}
            </button>
          )}
        </div>

        <div className="mb-2 flex items-start gap-2">
          <h1 className="min-w-0 flex-1 text-sm leading-tight font-bold text-[#333333] lg:text-[20px]">
            {purchaseDisplayTitle}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-[#666666]">
          {goodsInfo.detail_url && (
            <button
              type="button"
              onClick={() => window.open(goodsInfo.detail_url, "_blank")}
              className="hover:text-primary inline-flex items-center gap-1 transition-colors"
            >
              <Link className="h-4 w-4" />
              {purchaseProductLinkText}
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              copyToClipboard(
                getGoodsShareLink(window.location.href),
                purchaseCopyOpts,
              )
            }
            className="hover:text-primary inline-flex items-center gap-1 transition-colors"
          >
            <Copy className="h-4 w-4" />
            {purchaseCopyLinkText}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="hover:text-primary inline-flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            {purchaseRefreshText}
          </button>
        </div>

        <div className="mt-3 lg:mt-5">
          <div className="text-primary text-[20px] font-bold lg:text-[32px]">
            {purchaseDisplayPrice != null &&
              purchaseCurrency?.code !== "CNY" && (
                <span>
                  CNY {purchaseDisplayPrice.toFixed(2).replace(/\.00$/, "")}{" "}
                  ≈{" "}
                </span>
              )}
            <HydrationSafePrice
              value={purchaseDisplayPrice}
              options={{ useSymbol: true, showSymbol: true }}
            />
          </div>
        </div>
        {purchaseRenderDesktopSku ? (
          <div className="hidden space-y-5 md:block">
            <GoodsSingleSkuSelectorClient />
            <PurchaseRemarkEditor />
          </div>
        ) : null}
        <>
          <section className="m-[10px_0px_0px] rounded-[8px] bg-[#FAFaFa] p-[8px] lg:m-[20px_0px]">
            {freightSection}
          </section>
        </>
        <button
          type="button"
          onClick={purchaseOnEnterStore}
          disabled={!purchaseShopHref}
          className="mt-2 flex w-full items-center gap-2 rounded-md bg-[#FAFAFA] p-2 text-start md:hidden lg:bg-transparent lg:p-0"
        >
          <img
            src={purchaseLogoUrl}
            alt=""
            className="h-6 w-6 shrink-0 rounded object-contain"
          />
          <span className="min-w-0 flex-1 truncate text-sm font-bold">
            {purchaseShopDisplayName}
          </span>
          {purchaseShopHref && (
            <ChevronRight className="size-4 shrink-0 rtl:rotate-180" />
          )}
        </button>
      </div>
    );
  })();
  const disclaimerSection = (() => {
    if (loading) {
      return (
        <div className="mt-2 hidden items-center gap-2 py-3 md:flex">
          <Skeleton className="size-4 shrink-0 rounded-[4px]" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      );
    }
    if (disclaimerIsMobile) return null;
    return (
      <motion.div
        className="mt-2 hidden gap-1 py-3 text-xs md:flex"
        animate={disclaimerControls}
      >
        <Checkbox
          checked={disclaimerChecked}
          className={cn(
            "data-[state=checked]:border-primary border-black",
            disclaimerAttention && "border-primary",
          )}
          onCheckedChange={(value) => {
            const nextChecked = value === true;
            disclaimerOnDisclaimerCheckedChange(nextChecked);
          }}
        />
        <div className="flex-1">
          <span
            className={cn(
              "font-semibold",
              disclaimerAttention && "text-primary",
            )}
          >
            {disclaimerTitle}
          </span>
          <span>{disclaimerDisplayContent}</span>
        </div>
      </motion.div>
    );
  })();
  const actionsContent = (() => {
    if (loading) {
      return (
        <div
          ref={actionsBarRef}
          className="bg-white px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-50 max-md:bg-white max-md:shadow-[0_-4px_16px_rgba(0,0,0,0.08)] md:border-t md:border-gray-100 md:px-0 md:pb-2"
        >
          <div className="grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 pt-3 sm:gap-3">
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="h-11 rounded-full" />
            <Skeleton className="h-11 rounded-full" />
          </div>
        </div>
      );
    }
    return (
      <>
        {actionsIsMobile && (
          <>
            {actionsSkuSheetOpen && (
              <button
                type="button"
                aria-label={actionsTranslateUi.raw("Close SKU panel")}
                className="fixed inset-0 z-30 bg-black/50 md:hidden"
                onClick={() => {
                  actionsSetSkuSheetOpen(false);
                  actionsSetSkuSheetAction(null);
                }}
              />
            )}
            {/* 保持挂载，避免关闭后再次打开时 SKU 选择状态丢失 */}
            <div
              className={cn(
                "fixed inset-x-0 z-40 flex max-h-[min(80vh,650px)] flex-col rounded-t-2xl bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.12)] md:hidden",
                !actionsSkuSheetOpen && "pointer-events-none invisible",
              )}
              style={{
                bottom: actionsSkuSheetOpen ? 0 : actionsMobileBarHeight,
              }}
              aria-hidden={!actionsSkuSheetOpen}
            >
              <div className="flex shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-3">
                {actionsHeaderImageSrc ? (
                  <button
                    type="button"
                    aria-label={actionsTranslateUi.raw("Preview image")}
                    className="size-16 shrink-0 cursor-zoom-in overflow-hidden rounded-lg"
                    onClick={() => actionsSetHeaderImagePreviewOpen(true)}
                  >
                    <img
                      src={actionsHeaderImageSrc}
                      alt={goodsInfo?.title ?? ""}
                      className="size-16 object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                ) : (
                  <div className="size-16 shrink-0 rounded-lg bg-gray-100" />
                )}
                <div className="min-w-0 flex-1 text-lg font-bold text-red-500">
                  <HydrationSafePrice
                    value={actionsHeaderSpuPrice}
                    options={{ useSymbol: true }}
                  />
                </div>
                <button
                  type="button"
                  aria-label={actionsTranslateUi.raw("Close")}
                  className="shrink-0 rounded-full p-1 text-gray-500 hover:bg-gray-100"
                  onClick={() => {
                    actionsSetSkuSheetOpen(false);
                    actionsSetSkuSheetAction(null);
                  }}
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
                {actionsMobileSkuSelectorMode === "single" ? (
                  <GoodsSingleSkuSelectorClient />
                ) : (
                  <GoodsSKUSelectorClient
                    fontSize="14px"
                    unitPrice={purchaseDisplayPrice}
                  />
                )}
              </div>
              {/* 总金额显示和按钮 */}
              <div className="shrink-0 border-t border-gray-100 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="mb-3 flex gap-3">
                  <div className="relative flex shrink-0 flex-col items-center justify-center text-gray-500">
                    <ClipboardList className="size-8" />
                    {actionsTotalQty > 0 && (
                      <span className="absolute -end-1 -top-1 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-none font-semibold text-white">
                        {actionsTotalQty}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      {actionsTotalAmount != null && actionsTotalAmount > 0 && (
                        <span className="text-xl font-bold text-red-500">
                          <HydrationSafePrice
                            value={actionsTotalAmount}
                            options={{ useSymbol: true }}
                          />
                        </span>
                      )}
                      <span className="text-xs text-gray-500">
                        {actionsProductAmountLabel}{" "}
                        <HydrationSafePrice
                          value={actionsProductAmount}
                          options={{ useSymbol: true }}
                        />
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {actionsShippingFeeLabel}{" "}
                      {actionsFreightFeeLoading ? (
                        <Spinner className="inline size-3.5 align-[-2px]" />
                      ) : (
                        <span className="text-gray-700">
                          {actionsFreightFee != null ? (
                            <HydrationSafePrice
                              value={actionsFreightFee}
                              options={{ needShow: true, useSymbol: true }}
                            />
                          ) : (
                            "-"
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <motion.div
                  className={cn(
                    "mb-3 flex items-start gap-2 text-xs text-gray-500",
                    actionsMobileDisclaimerAttention && "text-primary",
                  )}
                  animate={actionsMobileDisclaimerControls}
                >
                  <Checkbox
                    checked={actionsMobileDisclaimerChecked}
                    className={cn(
                      "data-[state=checked]:border-primary mt-0.5 border-black",
                      actionsMobileDisclaimerAttention && "border-primary",
                    )}
                    onCheckedChange={(value) => {
                      const nextChecked = value === true;
                      actionsSetMobileDisclaimerChecked(nextChecked);
                      actionsSetMobileDisclaimerAgreed(nextChecked);
                      if (nextChecked) {
                        actionsSetMobileDisclaimerAttention(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="min-w-0 cursor-pointer text-start leading-5 hover:text-gray-700"
                    onClick={() => actionsSetDisclaimerDrawerOpen(true)}
                  >
                    {actionsTranslateUi.raw("I agree 'Purchase Notice'")}
                  </button>
                </motion.div>
                <Button
                  onClick={() =>
                    actionsHandleAddCart(actionsSkuSheetAction === "buyNow")
                  }
                  disabled={
                    actionsActionDisabled ||
                    (actionsSkuSheetAction === "buyNow" &&
                      selectedLines.length > 20)
                  }
                  className="bg-primary hover:bg-primary/90 h-12 w-full rounded-full text-base font-semibold"
                >
                  {actionsSubmitLoading && (
                    <Spinner className="text-primary-foreground size-5" />
                  )}
                  {actionsSkuSheetAction === "buyNow"
                    ? actionsBuyNowText
                    : actionsAddToCartText}
                </Button>
              </div>
            </div>
            {actionsDisclaimerDrawerOpen && (
              <button
                type="button"
                aria-label={actionsTranslateUi.raw("Close disclaimer")}
                className="fixed inset-0 z-70 bg-black/50"
                onClick={() => actionsSetDisclaimerDrawerOpen(false)}
              />
            )}
            <div
              className={cn(
                "fixed inset-x-0 bottom-0 z-71 flex max-h-[min(70vh,480px)] flex-col rounded-t-2xl bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-out",
                actionsDisclaimerDrawerOpen
                  ? "translate-y-0"
                  : "pointer-events-none translate-y-full",
              )}
              aria-hidden={!actionsDisclaimerDrawerOpen}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
                <h3 className="text-base font-semibold text-gray-900">
                  {t("Agreement Content")}
                </h3>
                <button
                  type="button"
                  aria-label={actionsTranslateUi.raw("Close")}
                  className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
                  onClick={() => actionsSetDisclaimerDrawerOpen(false)}
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 text-sm leading-6 text-gray-600">
                {t(
                  "Items are from third‑party platforms Our platform provides search, purchasing, and forwarding only We cannot verify quality or authenticity Using our platform means you accept these risks",
                )}
              </div>
            </div>
          </>
        )}
        <ActionsFlyToTarget
          ref={actionsFlyRef}
          to={actionsCartLinkRef as React.RefObject<HTMLElement>}
          icon={<ShoppingCart className="h-5 w-5" />}
        />
        <div
          ref={actionsBarRef}
          className={cn(
            "bg-white px-2 md:px-0",
            "pb-[max(0.5rem,env(safe-area-inset-bottom))] md:pb-2",
            // H5：固定在屏幕底部，白底 + 上阴影
            "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-50",
            "max-md:bg-white max-md:shadow-[0_-4px_16px_rgba(0,0,0,0.08)]",
            actionsIsMobile && actionsSkuSheetOpen && "max-md:hidden",
            // PC：保持原样
            "md:border-t md:border-gray-100",
          )}
        >
          {actionsHasSummary && !actionsIsMobile && (
            <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50/80 px-4 py-3 text-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-medium text-gray-600">
                  {actionsSelectedSummaryLabel
                    .replace("{styles}", String(actionsStyleCount))
                    .replace("{pieces}", String(actionsTotalQty))
                    .split(/(\d+)/)
                    .map((part, i) =>
                      /^\d+$/.test(part) ? (
                        <span
                          key={i}
                          className="text-primary mx-0.5 text-base font-semibold"
                        >
                          {part}
                        </span>
                      ) : (
                        <span key={i}>{part}</span>
                      ),
                    )}
                </span>
                <span className="grid grid-cols-2 gap-3 sm:flex sm:gap-5">
                  <span>
                    <span className="block text-xs text-gray-500">
                      {actionsProductAmountLabel}
                    </span>
                    <span className="block text-base font-semibold text-red-500">
                      <HydrationSafePrice
                        value={actionsProductAmount}
                        options={{ useSymbol: true }}
                      />
                    </span>
                  </span>
                  <span>
                    <span className="block text-xs text-gray-500">
                      {actionsShippingFeeLabel}
                    </span>
                    {actionsFreightFeeLoading ? (
                      <span className="mt-1 flex h-6 items-center">
                        <Spinner className="size-4" />
                      </span>
                    ) : (
                      <span className="block text-base font-semibold text-red-500">
                        {actionsFreightFee != null ? (
                          <HydrationSafePrice
                            value={actionsFreightFee}
                            options={{ needShow: true, useSymbol: true }}
                          />
                        ) : (
                          "-"
                        )}
                      </span>
                    )}
                  </span>
                </span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 pt-3 sm:gap-3">
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-gray-200 bg-white transition-colors hover:bg-gray-50"
              aria-label={actionsTranslateUi.raw("Add to wishlist")}
              onClick={actionsHandleAddWishlist}
            >
              {actionsWishLoading ? (
                <Spinner className="size-5 text-gray-600" />
              ) : actionsLocalCollectionId ? (
                <Heart className="h-5 w-5 fill-red-500 text-red-500" />
              ) : (
                <Heart className="h-5 w-5 text-gray-600" />
              )}
            </button>
            <Button
              onClick={() => actionsHandleAddCart(false)}
              disabled={actionsActionDisabled}
              variant="outline"
              className="h-11 min-w-0 gap-1 rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              {actionsSubmitLoading && <Spinner className="size-5" />}
              {actionsAddToCartText}
            </Button>
            <Button
              onClick={() => actionsHandleAddCart(true)}
              disabled={
                actionsActionDisabled ||
                (!actionsIsMobile && selectedLines.length > 20)
              }
              className="bg-primary hover:bg-primary/90 h-11 min-w-0 gap-1 rounded-full px-4 text-sm font-semibold"
            >
              {actionsSubmitLoading && <Spinner className="size-5" />}
              {actionsBuyNowText}
            </Button>
          </div>
        </div>

        {actionsHeaderImageSrc ? (
          <ImagePreviewLightbox
            open={actionsHeaderImagePreviewOpen}
            onClose={() => actionsSetHeaderImagePreviewOpen(false)}
            slides={[{ src: actionsHeaderImageSrc }]}
            index={0}
            closeOnBackdropClick
          />
        ) : null}

        <ProxyShoppingIntroModal
          open={actionsProxyIntro.open}
          onOpenChange={actionsProxyIntro.setOpen}
          onConfirm={actionsProxyIntro.handleConfirm}
        />
      </>
    );
  })();
  const descriptionContent = (() => {
    if (loading) {
      return (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-10 w-full" />
        </div>
      );
    }
    if (!descriptionHasContent) return null;
    return (
      <div style={{ fontSize: descriptionFontSize, color: descriptionColor }}>
        {/* Specification */}
        {descriptionHasSpec && (
          <div className="border-b border-gray-200">
            <button
              type="button"
              onClick={() => descriptionSetSpecOpen((o) => !o)}
              className="flex w-full items-center justify-between py-3 text-start font-bold hover:opacity-80"
            >
              {descriptionSpecificationTitle}
              {descriptionSpecOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
              ) : (
                <ChevronUp className="h-4 w-4 shrink-0 text-gray-500" />
              )}
            </button>
            {descriptionSpecOpen && (
              <div className="pb-3 text-sm">
                <div className="flex flex-wrap items-center">
                  {descriptionPropsList!.map((item, i) => (
                    <div key={i} className="mb-1 w-1/2">
                      <span>{item.name ?? ""}</span> :{" "}
                      <span>{item.value ?? ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Production Details */}
        {descriptionHasDesc && (
          <div className="border-b border-gray-200">
            <button
              type="button"
              onClick={() => descriptionSetProdOpen((o) => !o)}
              className="flex w-full items-center justify-between py-3 text-start font-bold hover:opacity-80"
            >
              {descriptionProductionDetailsTitle}
              {descriptionProdOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
              ) : (
                <ChevronUp className="h-4 w-4 shrink-0 text-gray-500" />
              )}
            </button>
            {descriptionProdOpen && (
              <div
                className="max-w-full min-w-0 overflow-x-auto pb-3 text-sm leading-relaxed break-words [&_*]:max-w-full [&_img]:my-2 [&_img]:!h-auto [&_table]:w-full [&_table]:table-fixed"
                dangerouslySetInnerHTML={{
                  __html: sanitizeProductDescription(descriptionDesc),
                }}
              />
            )}
          </div>
        )}
      </div>
    );
  })();
  return (
    <>
      <>
        <div className="flex flex-col gap-1 pb-1 md:gap-6 md:pb-6">
          <div className="flex flex-col gap-1 md:grid md:min-h-0 md:grid-cols-2 md:items-start md:gap-6 md:[grid-template-areas:'media_right'_'description_right']">
            <div className="order-1 min-w-0 md:min-h-0 md:[grid-area:media]">
              <>
                <section className="m-[0px] rounded-[0px] p-[12px_0px_0px] lg:p-[0px]">
                  {galleryContent}
                </section>
              </>
            </div>
            <aside className="order-2 min-w-0 md:sticky md:top-[107px] md:flex md:max-h-[calc(100dvh-107px)] md:min-h-0 md:flex-col md:self-start md:[grid-area:right]">
              <div className="min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-auto">
                <>{purchaseContent}</>
              </div>
              <div className="shrink-0 md:sticky md:bottom-0 md:z-20 md:border-t md:border-gray-100 md:bg-white">
                <>
                  {disclaimerSection}
                  {actionsContent}
                </>
              </div>
            </aside>
            <div className="order-3 min-w-0 md:min-h-0 md:[grid-area:description]">
              <>{descriptionContent}</>
            </div>
          </div>
          <div
            className="h-[var(--daigou-mobile-action-bar-height,0px)] md:hidden"
            aria-hidden="true"
          />
        </div>
      </>
    </>
  );
}
