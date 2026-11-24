"use client";

import { RemarkModal } from "@/components/features/checkout/remark-modal";
import { formatPurchaseAmount } from "@/components/features/orders/procurement-purchase-order";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fixImageUrl } from "@/lib/utils/image-url";
import { motion, useAnimationControls } from "framer-motion";
import { ChevronDown, ChevronUp, FileEdit, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { useProcurementResource } from "@/hooks/use-procurement-resource";
import { getErrorMessage } from "@/lib/error-message";
import {
  checkoutProcurementCart,
  createProcurementManualOrder,
  createProcurementPurchaseOrder,
  getProcurementPurchaseOrder,
  ProcurementApiError,
} from "@/lib/procurement/client";
import {
  procurementCartChanged,
  purchaseLoginHref,
  purchaseOrderRemarkItems,
  purchasePaymentHref,
  readPurchaseDraft,
  type CheckoutRemark,
  savePurchaseDraft,
} from "@/lib/procurement/purchase";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
import type { ProcurementManualOrderForm } from "@/lib/procurement/types";
import { safeRedirectPath } from "@/lib/redirect";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

async function checkoutDestination(checkoutId: string, previewId: string) {
  const result = await checkoutProcurementCart(checkoutId, previewId);
  window.dispatchEvent(new Event(procurementCartChanged));
  return result.orders.length === 1
    ? purchasePaymentHref(result.orders[0].id)
    : "/member-center/purchase-orders";
}

const DISCLAIMER_LINKS = [
  {
    name: "《Purchasing Agent Disclaimer》",
    link: "/blog/purchasing-agent-disclaimer",
  },
  { name: "《Prohibited Items》", link: "/blog/prohibited-items" },
] as const;

function DisclaimerContent({ className = "" }: { className?: string }) {
  const t = useTranslations();
  const validItems = DISCLAIMER_LINKS;
  const linkClass = "text-primary hover:text-primary hover:underline";
  return (
    <span className={className}>
      {t("I agree to")}{" "}
      {validItems.map((item, i) => {
        const sep = i > 0 ? " " : "";
        return (
          <span key={item.name}>
            {sep}
            <a
              href={item.link}
              className={linkClass}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t(item.name)}
            </a>
          </span>
        );
      })}
    </span>
  );
}

async function loadDraft(id: string) {
  const draft = readPurchaseDraft(id);
  if (!draft) return null;

  if (draft.attempted) {
    try {
      const order = await getProcurementPurchaseOrder(id);
      return { draft, order, expired: false };
    } catch (error) {
      if (!(error instanceof ProcurementApiError) || error.status !== 404)
        throw error;
    }
  }
  return {
    draft,
    order: null,
    expired: !!draft.quote && draft.quote.expiresAt <= Date.now(),
  };
}

function declaredAmounts(form: ProcurementManualOrderForm) {
  const goodsCents = form.items.reduce(
    (total, item) => total + item.unitPriceCents * item.quantity,
    0,
  );
  return {
    currency: "CNY",
    goodsCents,
    shippingCents: form.domesticShippingCents,
    serviceCents: null,
    totalCents: goodsCents + form.domesticShippingCents,
  };
}

