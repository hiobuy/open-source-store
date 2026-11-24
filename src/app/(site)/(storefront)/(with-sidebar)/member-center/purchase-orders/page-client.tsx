"use client";

import { CustomPagination } from "@/components/custom/custom-pagination";
import { MemberEmptyState } from "@/components/features/account/member-empty-state";
import { CustomSelect } from "@/components/custom/custom-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  PurchaseOrderCard,
  purchaseOrderColumns,
} from "@/components/features/orders/purchase-order-card";
import { LogisticsLoadState } from "@/components/features/logistics/procurement-logistics";
import { Section } from "@/components/layout/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useProcurementResource } from "@/hooks/use-procurement-resource";
import { getProcurementPurchaseOrders } from "@/lib/procurement/client";
import { cn } from "@/lib/utils";
import { CountBadge } from "@/components/nav-menu-badge";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

const statusTabs = [
  ["", "ALL"],
  ["awaiting_payment", "Pending Payment"],
  ["stocked", "Stored"],
  ["awaiting_receipt", "Awaiting receipt"],
  ["after", "Returns and Refunds"],
] as const;

const statusFilters = [
  ["awaiting_payment", "Pending Payment"],
  ["pending", "Pending processing"],
  ["buying", "Purchasing"],
  ["awaiting_receipt", "Awaiting receipt"],
  ["transit", "Merchant Shipped"],
  ["partial", "Partially received"],
  ["stocked", "Stored"],
  ["packed", "Packaged"],
  ["shipped", "Shipped"],
  ["exception", "Exceptions"],
  ["after", "Returns and Refunds"],
  ["cancelled", "Cancelled"],
] as const;

const searchInputClass =
  "outline-none focus:outline-none focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden";

type OrderQuery = {
  page: number;
  pageSize: number;
  status: string;
  keyword: string;
};

function loadOrders(query: OrderQuery) {
  return getProcurementPurchaseOrders(
    query.page,
    query.pageSize,
    query.status,
    query.keyword,
  );
}

