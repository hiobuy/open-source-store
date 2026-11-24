"use client";

import { MemberEmptyState } from "@/components/features/account/member-empty-state";
import { Button } from "@/components/ui/button";
import { CustomPagination } from "@/components/custom/custom-pagination";
import { CustomSelect } from "@/components/custom/custom-select";
import { Section } from "@/components/layout/section";
import {
  RechargeDialog,
  type RechargeDialogRef,
} from "@/components/recharge-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getProcurementTransactionReceiptUrl,
  getProcurementWallet,
  getProcurementWalletTransactions,
} from "@/lib/procurement/client";
import type {
  ProcurementTransactionPage,
  ProcurementWallet,
} from "@/lib/procurement/types";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCurrency, usePriceConvert } from "@/lib/store/common";
import transactionsDayjs from "dayjs";
import { Plus, RefreshCw, ShoppingBag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MonthPicker } from "./components/month-picker";

interface TransactionQuery {
  page: number;
  type: string;
  append: boolean;
}

type MonthRange = Parameters<
  React.ComponentProps<typeof MonthPicker>["onChange"]
>[0];
const emptyMonth: MonthRange = { begin_date: undefined, end_date: undefined };

async function loadMonthTransactions(type: string, month: string) {
  const first = await getProcurementWalletTransactions(1, type);
  const items = [...first.items];
  for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page++) {
    const next = await getProcurementWalletTransactions(page, type);
    items.push(...next.items);
  }
  return items.filter(
    (item) => transactionsDayjs(item.createdAt).format("YYYY-MM") === month,
  );
}