function PurchaseCheckout({ id }: { id: string }) {
  const t = useTranslations();
  const router = useRouter();
  const session = useProcurementSessionStore((state) => state.hasSession);
  const sessionVersion = useProcurementSessionStore(
    (state) => state.clientStateVersion,
  );
  const { data, loading, error, reload } = useProcurementResource(
    loadDraft,
    session && id ? id : null,
  );
  const [expanded, setExpanded] = useState(false);
  const [remarkLine, setRemarkLine] = useState<number | null>(null);
  const [editedRemarks, setEditedRemarks] =
    useState<Record<number, CheckoutRemark>>();
  const manualForm = data?.draft.form;
  const quotedDraft = data && !data.draft.form ? data.draft : undefined;
  const remarks = editedRemarks ?? data?.draft.remarks;

  function checkoutRemark(index: number) {
    const note = remarks?.[index];
    if (note || !manualForm) return note;
    return {
      remarkText:
        manualForm.items[index]?.remark ||
        (manualForm.items.length === 1 ? manualForm.remark : ""),
      remarkImages: [],
    };
  }
  const activeRemark =
    remarkLine == null ? undefined : checkoutRemark(remarkLine);

  function saveRemark(index: number, note: CheckoutRemark) {
    if (
      useProcurementSessionStore.getState().clientStateVersion !==
      sessionVersion
    )
      return;
    const draft = readPurchaseDraft(id);
    if (!draft) return;
    const remarks = { ...draft.remarks, [index]: note };
    if (draft.form) {
      if (draft.attempted) return;
      const { form } = draft;
      const remark = note.remarkText.trim();
      const editOrderRemark =
        form.items.length === 1 && !form.items[index].remark && !!form.remark;
      const updatedForm = editOrderRemark
        ? { ...form, remark }
        : {
            ...form,
            items: form.items.map((item, line) =>
              line === index ? { ...item, remark } : item,
            ),
          };
      savePurchaseDraft(id, { ...draft, form: updatedForm, remarks });
    } else {
      savePurchaseDraft(id, { ...draft, remarks });
    }
    setEditedRemarks(remarks);
  }
  const [agreed, setAgreed] = useState(false);
  const [disclaimerAttention, setDisclaimerAttention] = useState(false);
  const disclaimerControls = useAnimationControls();
  function setDisclaimer(value: boolean) {
    setAgreed(value);
    if (value) setDisclaimerAttention(false);
  }
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);
  const returnPath = id ? `/checkout?draft=${encodeURIComponent(id)}` : "/cart";
  const quote = data?.draft.quote;
  const quoteExpiresAt =
    data?.order || data?.draft.form ? null : (quote?.expiresAt ?? null);

  useEffect(() => {
    if (!session || loading || error || data) return;
    router.replace("/cart");
  }, [data, error, loading, router, session]);

  useEffect(() => {
    if (quoteExpiresAt == null) return;
    const destination = safeRedirectPath(
      data?.draft.sourcePath || "/cart",
      "/cart",
    );
    const delay = quoteExpiresAt - Date.now();
    if (delay <= 0) {
      router.replace(destination);
      return;
    }
    const timer = window.setTimeout(() => router.replace(destination), delay);
    return () => window.clearTimeout(timer);
  }, [data?.draft.sourcePath, quoteExpiresAt, router]);

  async function submit() {
    if (!data || pending.current) return;
    if (!agreed) {
      setDisclaimerAttention(true);
      void disclaimerControls.start({ x: [0, -6, 6, -4, 4, 0] });
      toast.error(t("Please read and agree to the purchasing agent terms"));
      return;
    }
    pending.current = true;
    setSubmitting(true);
    try {
      const draft = readPurchaseDraft(id);
      if (!draft) return;
      if (draft.quote && draft.quote.expiresAt <= Date.now()) {
        router.replace(safeRedirectPath(draft.sourcePath || "/cart", "/cart"));
        return;
      }
      const remarkItems =
        draft.form || draft.quote.groups?.length
          ? undefined
          : purchaseOrderRemarkItems(draft);
      if (remarkItems?.error) {
        toast.error(t("You can attach up to 20 images in one order"));
        return;
      }
      savePurchaseDraft(id, { ...draft, attempted: true });
      const destination = draft.form
        ? purchasePaymentHref(
            (await createProcurementManualOrder(draft.form)).id,
          )
        : draft.quote.groups?.length
          ? await checkoutDestination(id, draft.quote.id)
          : purchasePaymentHref(
              (
                await createProcurementPurchaseOrder(
                  id,
                  draft.quote.id,
                  remarkItems?.items,
                )
              ).id,
            );
      if (
        useProcurementSessionStore.getState().clientStateVersion ===
        sessionVersion
      ) {
        router.replace(destination);
      }
    } catch (error) {
      if (error instanceof ProcurementApiError && error.status === 401) {
        router.push(purchaseLoginHref(returnPath));
      } else {
        toast.error(getErrorMessage(error) || t("Operation failed"));
        reload();
      }
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }

  if (
    !session ||
    (error instanceof ProcurementApiError && error.status === 401)
  ) {
    return (
      <Button asChild>
        <Link href={purchaseLoginHref(returnPath)}>{t("Sign in")}</Link>
      </Button>
    );
  }
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 py-3 md:py-4 lg:grid-cols-3 lg:gap-4">
        <div className="space-y-4 lg:col-span-2">
          <div className="space-y-4 rounded-lg bg-white px-5 py-3 shadow-[0_0_14px_rgba(0,0,0,0.06)]">
            <Skeleton className="h-5 w-30" />
            <div className="flex gap-3">
              <Skeleton className="h-20 w-20 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-3 w-10" />
              </div>
            </div>
          </div>
        </div>
        <div className="hidden lg:col-span-1 lg:block">
          <div className="overflow-hidden rounded-xl bg-white p-4 shadow-[0_0_14px_rgba(0,0,0,0.06)]">
            <Skeleton className="mb-4 h-6 w-36" />
            <div className="space-y-3 border-t border-[#E2E4F0] pt-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center justify-between">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="ms-auto h-3 w-32" />
            </div>
            <div className="mt-5 flex items-start gap-2.5 border-t border-[#E2E4F0] pt-4">
              <Skeleton className="size-4 shrink-0 rounded-sm" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
            <Skeleton className="mt-4 h-12 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }
  if (error)
    return (
      <div className="space-y-3">
        <p role="alert">{getErrorMessage(error) || t("Operation failed")}</p>
        <Button variant="outline" onClick={reload}>
          {t("Try again")}
        </Button>
      </div>
    );
  if (data?.order)
    return (
      <Button asChild>
        <Link href={purchasePaymentHref(data.order.id)}>{t("Pay Now")}</Link>
      </Button>
    );
  if (!data || data.expired) return null;

  const { goodsCents, shippingCents, serviceCents, totalCents, currency } = data
    .draft.form
    ? declaredAmounts(data.draft.form)
    : data.draft.quote;
  const amounts = [
    [t("Total Product Price"), goodsCents],
    [t("Domestic Shipping Fee"), shippingCents],
    [t("Purchase Service Fee"), serviceCents],
  ] as const;
  const channel = quotedDraft?.channel;
  const sourceLabel =
    manualForm?.sellerName ??
    (channel === "1688"
      ? t("1688")
      : channel === "taobao"
        ? t("Taobao")
        : channel === "weidian"
          ? t("Weidian")
          : t("Unknown Shop"));
  const format = (amount: number | null) =>
    amount == null ? "—" : formatPurchaseAmount(amount, currency);
  const knownPlatform = (platform?: string) =>
    platform === "1688" || platform === "taobao" || platform === "weidian"
      ? platform
      : undefined;
  const shopName = (platform?: string, name?: string | null) =>
    name ||
    (platform === "1688"
      ? t("1688")
      : platform === "taobao"
        ? t("Taobao")
        : platform === "weidian"
          ? t("Weidian")
          : t("Unknown Shop"));
  const quoteGroups = data.draft.quote?.groups ?? [];
  const sections = manualForm
    ? [
        {
          key: "manual",
          platform: undefined,
          shopName: manualForm.sellerName || t("Unknown Shop"),
          lines: manualForm.items.map((item) => ({
            name: item.name,
            sku: item.specification,
            quantity: item.quantity,
            goodsCents: item.unitPriceCents * item.quantity,
          })),
          goodsCents,
          shippingCents,
          serviceCents,
          totalCents,
        },
      ]
    : quoteGroups.length
      ? quoteGroups.map((group) => ({
          key: group.key,
          platform: knownPlatform(group.platform),
          shopName: shopName(group.platform, group.shop.name),
          lines: group.quote.lines ?? [],
          goodsCents: group.quote.goodsCents,
          shippingCents: group.quote.shippingCents,
          serviceCents: group.quote.serviceCents,
          totalCents: group.quote.totalCents,
        }))
      : [
          {
            key: "quote",
            platform: channel,
            shopName: sourceLabel,
            lines: data.draft.quote.lines ?? [],
            goodsCents,
            shippingCents,
            serviceCents,
            totalCents,
          },
        ];
  const sectionViews = sections.reduce<
    Array<(typeof sections)[number] & { start: number }>
  >((views, section) => {
    const previous = views.at(-1);
    const start = previous ? previous.start + previous.lines.length : 0;
    return [...views, { ...section, start }];
  }, []);
  const disclaimer = <DisclaimerContent className="text-xs text-gray-600" />;
  return (
    <>
      <div className="py-3 pb-36 md:py-4 lg:pb-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-4">
          <div className="min-w-0 space-y-4 lg:col-span-2">
            {sectionViews.map((section) => {
              const sectionAmounts = [
                [t("Total Product Price"), section.goodsCents],
                [t("Domestic Shipping Fee"), section.shippingCents],
                [t("Purchase Service Fee"), section.serviceCents],
              ] as const;
              return (
                <section
                  key={section.key}
                  className="overflow-hidden rounded-lg bg-white px-5 shadow-[0_0_14px_rgba(0,0,0,0.06)]"
                >
                  <div className="flex items-center gap-3 border-b py-3">
                    {section.platform && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/assets/images/${section.platform}.png`}
                        alt=""
                        className="size-5 shrink-0 object-cover"
                      />
                    )}
                    <span className="text-xs font-bold text-gray-800">
                      {section.shopName}
                    </span>
                  </div>
                  {section.lines.map((line, index) => {
                    const lineIndex = section.start + index;
                    const manualItem = manualForm?.items[lineIndex];
                    const draftItems = quotedDraft?.items ?? [];
                    const note = checkoutRemark(lineIndex);
                    const matches = draftItems.filter(
                      (item) => item.skuId === line.sku,
                    );
                    const matchingTitles = draftItems.filter(
                      ({ title }) => title === line.name,
                    );
                    const item = manualItem
                      ? {
                          href: manualItem.productUrl,
                          image: manualItem.imageUrl,
                          variant: manualItem.specification,
                        }
                      : (matches.find(({ title }) => title === line.name) ??
                        (matches.length === 1 ? matches[0] : undefined) ??
                        (matchingTitles.length === 1
                          ? matchingTitles[0]
                          : undefined) ??
                        (draftItems.length === 1 ? draftItems[0] : undefined));
                    return (
                      <div
                        key={`${line.sku}:${lineIndex}`}
                        className="border-b pb-2 last:border-b-0"
                      >
                        <div className="flex gap-2 py-2">
                          <div className="h-25 w-25 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                            {item?.image && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.image}
                                alt={line.name}
                                className="h-full w-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            {item ? (
                              <Link
                                href={item.href}
                                target={manualItem ? "_blank" : undefined}
                                rel={
                                  manualItem ? "noopener noreferrer" : undefined
                                }
                                className="hover:text-primary line-clamp-2 text-xs"
                              >
                                {line.name}
                              </Link>
                            ) : (
                              <p className="line-clamp-2 text-xs">
                                {line.name}
                              </p>
                            )}
                            <p className="mt-1 flex items-center gap-1 text-xs text-[#999999]">
                              {item?.variant || line.sku}
                            </p>
                            <button
                              type="button"
                              onClick={() => setRemarkLine(lineIndex)}
                              className="mt-2 flex w-fit cursor-pointer items-center gap-1 rounded-lg bg-[#F0F0F0] px-2 py-1 text-xs hover:bg-gray-300"
                            >
                              <FileEdit className="text-primary h-4 w-4 shrink-0" />
                              <span className="text-[#666]">
                                {t("Product Notes")}
                              </span>
                              {note?.remarkText && (
                                <span className="max-w-[60px] truncate text-[#666]">
                                  {note.remarkText}
                                </span>
                              )}
                              {note?.remarkImages[0] && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={fixImageUrl(note.remarkImages[0])}
                                  alt=""
                                  className="h-5 w-5 shrink-0 rounded-lg object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              )}
                            </button>
                            <div className="mt-[6px] flex items-center justify-between gap-1 md:justify-start">
                              <div className="text-sm font-semibold text-red-500">
                                <bdi dir="ltr">
                                  {format(line.goodsCents / line.quantity)}
                                </bdi>
                              </div>
                              <div className="text-xs font-medium text-[#333333]">
                                x {line.quantity}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-between py-2 md:justify-end"
                    onClick={() => setExpanded(!expanded)}
                    aria-expanded={expanded}
                  >
                    <span className="text-xs text-[#333333]">
                      {t("Order Amount")}
                    </span>
                    <span className="flex w-[200px] items-center justify-end gap-2 text-sm text-[#333333]">
                      <bdi className="font-semibold text-red-500">
                        {format(section.totalCents)}
                      </bdi>
                      {expanded ? (
                        <ChevronUp className="h-4 w-4 text-gray-500" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      )}
                    </span>
                  </button>
                  {expanded && (
                    <div className="space-y-1 py-2 text-xs">
                      {sectionAmounts.map(([label, amount]) => (
                        <div
                          key={label}
                          className="flex justify-between md:justify-end"
                        >
                          <span className="text-[#999999]">{label}</span>
                          <bdi className="w-[200px] text-end">
                            {format(amount)}
                          </bdi>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
          <div className="hidden lg:col-span-1 lg:block">
            <div className="sticky top-4 overflow-hidden rounded-xl bg-white shadow-[0_0_14px_rgba(0,0,0,0.06)]">
              <div className="p-4">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">
                  {t("Order Summary")}
                </h3>
                <div className="space-y-3 border-t border-[#E2E4F0] pt-4">
                  {amounts.map(([label, amount]) => (
                    <div
                      key={label}
                      className="flex justify-between text-gray-600"
                    >
                      <span className="text-xs text-[#666666]">{label}</span>
                      <bdi className="text-sm font-semibold text-[#1A1A1A]">
                        {format(amount)}
                      </bdi>
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-[#666666]">
                      {t("Total Amount")}
                    </span>
                    <bdi className="text-base font-bold text-red-500">
                      {format(totalCents)}
                    </bdi>
                  </div>
                  <p className="text-end text-xs text-gray-500">
                    {t("Excl Int’l Freight")}
                  </p>
                </div>
                <motion.div animate={disclaimerControls}>
                  <label className="mt-5 flex cursor-pointer items-start gap-2.5 border-t border-[#E2E4F0] pt-4">
                    <Checkbox
                      checked={agreed}
                      onCheckedChange={(checked) =>
                        setDisclaimer(checked === true)
                      }
                      className={cn(
                        "mt-0.5 shrink-0",
                        disclaimerAttention && "border-primary",
                      )}
                    />
                    {disclaimer}
                  </label>
                </motion.div>
                <Button
                  onClick={() => void submit()}
                  disabled={submitting}
                  className="bg-primary hover:bg-primary/90 mt-4 h-12 w-full rounded-lg border-0 text-base font-semibold text-white shadow-none"
                >
                  {submitting ? (
                    <Spinner className="size-6" />
                  ) : (
                    t("Submit Order")
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <RemarkModal
        open={remarkLine !== null}
        onOpenChange={(open) => {
          if (!open) setRemarkLine(null);
        }}
        remarkText={activeRemark?.remarkText ?? ""}
        remarkImages={activeRemark?.remarkImages ?? []}
        remarkImageIds={activeRemark?.remarkImageIds}
        maxLength={1000}
        readonly={!!manualForm && (data.draft.attempted || submitting)}
        temporaryImages
        onConfirm={(note) => {
          if (remarkLine !== null) saveRemark(remarkLine, note);
        }}
      />
      <div className="safe-area-pb fixed start-0 end-0 bottom-0 z-40 border-t bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.08)] lg:hidden">
        <motion.div
          className={cn("px-4 pt-3", disclaimerAttention && "text-primary")}
          animate={disclaimerControls}
        >
          <label className="flex cursor-pointer items-start gap-2.5">
            <Checkbox
              checked={agreed}
              onCheckedChange={(checked) => setDisclaimer(checked === true)}
              className={cn(
                "mt-0.5 shrink-0",
                disclaimerAttention && "border-primary",
              )}
            />
            {disclaimer}
          </label>
        </motion.div>
        <div className="flex items-center justify-end gap-4 px-4 py-3">
          <div className="min-w-0 text-end">
            <div className="flex items-center justify-end gap-1.5">
              <bdi className="text-lg font-bold text-orange-500">
                {format(totalCents)}
              </bdi>
              <HelpCircle
                className="h-4 w-4 shrink-0 text-gray-400"
                aria-hidden
              />
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              {t("Excl Int’l Freight")}
            </p>
          </div>
          <Button
            className="bg-primary hover:bg-primary/90 h-11 min-w-30 shrink-0 rounded-full px-4 font-semibold text-white"
            disabled={submitting}
            onClick={() => void submit()}
          >
            {submitting ? <Spinner className="size-6" /> : t("Submit Order")}
          </Button>
        </div>
      </div>
    </>
  );
}

export default function PageClient() {
  const search = useSearchParams();
  const draft = search.get("draft");
  const sessionVersion = useProcurementSessionStore(
    (state) => state.clientStateVersion,
  );
  return (
    <PurchaseCheckout key={`${sessionVersion}:${draft}`} id={draft ?? ""} />
  );
}
