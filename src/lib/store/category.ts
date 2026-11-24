"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { LOCALE_HTML_LANG, type Locale } from "@/lib/locale";
import { getProductCategories } from "@/lib/procurement/client";
import type { ProcurementProductCategory } from "@/lib/procurement/types";
import { useLocaleStore } from "@/stores/locale-store";

export interface CategoryItem {
  id: string;
  name: string;
  icon: ProcurementProductCategory["icon"];
  children: CategoryItem[];
}

interface CategoryState {
  locale: Locale | null;
  categories: CategoryItem[] | null;
  loading: boolean;
  fetchCategories: (locale: Locale) => Promise<void>;
}

function buildCategoryTree(
  items: ProcurementProductCategory[],
): CategoryItem[] {
  const byId = new Map<string, CategoryItem>();
  for (const { id, name, icon } of items) {
    byId.set(id, {
      id,
      name,
      icon,
      children: [],
    });
  }

  const roots: CategoryItem[] = [];
  for (const { id, parentId } of items) {
    const category = byId.get(id)!;
    if (parentId === null) roots.push(category);
    else byId.get(parentId)?.children.push(category);
  }
  return roots;
}

const EMPTY_CATEGORIES: CategoryItem[] = [];
const useCategoryStore = create<CategoryState>((set, get) => {
  let requestId = 0;
  return {
    locale: null,
    categories: null,
    loading: false,
    fetchCategories: async (locale) => {
      const state = get();
      if (state.locale === locale && (state.loading || state.categories))
        return;

      const id = ++requestId;
      set({ locale, categories: null, loading: true });
      try {
        const items = await getProductCategories(LOCALE_HTML_LANG[locale]);
        if (id === requestId) {
          set({ categories: buildCategoryTree(items), loading: false });
        }
      } catch {
        if (id === requestId) set({ loading: false });
      }
    },
  };
});

export function useProductCategories() {
  const locale = useLocaleStore((state) => state.locale);
  const {
    categories,
    locale: categoryLocale,
    loading,
    fetchCategories,
  } = useCategoryStore();
  useEffect(() => {
    void fetchCategories(locale);
  }, [fetchCategories, locale]);

  return {
    categories:
      (categoryLocale === locale ? categories : null) ?? EMPTY_CATEGORIES,
    loading: categoryLocale !== locale || loading,
  };
}

export function getCategoryHref(category: CategoryItem): string {
  return `/category/${encodeURIComponent(category.name.trim())}`;
}