export default function OrdersPage() {
  const t = useTranslations();
  const header = [
    { label: t("Product Details"), span: 8, center: false as const },
    { label: t("Unit Price"), span: 2, center: true as const },
    { label: t("Quantity"), span: 2, center: true as const },
    { label: t("Order Status"), span: 4, center: true as const },
    { label: t("Product amount"), span: 3, center: true as const },
    { label: t("Operate"), span: 2, center: false as const },
  ];
  const [query, setQuery] = useState<OrderQuery>({
    page: 1,
    pageSize: 10,
    status: "",
    keyword: "",
  });
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<string>("");
  const [filterOpen, setFilterOpen] = useState(false);
  const resource = useProcurementResource(loadOrders, query);
  const result = resource.data;
  // Keep the last counts visible while a new page or filter is loading.
  const [counts, setCounts] = useState<Record<string, number>>();
  if (result?.counts && result.counts !== counts) setCounts(result.counts);
  const tabs = statusTabs.map(([value, label]) => ({
    value,
    label: t(label),
    count:
      value && value !== "stocked" && value !== "awaiting_receipt"
        ? counts?.[value]
        : undefined,
  }));
  const filters = statusFilters.map(([value, label]) => ({
    value,
    label: t(label),
  }));

  return (
    <Section className="px-0">
      <div className="mb-8 rounded-lg md:bg-white md:p-4">
        <h1 className="sr-only">{t("Purchase Order")}</h1>
        <form
          className="block bg-white p-2 md:hidden"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery({ ...query, keyword: search.trim(), page: 1 });
          }}
        >
          <div className="flex items-center gap-2">
            <div className="focus-within:border-primary flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2">
              <Search className="size-4 shrink-0 text-gray-400" />
              <input
                type="search"
                aria-label={t("Order Number")}
                placeholder={t("Order Number")}
                value={search}
                maxLength={120}
                onChange={(event) => setSearch(event.target.value)}
                className={cn(
                  "min-w-0 flex-1 border-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400",
                  searchInputClass,
                )}
              />
            </div>
            {!tab && (
              <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="text-primary shrink-0 px-1 py-2 text-sm font-medium"
                  >
                    {t("Filter")}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(92vw,320px)] p-0" align="end">
                  <div className="max-h-64 overflow-y-auto">
                    {[{ value: "", label: t("All") }, ...filters].map(
                      ({ value, label }) => (
                        <button
                          type="button"
                          key={value}
                          className={cn(
                            "w-full px-4 py-3 text-start text-sm",
                            query.status === value
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-gray-700 hover:bg-gray-50",
                          )}
                          onClick={() => {
                            setQuery({ ...query, status: value, page: 1 });
                            setFilterOpen(false);
                          }}
                        >
                          {label}
                        </button>
                      ),
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </form>

        <div className="hide-scrollbar mb-3 flex w-full gap-2 overflow-x-auto overscroll-x-contain border-gray-200 bg-white px-4 pe-3 pt-2 md:gap-4 md:border-b md:bg-transparent md:px-0 md:pe-3">
          {tabs.map(({ value, label, count }) => (
            <button
              type="button"
              key={value}
              aria-pressed={value === tab}
              onClick={() => {
                setTab(value);
                setQuery({ ...query, status: value, page: 1 });
              }}
              className={cn(
                "relative shrink-0 cursor-pointer px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors md:px-4",
                tab === value
                  ? "text-primary border-primary border-b-2"
                  : "text-gray-500 hover:text-gray-700",
              )}
            >
              {label}
              {value === "awaiting_payment" ? (
                <CountBadge count={count ?? 0} />
              ) : (
                !!count && (
                  <span className="bg-primary ms-1.5 rounded-full px-1.5 text-xs text-white">
                    {count}
                  </span>
                )
              )}
            </button>
          ))}
        </div>

        <form
          className="mb-4 hidden items-center gap-2 md:flex"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery({ ...query, keyword: search.trim(), page: 1 });
          }}
        >
          <Input
            className={cn(
              "focus:border-primary focus-visible:border-primary max-w-60 shadow-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0",
              searchInputClass,
            )}
            type="search"
            aria-label={t("Order Number")}
            placeholder={t("Order Number")}
            value={search}
            maxLength={120}
            onChange={(event) => setSearch(event.target.value)}
          />
          {!tab && (
            <CustomSelect
              value={query.status}
              onChange={(status) => setQuery({ ...query, status, page: 1 })}
              options={filters}
              placeholder={t("Status")}
              showClear
              width={290}
            />
          )}
          <Button type="submit" size="sm" className="shrink-0">
            <Search className="me-1 size-4" />
            {t("Search")}
          </Button>
        </form>
        {resource.loading ? (
          <PurchaseOrderSkeleton />
        ) : (
          <LogisticsLoadState
            {...resource}
            empty={
              result?.items.length === 0 && (
                <MemberEmptyState
                  variant="orders"
                  label={t("No purchase orders")}
                />
              )
            }
          />
        )}
        {!!result?.items.length && (
          <>
            <div
              className={cn(
                "mb-4 hidden gap-4 rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-gray-600 md:grid",
                purchaseOrderColumns,
              )}
            >
              {header.map(({ label, center }) => (
                <span
                  key={label}
                  className={center ? "text-center" : undefined}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="mx-4 space-y-3 md:mx-0 md:space-y-4">
              {result.items.map((order) => (
                <PurchaseOrderCard key={order.id} order={order} />
              ))}
            </div>
            <div className="px-4 md:px-0">
              <CustomPagination
                total={result.total}
                currentPage={result.page}
                pageSize={result.pageSize}
                totalPages={Math.max(
                  1,
                  Math.ceil(result.total / result.pageSize),
                )}
                onPageChange={(page, pageSize) =>
                  setQuery({ ...query, page, pageSize })
                }
              />
            </div>
          </>
        )}
      </div>
    </Section>
  );
}

function PurchaseOrderSkeleton() {
  return (
    <div className="mx-4 space-y-4 md:mx-0" aria-hidden>
      <Skeleton className="hidden h-11 w-full md:block" />
      {Array.from({ length: 3 }, (_, index) => (
        <article
          key={index}
          className="rounded-lg border border-gray-200 bg-white"
        >
          <header className="flex items-center gap-3 border-b border-gray-200 p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-28" />
          </header>
          <div className="flex items-center gap-3 p-4">
            <Skeleton className="size-16 shrink-0 rounded-lg md:size-24" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4 md:w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
