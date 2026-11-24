"use client";

import { MemberEmptyState } from "@/components/features/account/member-empty-state";

import { CustomPagination } from "@/components/custom/custom-pagination";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { Section } from "@/components/layout/section";
import {
  ProcurementSavedProduct,
  ProcurementSavedProductSkeletonGrid,
} from "@/components/features/catalog/procurement-saved-product";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShopSubscriptions } from "./shop-subscriptions";
import { Spinner } from "@/components/ui/spinner";
import { useIsMobile } from "@/hooks/use-mobile";
import { getErrorMessage } from "@/lib/error-message";
import {
  deleteProcurementFavorite,
  getProcurementFavorites,
} from "@/lib/procurement/client";
import type {
  ProcurementFavorite,
  ProcurementFavoritesPage,
} from "@/lib/procurement/types";
import { ChevronDown, Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface FavoriteQuery {
  page: number;
  pageSize: number;
  append: boolean;
}

export default function PageClient() {
  const t = useTranslations();
  return (
    <Section className="px-2">
      <div className="mt-4 rounded-xl md:mt-2 md:bg-white md:p-4">
        <h1 className="mb-2 flex items-center gap-2 text-lg font-semibold md:mb-4">
          <Heart className="size-5 text-red-500" />
          {t("My favorite")}
        </h1>
        <Tabs defaultValue="products" className="mb-6">
          <TabsList className="bg-white">
            <TabsTrigger value="products">{t("Product favorites")}</TabsTrigger>
            <TabsTrigger value="shops">{t("Favorite shops")}</TabsTrigger>
          </TabsList>
          <TabsContent value="products">
            <ProductFavorites />
          </TabsContent>
          <TabsContent value="shops">
            <ShopSubscriptions />
          </TabsContent>
        </Tabs>
      </div>
    </Section>
  );
}

function ProductFavorites() {
  const t = useTranslations();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState<FavoriteQuery>({
    page: 1,
    pageSize: 10,
    append: false,
  });
  const [loaded, setLoaded] = useState<{
    query: FavoriteQuery;
    result: ProcurementFavoritesPage;
    mobileItems: ProcurementFavorite[];
  }>();
  const [failedQuery, setFailedQuery] = useState<FavoriteQuery>();
  const [deleteTarget, setDeleteTarget] = useState<string>();
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    getProcurementFavorites(query.page, query.pageSize).then(
      (result) => {
        if (!active) return;
        setLoaded((previous) => ({
          query,
          result,
          mobileItems:
            query.append && previous
              ? [...previous.mobileItems, ...result.items]
              : result.items,
        }));
      },
      () => {
        if (active) setFailedQuery(query);
      },
    );
    return () => {
      active = false;
    };
  }, [query]);

  const failed = failedQuery === query;
  const pending = !failed && loaded?.query !== query;
  const data = loaded?.result;
  const totalPages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / query.pageSize),
  );

  async function deleteFavorite(id: string) {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteProcurementFavorite(id);
      const remaining = Math.max(0, (data?.total ?? 1) - 1);
      setQuery({
        page: query.append
          ? 1
          : Math.min(
              query.page,
              Math.max(1, Math.ceil(remaining / query.pageSize)),
            ),
        pageSize: query.pageSize,
        append: false,
      });
      toast.success(t("Deleted successfully"));
    } catch (error) {
      toast.error(getErrorMessage(error) || t("Operation failed"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {failed && (
        <p role="alert" className="py-8 text-center text-gray-500">
          {t("The service is temporarily unavailable Please try again")}
        </p>
      )}
      {pending && !query.append ? (
        <ProcurementSavedProductSkeletonGrid />
      ) : (
        data &&
        (query.append || loaded?.query === query) &&
        (data.items.length === 0 ? (
          !pending &&
          !failed && (
            <MemberEmptyState
              variant="favorites"
              label={t("No favorite products")}
            />
          )
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {(isMobile ? loaded?.mobileItems : data.items)?.map((item) => (
                <ProcurementSavedProduct
                  key={item.id}
                  item={item}
                  deleting={deleting}
                  onDelete={() => setDeleteTarget(item.id)}
                />
              ))}
            </div>
            <div className="hidden md:block">
              <CustomPagination
                total={data.total}
                currentPage={data.page}
                totalPages={totalPages}
                pageSize={data.pageSize}
                pageSizeOptions={[5, 10, 20, 50]}
                onPageChange={(page, pageSize) =>
                  setQuery({ page, pageSize, append: false })
                }
              />
            </div>
            <div className="mt-4 flex justify-center md:hidden">
              {data.page < totalPages ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    setQuery({ ...query, page: data.page + 1, append: true })
                  }
                  className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-6 py-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {pending ? (
                    <Spinner />
                  ) : (
                    <>
                      <span>{t("View more")}</span>
                      <ChevronDown className="size-4" />
                    </>
                  )}
                </button>
              ) : (
                <span className="py-2 text-sm text-gray-400">
                  {t("No more")}
                </span>
              )}
            </div>
          </>
        ))
      )}
      <DeleteConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(undefined);
        }}
        onConfirm={() => {
          if (deleteTarget) void deleteFavorite(deleteTarget);
        }}
      />
    </>
  );
}
