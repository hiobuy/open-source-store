"use client";

import { useEffect, useState } from "react";

interface ProductPage<T> {
  items: T[];
  total: number;
  hasMore?: boolean;
}
interface Feed<T> extends ProductPage<T> {
  key: string;
  generation: number;
  page: number;
  loading: boolean;
  loadingMore: boolean;
}
const emptyFeed = <T>(key: string, generation: number): Feed<T> => ({
  key,
  generation,
  items: [],
  total: 0,
  page: 1,
  loading: true,
  loadingMore: false,
});

/** Reset the visible feed with its inputs; ignore responses from an older feed. */
export function usePaginatedProducts<T>(
  key: string,
  loadPage: (page: number) => Promise<ProductPage<T>>,
) {
  const [feed, setFeed] = useState(() => emptyFeed<T>(key, 0));
  if (feed.key !== key) setFeed(emptyFeed<T>(key, feed.generation + 1));
  const generation = feed.generation;
  const hasMore =
    !feed.loading &&
    (feed.hasMore ??
      (feed.items.length > 0 &&
        (feed.total <= 0 || feed.items.length < feed.total)));

  useEffect(() => {
    let active = true;
    loadPage(1).then(
      (result) => {
        if (active)
          setFeed((previous) =>
            previous.key === key && previous.generation === generation
              ? { ...previous, ...result, loading: false }
              : previous,
          );
      },
      () => {
        if (active)
          setFeed((previous) =>
            previous.key === key && previous.generation === generation
              ? { ...previous, loading: false }
              : previous,
          );
      },
    );
    return () => {
      active = false;
    };
  }, [key, generation, loadPage]);

  const loadMore = async () => {
    if (feed.key !== key || !hasMore || feed.loadingMore) return;
    const page = feed.page + 1;
    setFeed((previous) => ({ ...previous, loadingMore: true }));
    try {
      const result = await loadPage(page);
      setFeed((previous) =>
        previous.key === key && previous.generation === generation
          ? {
              ...previous,
              ...result,
              items: [...previous.items, ...result.items],
              page,
              loadingMore: false,
            }
          : previous,
      );
    } catch {
      setFeed((previous) =>
        previous.key === key && previous.generation === generation
          ? { ...previous, loadingMore: false }
          : previous,
      );
    }
  };

  return {
    items: feed.items,
    loading: feed.loading,
    loadingMore: feed.loadingMore,
    loadMore,
    hasMore,
  };
}
