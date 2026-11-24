"use client";
import { usePaginatedProducts } from "@/hooks/use-paginated-products";
import { useCallback, useState } from "react";
import { LOCALE_HTML_LANG } from "@/lib/locale";
import { searchProducts } from "@/lib/procurement/client";
import { useProductCategories } from "@/lib/store/category";
import { useLocaleStore } from "@/stores/locale-store";

export function useCategoryProductFeed(pageSize: number) {
  const { categories, loading: categoriesLoading } = useProductCategories();
  const language = useLocaleStore((state) => LOCALE_HTML_LANG[state.locale]);
  const [selectedId, setCurrentCategory] = useState<string | null>(null);
  const selectedCategory =
    categories.find(({ id }) => id === selectedId) ?? categories[0];
  const currentCategory = selectedCategory?.id;
  const keyword = selectedCategory?.name.trim();
  const loadPage = useCallback(
    async (page: number) =>
      keyword
        ? searchProducts({
            channel: "1688",
            keyword,
            page,
            page_size: pageSize,
            language,
          })
        : { items: [], total: 0 },
    [keyword, language, pageSize],
  );
  const feed = usePaginatedProducts(
    JSON.stringify([currentCategory, keyword, pageSize, language]),
    loadPage,
  );
  return {
    categories,
    categoriesLoading,
    currentCategory,
    setCurrentCategory,
    ...feed,
  };
}
