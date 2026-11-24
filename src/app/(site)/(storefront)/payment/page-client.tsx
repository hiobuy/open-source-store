"use client";

import { CustomPagination } from "@/components/custom/custom-pagination";
import { PurchaseOrderCard } from "@/components/features/orders/purchase-order-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProcurementResource } from "@/hooks/use-procurement-resource";
import { getErrorMessage } from "@/lib/error-message";
import {
  getProcurementPurchaseOrders,
  ProcurementApiError,
} from "@/lib/procurement/client";
import { purchaseLoginHref } from "@/lib/procurement/purchase";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { PurchaseCashier } from "./purchase-cashier";

const PAGE_SIZE = 20;
const loadUnpaidOrders = (page: number) =>
  getProcurementPurchaseOrders(page, PAGE_SIZE, "awaiting_payment");

function PaymentList() {
  const t = useTranslations();
  const session = useProcurementSessionStore((state) => state.hasSession);
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useProcurementResource(
    loadUnpaidOrders,
    session ? page : null,
  );
  return (
    <section className="mt-4 space-y-4 rounded-lg px-3 md:bg-white md:p-6 md:px-0">
      <h1 className="sr-only">{t("Pending Payment")}</h1>
      {!session ||
      (error instanceof ProcurementApiError && error.status === 401) ? (
        <Button asChild>
          <Link href={purchaseLoginHref("/payment")}>{t("Sign in")}</Link>
        </Button>
      ) : loading ? (
        <div className="space-y-4">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : error ? (
        <div className="space-y-3">
          <p role="alert">{getErrorMessage(error) || t("Operation failed")}</p>
          <Button variant="outline" onClick={reload}>
            {t("Try again")}
          </Button>
        </div>
      ) : !data?.items.length ? (
        <p>{t("No data")}</p>
      ) : (
        <>
          <div className="space-y-4">
            {data.items.map((order) => (
              <PurchaseOrderCard key={order.id} order={order} />
            ))}
          </div>
          {data.total > PAGE_SIZE && (
            <CustomPagination
              currentPage={data.page}
              pageSize={PAGE_SIZE}
              total={data.total}
              totalPages={Math.ceil(data.total / PAGE_SIZE)}
              pageSizeOptions={[]}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </section>
  );
}

export default function PageClient() {
  const search = useSearchParams();
  const id = search.get("id");
  const session = useProcurementSessionStore(
    (state) => state.clientStateVersion,
  );
  if (id) return <PurchaseCashier key={`${session}:${id}`} id={id} />;
  return <PaymentList />;
}