export default function WalletPage() {
  const t = useTranslations();
  const topUpPending = useSearchParams().get("topup") === "pending";
  const rechargeDialogRef = useRef<RechargeDialogRef>(null);
  const priceConvert = usePriceConvert();
  const { currency } = useCurrency();
  const [wallet, setWallet] = useState<ProcurementWallet>();
  const [walletFailed, setWalletFailed] = useState(false);
  const [query, setQuery] = useState<TransactionQuery>({
    page: 1,
    type: "",
    append: false,
  });
  const [dateRange, setDateRange] = useState(emptyMonth);
  const month = dateRange.begin_date?.slice(0, 7);
  const [monthResult, setMonthResult] = useState<{
    month: string;
    type: string;
    items?: ProcurementTransactionPage["items"];
  }>();
  const [loaded, setLoaded] = useState<{
    query: TransactionQuery;
    result: ProcurementTransactionPage;
  }>();
  const [failedQuery, setFailedQuery] = useState<TransactionQuery>();
  const [hasScrolled, setHasScrolled] = useState(false);
  const transactionsLoadMoreSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!month) return;
    let active = true;
    loadMonthTransactions(query.type, month).then(
      (items) => {
        if (active) setMonthResult({ month, type: query.type, items });
      },
      () => {
        if (active) setMonthResult({ month, type: query.type });
      },
    );
    return () => {
      active = false;
    };
  }, [month, query.type]);

  useEffect(() => {
    let active = true;
    getProcurementWallet().then(
      (data) => {
        if (active) setWallet(data);
      },
      () => {
        if (active) setWalletFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (month) return;
    let active = true;
    getProcurementWalletTransactions(query.page, query.type).then(
      (result) => {
        if (!active) return;
        setLoaded((previous) => ({
          query,
          result:
            query.append && previous?.query.type === query.type
              ? {
                  ...result,
                  items: [...previous.result.items, ...result.items],
                }
              : result,
        }));
      },
      () => {
        if (active) setFailedQuery(query);
      },
    );
    return () => {
      active = false;
    };
  }, [query, month]);

  const matchingMonth =
    monthResult?.month === month && monthResult?.type === query.type
      ? monthResult
      : undefined;
  const transactionsFailed = month
    ? !!matchingMonth && !matchingMonth.items
    : failedQuery === query;
  const pending = month
    ? !matchingMonth
    : loaded?.query !== query && !transactionsFailed;
  const transactionsLoading = pending && !query.append;
  const transactionsLoadMoreLoading = pending && query.append;
  const unfilteredTransactions =
    loaded?.query.type === query.type &&
    (loaded.query === query || query.append)
      ? loaded.result
      : undefined;
  const monthPageSize = unfilteredTransactions?.pageSize ?? 20;
  const transactionsData = month
    ? matchingMonth?.items && {
        items: matchingMonth.items.slice(
          query.append ? 0 : (query.page - 1) * monthPageSize,
          query.page * monthPageSize,
        ),
        total: matchingMonth.items.length,
        pageSize: monthPageSize,
        page: query.page,
      }
    : unfilteredTransactions;
  const transactionsItems = transactionsData?.items ?? [];
  const transactionsTotal = transactionsData?.total ?? 0;
  const transactionsCurrentPageSize = transactionsData?.pageSize ?? 20;
  const transactionsCurrentPage = transactionsData?.page ?? query.page;
  const transactionsTotalPages = Math.max(
    1,
    Math.ceil(transactionsTotal / transactionsCurrentPageSize),
  );
  const transactionsHasMore =
    !transactionsFailed && transactionsCurrentPage < transactionsTotalPages;

  useEffect(() => {
    if (hasScrolled) return;
    const markScrolled = () => setHasScrolled(true);
    window.addEventListener("scroll", markScrolled, {
      passive: true,
      once: true,
    });
    window.addEventListener("touchmove", markScrolled, {
      passive: true,
      once: true,
    });
    return () => {
      window.removeEventListener("scroll", markScrolled);
      window.removeEventListener("touchmove", markScrolled);
    };
  }, [hasScrolled]);

  useEffect(() => {
    const sentinel = transactionsLoadMoreSentinelRef.current;
    if (!sentinel || !transactionsHasMore || !hasScrolled || pending) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setQuery({
          page: transactionsCurrentPage + 1,
          type: query.type,
          append: true,
        });
      },
      { rootMargin: "100px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    hasScrolled,
    pending,
    query.type,
    transactionsCurrentPage,
    transactionsHasMore,
  ]);

  const transactionsChargeTypeOptions = [
    { label: t("Parcel"), value: "SHIPMENT_PAYMENT" },
    { label: t("Purchase Order"), value: "PURCHASE_PAYMENT" },
    { label: t("Recharge"), value: "TOP_UP" },
    { label: t("Refund"), value: "REFUND" },
  ];

  function transactionsFormatType(type: string) {
    return (
      transactionsChargeTypeOptions.find(({ value }) => value === type)
        ?.label ?? type
    );
  }

  function transactionsFormatAmount(amount: number, currency: string) {
    return (
      <bdi
        dir="ltr"
        className={
          amount >= 0 ? "font-bold text-[#00A046]" : "font-bold text-[#CF1322]"
        }
      >
        {amount > 0 ? "+" : ""}
        {currency} {(amount / 100).toFixed(2)}
      </bdi>
    );
  }

  function transactionsGetTypeIconAndStyle(type: string) {
    switch (type) {
      case "TOP_UP":
        return {
          icon: <Plus className="size-5 text-[#00A046]" />,
          bgColor: "bg-[#E6F7ED]",
        };
      case "REFUND":
        return {
          icon: <RefreshCw className="size-5 text-[#1677FF]" />,
          bgColor: "bg-[#E6F4FF]",
        };
      case "PURCHASE_PAYMENT":
      case "SHIPMENT_PAYMENT":
        return {
          icon: <ShoppingBag className="size-5 text-[#CF1322]" />,
          bgColor: "bg-[#FEECEC]",
        };
      default:
        return {
          icon: <ShoppingBag className="size-5 text-[#999]" />,
          bgColor: "bg-[#F5F5F5]",
        };
    }
  }

  const formatDate = (date: string) =>
    transactionsDayjs(date).format("YYYY-MM-DD HH:mm:ss");
  const balance = wallet ? wallet.balanceFen / 100 : null;
  const loading = !wallet && !walletFailed;
  const transactionsContent = (() => {
    return (
      <Section className="px-0">
        {
          <div className="px-1 py-4">
            {/* 标题和筛选 */}
            <div className="mb-4 flex items-center gap-2">
              <MonthPicker
                value={dateRange}
                onChange={(range) => {
                  setDateRange(range);
                  setQuery((current) => ({
                    ...current,
                    page: 1,
                    append: false,
                  }));
                }}
              />
              <CustomSelect
                value={query.type}
                onChange={(type) => setQuery({ page: 1, type, append: false })}
                options={transactionsChargeTypeOptions}
                placeholder={t("Select type")}
                showClear={true}
              />
            </div>

            {transactionsFailed && (
              <p role="alert" className="p-4 text-sm text-[#999999]">
                {t("The service is temporarily unavailable Please try again")}
              </p>
            )}

            {/* 加载状态 */}
            {transactionsLoading && <WalletTransactionsSkeleton />}

            {/* 数据列表 */}
            {transactionsData && (
              <>
                {/* 移动端卡片布局（md以下显示，md及以上隐藏） */}
                <div className="mb-4 overflow-hidden rounded-xl bg-white md:hidden">
                  <div className="border-b border-[#e2e4f0] px-1 py-3 text-lg font-bold">
                    {t("Transaction History")}
                  </div>
                  {transactionsItems.length === 0 ? (
                    <MemberEmptyState
                      variant="wallet"
                      label={t("No wallet transactions")}
                    />
                  ) : (
                    <>
                      {transactionsItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between border-b border-[#e2e4f0] p-4"
                        >
                          <div className="flex items-center gap-3">
                            {/* 图标区域 */}
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-full ${transactionsGetTypeIconAndStyle(item.type).bgColor}`}
                            >
                              {transactionsGetTypeIconAndStyle(item.type).icon}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-[#333]">
                                {transactionsFormatType(item.type)}
                              </div>
                              <div className="text-xs text-[#999]">
                                {formatDate(item.createdAt)}
                              </div>
                              <div className="truncate text-xs text-[#999]">
                                {item.referenceId || "-"}
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="font-medium">
                              {transactionsFormatAmount(
                                item.amountFen,
                                item.currency,
                              )}
                            </div>
                            {item.type === "TOP_UP" && item.amountFen > 0 && (
                              <a
                                href={getProcurementTransactionReceiptUrl(
                                  item.id,
                                )}
                                download
                                className="text-primary text-xs underline"
                              >
                                {t("Payment receipt")}
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                      {/* 滚动加载触发点 */}
                      {transactionsHasMore && (
                        <div
                          ref={transactionsLoadMoreSentinelRef}
                          className="h-1"
                        />
                      )}
                      {transactionsLoadMoreLoading && (
                        <div className="flex justify-center py-4">
                          <Spinner className="h-5 w-5" />
                        </div>
                      )}
                    </>
                  )}
                </div>
                {/* 桌面端表格 + 分页（md以下隐藏，md及以上显示） */}
                <div className="hidden overflow-hidden rounded-md border bg-white md:block">
                  <div className="overflow-x-auto">
                    <Table className="min-w-[700px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[20%] whitespace-nowrap">
                            {t("Details")}
                          </TableHead>
                          <TableHead className="w-[20%] whitespace-nowrap">
                            {t("Type")}
                          </TableHead>
                          <TableHead className="w-[20%] text-center whitespace-nowrap">
                            {t("Created at")}
                          </TableHead>
                          <TableHead className="w-[20%] whitespace-nowrap">
                            {t("Amount")}
                          </TableHead>
                          <TableHead className="w-[20%] whitespace-nowrap">
                            {t("Order No")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transactionsItems.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5}>
                              <MemberEmptyState
                                variant="wallet"
                                label={t("No wallet transactions")}
                              />
                            </TableCell>
                          </TableRow>
                        ) : (
                          transactionsItems.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="whitespace-nowrap">
                                <div className="flex items-center gap-3">
                                  <div
                                    className={`flex h-10 w-10 items-center justify-center rounded-full ${transactionsGetTypeIconAndStyle(item.type).bgColor}`}
                                  >
                                    {
                                      transactionsGetTypeIconAndStyle(item.type)
                                        .icon
                                    }
                                  </div>
                                  <div>{item.description}</div>
                                </div>
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-[#666]">
                                {transactionsFormatType(item.type)}
                              </TableCell>
                              <TableCell className="text-center whitespace-nowrap text-[#999]">
                                {formatDate(item.createdAt)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {transactionsFormatAmount(
                                  item.amountFen,
                                  item.currency,
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-sm whitespace-nowrap">
                                {item.referenceId || "-"}
                                {item.type === "TOP_UP" &&
                                  item.amountFen > 0 && (
                                    <a
                                      href={getProcurementTransactionReceiptUrl(
                                        item.id,
                                      )}
                                      download
                                      className="text-primary block font-sans text-xs underline"
                                    >
                                      {t("Payment receipt")}
                                    </a>
                                  )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  {transactionsTotal > 0 && (
                    <div className="border-t border-gray-200 bg-[#F1F5F9]/50 px-4 py-3 [&>div]:mt-0">
                      <CustomPagination
                        total={transactionsTotal}
                        currentPage={transactionsCurrentPage}
                        totalPages={transactionsTotalPages}
                        pageSize={transactionsCurrentPageSize}
                        pageSizeOptions={[]}
                        onPageChange={(page) =>
                          setQuery({ page, type: query.type, append: false })
                        }
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        }
      </Section>
    );
  })();
  return (
    <>
      {loading ? (
        <div className="px-2">
          <div className="mx-auto animate-pulse rounded-md border bg-[linear-gradient(45deg,#FF5B00_0%,#FF8C42_100%)] p-4 text-white md:px-4 md:py-8">
            <div className="mb-3 h-4 w-20 rounded bg-white/20"></div>
            <div className="mb-4 h-8 w-40 rounded bg-white/20"></div>
            <div className="flex gap-3">
              <div className="h-8 w-20 rounded bg-white/20"></div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="px-1">
            <div className="mx-auto rounded-md border bg-[linear-gradient(45deg,#FF5B00_0%,#FF8C42_100%)] p-4 text-white md:px-4 md:py-8">
              <div className="mb-2 text-sm text-white/80 md:mb-3">
                {t("available balance")}
              </div>
              <div className="mb-6 space-x-3 text-lg font-medium md:mb-4">
                <span className="text-2xl font-bold md:text-4xl">
                  {wallet && balance !== null
                    ? `${wallet.currency} ${balance.toFixed(2)}`
                    : "—"}
                </span>
                {wallet?.currency === "CNY" &&
                  balance !== null &&
                  currency.code !== "CNY" && (
                    <span className="text-xs text-white/70 md:text-sm">
                      ≈
                      <bdi dir="ltr">
                        {priceConvert(balance, { needFormat: false })}
                      </bdi>
                    </span>
                  )}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="border-border hover:bg-muted h-8 w-[calc(50%_-_0.375rem)] min-w-0 rounded-lg px-2.5 py-0 text-[#FF5B00] hover:text-[#FF5B00] md:w-auto"
                  disabled={!wallet}
                  onClick={() => rechargeDialogRef.current?.init()}
                >
                  {t("Top UP")}
                </Button>
              </div>
            </div>
          </div>
          {wallet && (
            <RechargeDialog
              ref={rechargeDialogRef}
              settlementCurrency={wallet.currency}
            />
          )}
        </>
      )}{" "}
      {topUpPending && (
        <p role="status" className="px-2 pt-3 text-sm">
          {t("Card top-up is awaiting confirmation")}
        </p>
      )}
      {transactionsContent}{" "}
    </>
  );
}

function WalletTransactionsSkeleton() {
  const rows = Array.from({ length: 6 }, (_, index) => index);
  return (
    <div aria-hidden>
      <div className="mb-4 overflow-hidden rounded-xl bg-white md:hidden">
        {rows.map((index) => (
          <div
            key={index}
            className="flex items-center justify-between border-b border-[#e2e4f0] p-4"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-md border bg-white md:block">
        {rows.map((index) => (
          <div
            key={index}
            className="grid grid-cols-5 items-center gap-4 border-b px-4 py-4 last:border-b-0"
          >
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mx-auto h-4 w-32" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
