"use client";
import { default as CartEmptyIllustration } from "@/assets/images/member-empty/cart.svg";
import { fixImageUrl } from "@/lib/utils/image-url";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useProcurementResource } from "@/hooks/use-procurement-resource";
import { getErrorMessage } from "@/lib/error-message";
import { LOCALE_HTML_LANG } from "@/lib/locale";
import {
  deleteProcurementCartItem,
  deleteProcurementManualCartItem,
  getProcurementCart,
  previewProcurementCart,
  ProcurementApiError,
  updateProcurementCartItem,
  updateProcurementManualCartItem,
} from "@/lib/procurement/client";
import {
  procurementCartChanged,
  purchaseCheckoutItem,
  purchaseLoginHref,
  purchaseManualCheckoutItems,
  purchaseProductHref,
  purchaseProductTitle,
  startPurchaseCheckout,
} from "@/lib/procurement/purchase";
import { procurementChannel } from "@/lib/procurement/catalog";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
import type {
  ProcurementCartGroup,
  ProcurementCartItem,
  ProcurementCartManualItem,
  ProcurementManualOrderForm,
} from "@/lib/procurement/types";
import { useLocaleStore } from "@/stores/locale-store";
import { usePriceConvert } from "@/lib/store/common";
import { cn } from "@/lib/utils";
import { ChevronRight, Minus, MoreVertical, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import RecommendationLink from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
interface SkuAttribute {
  label: string;
  value: string;
}
interface CartSku {
  id: string;
  href: string;
  external?: boolean;
  num_iid?: string | number;
  name: string;
  quantity: number;
  platform?: string;
  unitPriceCents?: number | null;
  subtotalCents?: number | null;
  currency?: "CNY";
  manual?: { cartId: string; lineIndex: number };
  sku_info?: {
    pic_url?: string;
    attributes?: SkuAttribute[];
  };
  is_select?: boolean;
  status?: number;
}
const cartAttributeMetadata = new Set([
  "name",
  "value",
  "original_name",
  "original_value",
  "prop_id",
  "attribute_id",
  "language",
  "translated",
  "image",
]);
function cartSpecAttributes(
  attributes: Record<string, string | undefined>[] | undefined,
): SkuAttribute[] {
  return (attributes ?? []).flatMap((attribute) => {
    const name = attribute.name?.trim();
    const value = attribute.value?.trim();
    if (name && value) return [{ label: name, value }];
    return Object.entries(attribute).flatMap(([label, entry]) => {
      const option = entry?.trim();
      if (!option || cartAttributeMetadata.has(label)) return [];
      return [{ label, value: option }];
    });
  });
}

function CartProductLink({
  href,
  external,
  className,
  children,
}: {
  href: string;
  external?: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }
  return (
    <RecommendationLink
      href={href}
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </RecommendationLink>
  );
}

function CartImage({
  src,
  alt,
  className,
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  const url = fixImageUrl(src);
  if (!url) return <div className={className} />;
  return (
    <img
      src={url}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
    />
  );
}
interface CartShop {
  id: string;
  name: string;
  avatar?: string;
  icon?: string;
  freight_fee?: number;
  goods_amount?: number;
}
interface CartGroup {
  skus: CartSku[];
  shop: CartShop;
}
const SOURCE_TABS = [
  { label: "1688", value: "1688", image: "/assets/images/1688.png" },
  { label: "Taobao", value: "taobao", image: "/assets/images/taobao.png" },
  { label: "Weidian", value: "weidian", image: "/assets/images/weidian.png" },
];
const MOBILE_BOTTOM_NAV_HEIGHT = 60;
const MOBILE_CART_ACTION_BAR_HEIGHT = 70;
const MOBILE_CART_ACTION_BOTTOM = `calc(${MOBILE_BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`;
const MOBILE_CART_CONTENT_SPACER = `calc(${MOBILE_CART_ACTION_BAR_HEIGHT}px + env(safe-area-inset-bottom))`;
const MOBILE_CART_BOTTOM_SPACE_ATTR = "data-haiou-cart-mobile-bottom-space";
function loadCart() {
  return getProcurementCart();
}

function CartSkeleton() {
  return (
    <div className="py-3 pb-4 md:py-4 lg:pb-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-4">
        <div className="min-w-0 space-y-3 lg:col-span-2">
          <div className="hidden w-full items-center gap-3 rounded-lg bg-white px-4 py-3 lg:flex">
            <Skeleton className="size-4 rounded-sm" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex items-center justify-between px-1 py-1 lg:hidden">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-10" />
          </div>
          <div className="rounded-lg bg-white px-4">
            <div className="flex items-center gap-3 border-b py-3">
              <Skeleton className="size-4 rounded-sm" />
              <Skeleton className="size-5" />
              <Skeleton className="h-3 w-40" />
            </div>
            <div className="flex items-center gap-3 py-3 lg:hidden">
              <Skeleton className="size-4 shrink-0 rounded-sm" />
              <Skeleton className="size-25 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-7 w-24" />
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-8 w-28" />
                </div>
              </div>
            </div>
            <div className="hidden p-4 lg:block">
              <div className="flex gap-3">
                <Skeleton className="size-25 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-3">
                  <Skeleton className="h-3 w-2/3" />
                  <div className="flex items-center justify-between gap-4">
                    <Skeleton className="h-9 w-[260px]" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-9 w-32" />
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="size-9" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="hidden lg:col-span-1 lg:block">
          <div className="rounded-lg bg-white p-5">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="mt-2 h-4 w-full" />
            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="mt-2 h-3 w-48" />
            <Skeleton className="mt-4 h-11 w-full" />
          </div>
        </div>
      </div>
      <div
        className="safe-area-pb fixed start-0 end-0 z-40 flex items-center justify-between gap-4 border-t bg-white px-4 py-3 lg:hidden"
        style={{ bottom: MOBILE_CART_ACTION_BOTTOM }}
      >
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <Skeleton className="size-4 rounded-sm" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="ms-auto h-6 w-20" />
          </div>
          <Skeleton className="ms-auto h-3 w-40" />
        </div>
        <Skeleton className="h-11 w-28 shrink-0 rounded-full" />
      </div>
    </div>
  );
}

export default function PageClient() {
  const session = useProcurementSessionStore(
    (state) => state.clientStateVersion,
  );
  return <Cart key={session} />;
}

function Cart() {
  const translate = useTranslations();
  const priceConvert = usePriceConvert();
  const language = useLocaleStore((state) => LOCALE_HTML_LANG[state.locale]);
  const hasSession = useProcurementSessionStore((state) => state.hasSession);
  const session = useProcurementSessionStore(
    (state) => state.clientStateVersion,
  );
  const { data, loading, error, reload } = useProcurementResource(
    loadCart,
    hasSession ? true : null,
  );
  const [updatedItems, setUpdatedItems] = useState<
    Record<string, ProcurementCartItem | ProcurementCartManualItem | null>
  >({});
  const cartGroups = (data?.groups ?? []).flatMap<ProcurementCartGroup>(
    (group) => {
      if (group.type === "manual") {
        const items = group.items.flatMap((item) => {
          const updated = updatedItems[item.id];
          if (
            updated === null ||
            item.state === "submitted" ||
            item.state === "removed"
          )
            return [];
          return updated?.type === "manual" ? [updated] : [item];
        });
        return items.length ? [{ ...group, items }] : [];
      }
      const items = group.items.flatMap((item) => {
        const updated = updatedItems[item.id];
        if (updated === null) return [];
        return updated && updated.type !== "manual" ? [updated] : [item];
      });
      return items.length ? [{ ...group, items }] : [];
    },
  );
  const items = cartGroups.flatMap((group) =>
    group.type === "manual" ? [] : group.items,
  );
  const manualItems = cartGroups.flatMap((group) =>
    group.type === "manual" ? group.items : [],
  );
  const cartData: CartGroup[] = cartGroups.flatMap<CartGroup>((group) => {
    if (group.type === "manual") {
      const skus = group.items.flatMap((item) =>
        item.form.items.map((line, index) => ({
          id: item.form.items.length === 1 ? item.id : `${item.id}:${index}`,
          href: line.productUrl,
          external: true,
          platform: item.form.sourcePlatform,
          num_iid: `${item.id}:${index}`,
          name: line.name,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          currency: "CNY" as const,
          manual: { cartId: item.id, lineIndex: index },
          sku_info: {
            pic_url: line.imageUrl ?? undefined,
            attributes: line.specification
              ? [{ label: "", value: line.specification }]
              : [],
          },
        })),
      );
      if (!skus.length) return [];
      return [
        {
          shop: {
            id: group.key,
            name: group.shop.name || translate("Unknown Shop"),
          },
          skus,
        },
      ];
    }
    const channel = procurementChannel(group.channel);
    const skus = group.items.flatMap((item) => {
      const itemChannel = procurementChannel(item.channel);
      if (!itemChannel) return [];
      const variant = item.product.variants.find(
        (entry) => entry.skuId === item.skuId,
      );
      const title = purchaseProductTitle(item.product, language);
      return [
        {
          id: item.id,
          href: purchaseProductHref(itemChannel, item.productId, title),
          platform: itemChannel,
          num_iid: item.productId,
          name: title,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          subtotalCents: item.subtotalCents,
          currency: item.currency ?? "CNY",
          status: !variant || variant.stock === 0 ? 2 : undefined,
          sku_info: {
            pic_url: variant?.image ?? item.product.images[0],
            attributes: cartSpecAttributes(variant?.attributes),
          },
        },
      ];
    });
    if (!skus.length) return [];
    return [
      {
        shop: {
          id: group.key,
          name:
            group.shop.name ||
            SOURCE_TABS.find((tab) => tab.value === channel)?.label ||
            translate("Unknown Shop"),
        },
        skus,
      },
    ];
  });
  const [specModalOpen, setSpecModalOpen] = useState(false);
  const [editingSku, setEditingSku] = useState<CartSku | null>(null);
  const [localSelections, setLocalSelections] = useState<
    Record<string, boolean>
  >({});
  const [localQuantities, setLocalQuantities] = useState<
    Record<string, number>
  >({});
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(
    null,
  );
  const cartRootRef = useRef<HTMLDivElement | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const pending = useRef(false);
  const [mobileEditMode, setMobileEditMode] = useState(false);
  const router = useRouter();
  const login = purchaseLoginHref("/cart");

  function reportError(error: unknown, message: string) {
    if (useProcurementSessionStore.getState().clientStateVersion !== session)
      return;
    if (error instanceof ProcurementApiError && error.status === 401) {
      router.push(login);
    } else {
      toast.error(getErrorMessage(error) || message);
      if (error instanceof ProcurementApiError && error.status === 409) {
        setUpdatedItems({});
        setLocalQuantities({});
        reload();
      }
    }
  }
  useEffect(() => {
    if (!loading && !cartData.length) return;
    const root = cartRootRef.current;
    const target =
      root?.closest<HTMLElement>("[data-haiou-page-content]") || document.body;
    target.setAttribute(MOBILE_CART_BOTTOM_SPACE_ATTR, "true");
    target.style.setProperty(
      "--haiou-cart-mobile-bottom-space",
      MOBILE_CART_CONTENT_SPACER,
    );
    return () => {
      target.removeAttribute(MOBILE_CART_BOTTOM_SPACE_ATTR);
      target.style.removeProperty("--haiou-cart-mobile-bottom-space");
    };
  }, [cartData.length, loading]);
  // 可提交的商品：不包括已失效的
  const allSkuIds = cartData
    .flatMap((g) => g.skus ?? [])
    .filter((s) => s.status !== 2)
    .map((s) => s.id);
  const selectedIds = allSkuIds.filter(
    (id) => localSelections[String(id)] ?? false,
  );
  const allSelected =
    allSkuIds.length > 0 && selectedIds.length === allSkuIds.length;
  const toggleAll = (checked: boolean) => {
    setLocalSelections((prev) => {
      const next = { ...prev };
      allSkuIds.forEach((id) => {
        next[String(id)] = checked;
      });
      return next;
    });
  };
  const toggleSku = (skuId: string, checked: boolean) => {
    const sku = cartData
      .flatMap((group) => group.skus ?? [])
      .find((entry) => entry.id === skuId);
    const ids = sku?.manual
      ? cartData
          .flatMap((group) => group.skus ?? [])
          .filter((entry) => entry.manual?.cartId === sku.manual?.cartId)
          .map((entry) => entry.id)
      : [skuId];
    setLocalSelections((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        next[String(id)] = checked;
      });
      return next;
    });
  };
  const toggleShop = (group: CartGroup, checked: boolean) => {
    setLocalSelections((prev) => {
      const next = { ...prev };
      (group.skus ?? [])
        .filter((s) => s.status !== 2)
        .forEach((s) => {
          next[String(s.id)] = checked;
        });
      return next;
    });
  };
  const isShopAllSelected = (group: CartGroup) =>
    !!(group.skus ?? []).filter((s) => s.status !== 2).length &&
    (group.skus ?? [])
      .filter((s) => s.status !== 2)
      .every((s) => localSelections[String(s.id)] ?? false);
  const selectedItems = items.filter((item) => selectedIds.includes(item.id));
  const selectedManualItems = manualItems.filter((item) =>
    item.form.items.some((_, index) =>
      selectedIds.includes(
        item.form.items.length === 1 ? item.id : `${item.id}:${index}`,
      ),
    ),
  );
  const previewItems = [
    ...selectedItems.map(({ id, version }) => ({
      id,
      type: "standard" as const,
      version,
    })),
    ...selectedManualItems.map(({ id, version }) => ({
      id,
      type: "manual" as const,
      version,
    })),
  ];
  function cartPrice(sku: CartSku, quantity: number) {
    if (sku.unitPriceCents == null) return null;
    return {
      unit: sku.unitPriceCents,
      subtotal:
        quantity === sku.quantity && sku.subtotalCents != null
          ? sku.subtotalCents
          : sku.unitPriceCents * quantity,
      currency: sku.currency ?? "CNY",
    };
  }
  const selectedGoodsCents = cartData
    .flatMap((group) => group.skus)
    .filter((sku) => selectedIds.includes(sku.id))
    .reduce<number | null>((total, sku) => {
      if (total == null) return null;
      const quantity = localQuantities[sku.id] ?? sku.quantity ?? 1;
      const price = cartPrice(sku, quantity);
      return price == null ? null : total + price.subtotal;
    }, 0);
  const selectedGoodsTotal = !selectedIds.length
    ? 0
    : selectedGoodsCents == null
      ? null
      : selectedGoodsCents / 100;

  function showPrice(cents: number, currency: string) {
    return currency === "CNY"
      ? priceConvert(cents / 100, { useSymbol: true, needShow: true })
      : `${currency} ${(cents / 100).toFixed(2)}`;
  }

  async function updateManualQuantity(sku: CartSku, value: number) {
    const entry = manualItems.find((item) => item.id === sku.manual?.cartId);
    const lineIndex = sku.manual?.lineIndex;
    if (!entry || lineIndex == null) return;
    const current = entry.form.items[lineIndex]?.quantity;
    const next = Math.max(1, Math.min(Math.trunc(value), 999));
    if (!Number.isFinite(next) || next === current) {
      setLocalQuantities((previous) => ({
        ...previous,
        [sku.id]: current ?? sku.quantity,
      }));
      return;
    }
    pending.current = true;
    setMutating(true);
    setLocalQuantities((previous) => ({ ...previous, [sku.id]: next }));
    try {
      const form: ProcurementManualOrderForm = {
        ...entry.form,
        items: entry.form.items.map((line, index) =>
          index === lineIndex ? { ...line, quantity: next } : line,
        ),
      };
      const updated = await updateProcurementManualCartItem(
        entry.id,
        entry.version,
        form,
      );
      setUpdatedItems((previous) => ({ ...previous, [entry.id]: updated }));
      setLocalQuantities((previous) => ({
        ...previous,
        [sku.id]: updated.form.items[lineIndex]?.quantity ?? next,
      }));
      window.dispatchEvent(new Event(procurementCartChanged));
    } catch (error) {
      setLocalQuantities((previous) => ({
        ...previous,
        [sku.id]: current ?? sku.quantity,
      }));
      reportError(error, translate("Failed to update quantity"));
    } finally {
      pending.current = false;
      setMutating(false);
    }
  }

  async function updateQuantity(skuId: string, value: number) {
    if (pending.current) return;
    const sku = cartData
      .flatMap((group) => group.skus)
      .find((entry) => entry.id === skuId);
    if (sku?.manual) {
      await updateManualQuantity(sku, value);
      return;
    }
    const item = items.find(({ id }) => id === skuId);
    if (!item) return;
    const stock = item.product.variants.find(
      (variant) => variant.skuId === item.skuId,
    )?.stock;
    if (stock === 0) return;
    const next = Math.max(1, Math.min(Math.trunc(value), stock ?? 999, 999));
    if (!Number.isFinite(next) || next === item.quantity) {
      setLocalQuantities((previous) => ({
        ...previous,
        [skuId]: item.quantity,
      }));
      return;
    }
    pending.current = true;
    setMutating(true);
    setLocalQuantities((previous) => ({ ...previous, [skuId]: next }));
    try {
      const updated = await updateProcurementCartItem(item, next);
      setUpdatedItems((previous) => ({ ...previous, [skuId]: updated }));
      setLocalQuantities((previous) => ({
        ...previous,
        [skuId]: updated.quantity,
      }));
      window.dispatchEvent(new Event(procurementCartChanged));
    } catch (error) {
      setLocalQuantities((previous) => ({
        ...previous,
        [skuId]: item.quantity,
      }));
      reportError(error, translate("Failed to update quantity"));
    } finally {
      pending.current = false;
      setMutating(false);
    }
  }

  const openSpecModal = (sku: CartSku) => {
    setEditingSku(sku);
    setSpecModalOpen(true);
  };
  const closeSpecModal = () => {
    setSpecModalOpen(false);
    setEditingSku(null);
  };

  async function handleSubmitOrder() {
    if (pending.current || !previewItems.length) return;
    pending.current = true;
    setSubmitLoading(true);
    try {
      const checkoutQuote = await previewProcurementCart(previewItems);
      if (
        useProcurementSessionStore.getState().clientStateVersion === session
      ) {
        const sameChannel = selectedItems.every(
          (item) => item.channel === selectedItems[0]?.channel,
        );
        router.push(
          startPurchaseCheckout(
            checkoutQuote,
            "/cart",
            [
              ...selectedItems.map((item) =>
                purchaseCheckoutItem(item.product, item.skuId, language),
              ),
              ...selectedManualItems.flatMap((item) =>
                purchaseManualCheckoutItems(item.form),
              ),
            ],
            sameChannel ? selectedItems[0]?.channel : undefined,
          ),
        );
      }
    } catch (error) {
      reportError(error, translate("Operation failed"));
    } finally {
      pending.current = false;
      setSubmitLoading(false);
    }
  }

  async function handleDeleteCart(ids: string[]) {
    if (!ids.length || pending.current) return;
    pending.current = true;
    setMutating(true);
    setDeleting(true);
    try {
      for (const id of ids) {
        if (
          useProcurementSessionStore.getState().clientStateVersion !== session
        )
          return;
        const sku = cartData
          .flatMap((group) => group.skus)
          .find((entry) => entry.id === id);
        const manual = manualItems.find(
          (item) => item.id === sku?.manual?.cartId,
        );
        if (sku?.manual && manual) {
          if (manual.form.items.length <= 1) {
            await deleteProcurementManualCartItem(manual.id, manual.version);
            setUpdatedItems((previous) => ({ ...previous, [manual.id]: null }));
          } else {
            const updated = await updateProcurementManualCartItem(
              manual.id,
              manual.version,
              {
                ...manual.form,
                items: manual.form.items.filter(
                  (_, index) => index !== sku.manual?.lineIndex,
                ),
              },
            );
            setUpdatedItems((previous) => ({
              ...previous,
              [manual.id]: updated,
            }));
          }
        } else {
          await deleteProcurementCartItem(id);
          setUpdatedItems((previous) => ({ ...previous, [id]: null }));
        }
        setLocalSelections((previous) => ({ ...previous, [id]: false }));
        setPendingDeleteIds(
          (previous) => previous?.filter((itemId) => itemId !== id) ?? null,
        );
        window.dispatchEvent(new Event(procurementCartChanged));
      }
      setPendingDeleteIds(null);
      setMobileEditMode(false);
    } catch (error) {
      reportError(error, translate("Failed to delete item"));
    } finally {
      pending.current = false;
      setMutating(false);
      setDeleting(false);
    }
  }
  const openDeleteConfirm = (ids: string[]) => setPendingDeleteIds(ids);
  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) {
      toast.error(translate("Please select items first"));
      return;
    }
    openDeleteConfirm(selectedIds);
  };
  if (
    !hasSession ||
    (error instanceof ProcurementApiError && error.status === 401)
  ) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center md:py-20">
        <Button
          asChild
          className="h-12 w-full max-w-[280px] rounded-full text-base font-medium"
        >
          <RecommendationLink href={login}>
            {translate("Sign in")}
          </RecommendationLink>
        </Button>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <p role="alert">
          {getErrorMessage(error) || translate("Operation failed")}
        </p>
        <Button onClick={reload}>{translate("Try again")}</Button>
      </div>
    );
  }
  if (loading) return <CartSkeleton />;
  if (cartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center md:py-20">
        <CartEmptyIllustration
          aria-hidden="true"
          focusable="false"
          className="mb-6 h-auto w-44 max-w-full md:w-56"
        />
        <p className="mb-6 text-lg font-medium text-gray-700 md:text-xl">
          {translate("Your cart is empty!")}
        </p>
        <Button
          className="h-12 w-full max-w-[280px] rounded-full text-base font-medium"
          asChild
        >
          <RecommendationLink href="/">
            {translate("START SHOPPING")}
          </RecommendationLink>
        </Button>
      </div>
    );
  }
  return (
    <div ref={cartRootRef}>
      <div className="py-3 pb-4 md:py-4 lg:pb-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-4">
          {/* 左侧：购物车商品列表 */}
          <div className="min-w-0 space-y-3 lg:col-span-2">
            {/* ALL 单独一行 */}
            <div className="hidden w-full items-center gap-3 rounded-lg bg-white px-4 py-3 lg:flex">
              <Checkbox
                id="cart-select-all"
                checked={allSelected}
                onCheckedChange={(c) => toggleAll(c === true)}
              />
              <label
                htmlFor="cart-select-all"
                className="cursor-pointer text-sm font-medium"
              >
                {translate("ALL")}
              </label>
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-600 transition-colors hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
                <span>{translate("Delete selected")}</span>
              </button>
            </div>
            <div className="flex items-center justify-between px-1 py-1 lg:hidden">
              <div className="flex min-w-0 items-baseline gap-1">
                <h2 className="text-lg font-bold text-gray-900">
                  {translate("Shopping Cart")}
                </h2>
                <span className="shrink-0 text-sm text-gray-500">
                  {translate("({count} items)", {
                    count: allSkuIds.length,
                  })}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileEditMode((prev) => !prev)}
                className="text-primary shrink-0 text-sm font-medium"
              >
                {mobileEditMode ? translate("Done") : translate("Edit")}
              </button>
            </div>

            {/* 按店铺分组的商品卡片 */}
            {cartData.map((group, groupIndex) => (
              <div
                key={group.shop?.id ?? `shop-${groupIndex}`}
                className="rounded-lg bg-white px-4"
              >
                {/* 店铺头部：复选框 + 图标 + 名称 + 删除 */}
                <div className="flex items-center justify-between gap-3 border-b py-3">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={isShopAllSelected(group)}
                      onCheckedChange={(c) => toggleShop(group, c === true)}
                      disabled={
                        group.skus?.filter((s) => s.status !== 2).length === 0
                      }
                      className={cn(
                        group.skus?.filter((s) => s.status !== 2).length ===
                          0 && "border-gray-500 bg-gray-300",
                      )}
                    />
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden bg-white">
                      {/* {group.shop?.name ? (
<img
src={"/assets/images/common/1688.png"}
alt=""
className="w-full h-full object-cover"
referrerPolicy="no-referrer"
/>
) : (
<Store className="h-4 w-4" />
)} */}

                      {SOURCE_TABS.find(
                        (tab) =>
                          tab.value === (group.skus?.[0]?.platform as string),
                      )?.image && (
                        <img
                          src={
                            SOURCE_TABS.find(
                              (tab) =>
                                tab.value ===
                                (group.skus?.[0]?.platform as string),
                            )?.image
                          }
                          alt=""
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </div>
                    <span className="text-xs font-bold text-gray-800">
                      {group.shop?.name ?? translate("Unknown Shop")}
                    </span>
                  </div>
                  {/* <button
type="button"
className="p-2 text-gray-400 hover:text-red-500 transition-colors"
aria-label="Delete shop"
>
<Trash2 className="h-5 w-5" />
</button> */}
                </div>

                {/* 移动端：卡片式商品列表 */}
                <div className="lg:hidden">
                  {(group.skus ?? []).map((sku) => {
                    const qty = localQuantities[sku.id] ?? sku.quantity ?? 1;
                    const price = cartPrice(sku, qty);
                    const attrs = sku.sku_info?.attributes ?? [];
                    const specText =
                      attrs.map((a) => a.value).join(",") ||
                      attrs.map((a) => `${a.label}:${a.value}`).join(", ") ||
                      translate("-");
                    return (
                      <div
                        key={sku.id}
                        className="flex items-center gap-3 py-3"
                      >
                        <Checkbox
                          checked={localSelections[String(sku.id)] ?? false}
                          onCheckedChange={(c) => toggleSku(sku.id, c === true)}
                          disabled={sku.status === 2}
                          className={cn(
                            "mt-1 shrink-0",
                            sku.status === 2 &&
                              "cursor-not-allowed border-gray-500 bg-gray-300",
                          )}
                        />
                        <CartProductLink
                          href={sku.href}
                          external={sku.external}
                          className="h-25 w-25 shrink-0 overflow-hidden rounded-lg bg-gray-100"
                        >
                          <CartImage
                            src={sku.sku_info?.pic_url}
                            alt={sku.name}
                            className="h-full w-full object-cover"
                          />
                        </CartProductLink>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <CartProductLink
                              href={sku.href}
                              external={sku.external}
                              className="hover:text-primary line-clamp-2 text-xs text-gray-800"
                            >
                              {sku.name}
                            </CartProductLink>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="-me-2 p-2 text-gray-400 hover:text-gray-600"
                                  aria-label={translate("More actions")}
                                >
                                  <MoreVertical className="h-5 w-5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {/* <DropdownMenuItem
className="text-gray-600 cursor-pointer"
onSelect={() => { }}
>
<Heart className="h-4 w-4 me-2" />
{translate("Move to Favorite")}
</DropdownMenuItem> */}
                                <DropdownMenuItem
                                  className="cursor-pointer text-red-600 focus:text-red-600"
                                  onSelect={() => openDeleteConfirm([sku.id])}
                                >
                                  <Trash2 className="me-2 h-4 w-4" />
                                  {translate("Delete")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          {sku.manual ? (
                            <span className="flex w-fit max-w-full items-center rounded-md bg-gray-100 px-2.5 py-1.5 text-xs text-gray-600">
                              <span className="truncate">{specText}</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openSpecModal(sku)}
                              className="flex w-fit max-w-full items-center gap-1 rounded-md bg-gray-100 px-2.5 py-1.5 text-xs text-gray-600"
                            >
                              <span className="truncate">{specText}</span>
                              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                            </button>
                          )}

                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="text-sm font-bold text-gray-900">
                              <bdi dir="ltr">
                                {price == null
                                  ? "—"
                                  : showPrice(price.unit, price.currency)}
                              </bdi>
                            </div>
                            <div className="flex justify-between">
                              <div className="flex items-center overflow-hidden rounded border">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateQuantity(sku.id, qty - 1)
                                  }
                                  disabled={
                                    qty <= 1 ||
                                    sku.status === 2 ||
                                    mutating ||
                                    submitLoading
                                  }
                                  className="flex h-8 w-8 items-center justify-center bg-gray-100 active:bg-gray-200 disabled:opacity-50"
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <Input
                                  type="number"
                                  min={1}
                                  disabled={
                                    sku.status === 2 ||
                                    mutating ||
                                    submitLoading
                                  }
                                  value={qty}
                                  onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    if (!isNaN(v) && v >= 1)
                                      setLocalQuantities((prev) => ({
                                        ...prev,
                                        [sku.id]: v,
                                      }));
                                  }}
                                  onBlur={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    if (!isNaN(v) && v >= 1)
                                      updateQuantity(sku.id, v);
                                  }}
                                  className="h-8 w-10 [appearance:textfield] rounded-none border-0 bg-white text-center text-sm shadow-none outline-none focus:border-0 focus:bg-white focus:shadow-none focus:ring-0 focus:outline-none focus-visible:border-0 focus-visible:bg-white focus-visible:shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateQuantity(sku.id, qty + 1)
                                  }
                                  disabled={
                                    sku.status === 2 ||
                                    mutating ||
                                    submitLoading
                                  }
                                  className="flex h-8 w-8 items-center justify-center bg-gray-100 active:bg-gray-200"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 桌面端：按 num_iid 分组，同商品多 SKU 显示在一起 */}
                <div className="hidden divide-y lg:block">
                  {(() => {
                    const skus = group.skus ?? [];
                    const byNumIid = new Map<string | number, CartSku[]>();
                    skus.forEach((s) => {
                      const key = s.num_iid ?? `single-${s.id}`;
                      if (!byNumIid.has(key)) byNumIid.set(key, []);
                      byNumIid.get(key)!.push(s);
                    });
                    return Array.from(byNumIid.values()).map((productSkus) => {
                      const first = productSkus[0];
                      const mainPic = first.sku_info?.pic_url;
                      const mainName = first.name;
                      return (
                        <div key={first.num_iid ?? first.id} className="p-4">
                          {/* 商品主图 | 名称（上）+ 规格（名称下面） */}
                          <div className="flex gap-3">
                            <CartProductLink
                              href={first.href}
                              external={first.external}
                              className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100 md:h-25 md:w-25"
                            >
                              <CartImage
                                src={mainPic}
                                alt={mainName}
                                className="h-full w-full object-cover"
                              />
                            </CartProductLink>
                            <div className="flex min-w-0 flex-1 flex-col">
                              {/* 商品名称 */}
                              <CartProductLink
                                href={first.href}
                                external={first.external}
                                className="hover:text-primary line-clamp-2 text-xs text-gray-800"
                              >
                                {mainName}
                              </CartProductLink>
                              <div>
                                {productSkus.map((sku) => {
                                  const qty =
                                    localQuantities[sku.id] ??
                                    sku.quantity ??
                                    1;
                                  const price = cartPrice(sku, qty);
                                  const attrs = sku.sku_info?.attributes ?? [];
                                  const specText =
                                    attrs
                                      .map((a) => ` ${a.value}`)
                                      .join(", ") ||
                                    attrs.map((a) => a.value).join(", ") ||
                                    translate("-");
                                  return (
                                    <div
                                      key={sku.id}
                                      className="flex flex-col items-center justify-between gap-4 rounded py-2 transition-colors hover:bg-gray-50/30 sm:flex-row"
                                    >
                                      <div className="relative flex w-[260px] min-w-[260px] items-center gap-3 rounded-md bg-[#F0F0F0] px-2 py-1">
                                        <Checkbox
                                          checked={
                                            localSelections[String(sku.id)] ??
                                            false
                                          }
                                          onCheckedChange={(c) =>
                                            toggleSku(sku.id, c === true)
                                          }
                                          className={cn(
                                            sku.status === 2 &&
                                              "cursor-not-allowed border-gray-500 bg-gray-300",
                                          )}
                                          disabled={sku.status === 2}
                                        />
                                        {fixImageUrl(sku.sku_info?.pic_url) ? (
                                          <CartImage
                                            src={sku.sku_info?.pic_url}
                                            alt=""
                                            className="h-6 w-6 shrink-0 rounded object-cover"
                                          />
                                        ) : null}
                                        <span className="text-sm text-gray-700">
                                          {specText}
                                        </span>
                                        {/* <ChevronDown className="h-4 w-4 text-gray-500 shrink-0 absolute end-1 top-1/2 -translate-y-1/2" /> */}
                                      </div>

                                      <div className="text-xs font-medium text-gray-900">
                                        <bdi dir="ltr">
                                          {price == null
                                            ? "—"
                                            : showPrice(
                                                price.unit,
                                                price.currency,
                                              )}
                                        </bdi>
                                      </div>

                                      {/* 数量、收藏、小计、删除 */}
                                      <div className="flex items-center justify-between gap-4 sm:justify-end sm:gap-6">
                                        <div className="flex items-center overflow-hidden rounded border">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              updateQuantity(sku.id, qty - 1)
                                            }
                                            disabled={
                                              qty <= 1 ||
                                              sku.status === 2 ||
                                              mutating ||
                                              submitLoading
                                            }
                                            className="flex h-9 w-9 items-center justify-center bg-gray-100 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                            <Minus className="h-4 w-4" />
                                          </button>
                                          <Input
                                            type="number"
                                            min={1}
                                            disabled={
                                              sku.status === 2 ||
                                              mutating ||
                                              submitLoading
                                            }
                                            value={qty}
                                            onChange={(e) => {
                                              const v = parseInt(
                                                e.target.value,
                                                10,
                                              );
                                              if (!isNaN(v) && v >= 1)
                                                setLocalQuantities((prev) => ({
                                                  ...prev,
                                                  [sku.id]: v,
                                                }));
                                            }}
                                            onBlur={(e) => {
                                              const v = parseInt(
                                                e.target.value,
                                                10,
                                              );
                                              if (!isNaN(v) && v >= 1)
                                                updateQuantity(sku.id, v);
                                            }}
                                            className="h-9 w-14 [appearance:textfield] rounded-none border-0 bg-white text-center shadow-none outline-none focus:border-0 focus:bg-white focus:shadow-none focus:ring-0 focus:outline-none focus-visible:border-0 focus-visible:bg-white focus-visible:shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                          />
                                          <button
                                            type="button"
                                            onClick={() =>
                                              updateQuantity(sku.id, qty + 1)
                                            }
                                            disabled={
                                              sku.status === 2 ||
                                              mutating ||
                                              submitLoading
                                            }
                                            className="flex h-9 w-9 items-center justify-center bg-gray-100 hover:bg-gray-200"
                                          >
                                            <Plus className="h-4 w-4" />
                                          </button>
                                        </div>
                                        <div className="min-w-[70px] text-end text-sm font-bold text-gray-900">
                                          <span className="block text-xs text-gray-500">
                                            {translate("Subtotal")}
                                          </span>
                                          <bdi dir="ltr">
                                            {price == null
                                              ? "—"
                                              : showPrice(
                                                  price.subtotal,
                                                  price.currency,
                                                )}
                                          </bdi>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openDeleteConfirm([sku.id])
                                          }
                                          disabled={mutating || submitLoading}
                                          className="cursor-pointer p-2 text-gray-400 transition-colors hover:text-red-500"
                                          aria-label={translate("Delete")}
                                        >
                                          <Trash2 className="h-5 w-5" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Add another option */}
                {/* <div className="px-4 py-3 border-t">
      <button
        type="button"
        className="flex items-center gap-1 text-sm text-primary hover:underline font-medium"
      >
        <Plus className="h-4 w-4" />
        {translate("+ Add another option")}
      </button>
    </div> */}
              </div>
            ))}
          </div>

          {/* 右侧：订单摘要（桌面端显示） */}
          <div className="hidden lg:col-span-1 lg:block">
            <div className="sticky top-[calc(var(--header-height,0px)+16px)] rounded-lg bg-white p-5">
              <h3 className="text-lg font-semibold text-gray-900">
                {translate("Order Summary")}
              </h3>
              <p className="mt-1 mb-4 text-sm text-gray-500">
                {translate("Final price will be confirmed on the next page")}
              </p>

              <div className="space-y-3 text-sm">
                {/* <div className="flex justify-between">
<span className="text-gray-600">{additionalServiceFeeLabel}</span>
<span>{priceConvert(0)}</span>
</div> */}
                {/* <p className="text-xs" style={{ color: additionalServiceFeeHintColor }}>{additionalServiceFeeHint}</p> */}
                {/* <div className="flex justify-between">
<span className="text-gray-600">{purchasingServiceFeeLabel}</span>
<span>{priceConvert(0)}</span>
</div> */}
                {/* <div className="flex justify-between">
<span className="text-gray-600">{domesticFreightLabel}</span>
<span>{priceConvert(selectedFreightTotal, { useSymbol: true })}</span>
</div> */}
                <div className="flex justify-between border-t pt-2 text-lg font-medium">
                  <span>{translate("Total Amount")}</span>
                  <span className="text-red-500">
                    <bdi dir="ltr">
                      {selectedGoodsTotal == null
                        ? "—"
                        : priceConvert(selectedGoodsTotal, {
                            useSymbol: true,
                            needShow: true,
                          })}
                    </bdi>
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  {translate("Does not include international shipping fee")}
                </p>
              </div>

              {/* <label className="mt-4 flex items-start gap-2 cursor-pointer">
<Checkbox
checked={agreeDisclaimer}
onCheckedChange={(c) => setAgreeDisclaimer(c === true)}
className="mt-0.5"
/>
<DisclaimerContent prefix={translate("I agree and read")} items={disclaimerItems} className="text-sm text-gray-600" />
</label> */}

              <Button
                className="mt-4 h-11 w-full"
                disabled={!previewItems.length || submitLoading || mutating}
                onClick={handleSubmitOrder}
              >
                {submitLoading ? (
                  <Spinner className="me-2 h-4 w-4" />
                ) : (
                  translate("Submit Order")
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 移动端底部固定栏 */}
      <div
        className="safe-area-pb fixed start-0 end-0 z-40 flex items-center justify-between gap-4 border-t bg-white px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden"
        style={{ bottom: MOBILE_CART_ACTION_BOTTOM }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <Checkbox
              id="cart-mobile-select-all"
              checked={allSelected}
              onCheckedChange={(c) => toggleAll(c === true)}
            />
            <label
              htmlFor="cart-mobile-select-all"
              className="shrink-0 cursor-pointer text-sm font-medium text-gray-900 uppercase"
            >
              {translate("ALL")}
            </label>
            <p className="flex-1 text-end text-lg font-bold text-gray-900">
              <bdi dir="ltr">
                {selectedGoodsTotal == null
                  ? "—"
                  : priceConvert(selectedGoodsTotal, {
                      useSymbol: true,
                      needShow: true,
                    })}
              </bdi>
            </p>
          </div>
          <p className="text-end text-xs whitespace-nowrap text-gray-500">
            {translate("Total (excluding shipping cost)")}
          </p>
        </div>
        {mobileEditMode ? (
          <Button
            className="h-11 shrink-0 gap-1.5 rounded-full bg-red-500 px-4 font-semibold text-white hover:bg-red-600"
            disabled={selectedIds.length === 0}
            onClick={() => openDeleteConfirm(selectedIds)}
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            <span>
              {translate("Delete selected")}({selectedIds.length})
            </span>
          </Button>
        ) : (
          <Button
            className="bg-primary hover:bg-primary/90 h-11 shrink-0 rounded-full px-2 font-semibold text-white"
            disabled={!previewItems.length || submitLoading || mutating}
            onClick={handleSubmitOrder}
          >
            {submitLoading
              ? translate("Submitting…")
              : translate("Submit Order")}
          </Button>
        )}
      </div>

      {/* 删除确认弹窗 */}
      <AlertDialog
        open={pendingDeleteIds !== null}
        onOpenChange={(open) =>
          !open && !pending.current && setPendingDeleteIds(null)
        }
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {translate("Are you sure you want to remove the items selected?")}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {translate("Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (pendingDeleteIds) void handleDeleteCart(pendingDeleteIds);
              }}
              disabled={mutating || submitLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 min-w-20"
            >
              {deleting ? <Spinner /> : translate("Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 选择规格弹窗 */}
      <Dialog open={specModalOpen} onOpenChange={setSpecModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{translate("Select Specifications")}</DialogTitle>
          </DialogHeader>
          {editingSku && (
            <div className="space-y-3 py-2">
              <div className="flex gap-3">
                <img
                  src={fixImageUrl(editingSku.sku_info?.pic_url)}
                  alt=""
                  className="h-16 w-16 rounded object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm text-gray-800">
                    {editingSku.name}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    {editingSku.sku_info?.attributes
                      ?.map((a) => `${a.label}: ${a.value}`)
                      .join(" / ")}
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                {translate(
                  "To change specifications, please remove this item and add the desired variant from the product page",
                )}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeSpecModal}>
              {translate("Reset")}
            </Button>
            <Button onClick={closeSpecModal}>{translate("Confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
