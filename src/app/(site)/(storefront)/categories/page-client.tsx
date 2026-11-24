/**
 * 分类面板：左侧一级分类，右侧展示二级与三级分类。
 */
"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategoryHref, useProductCategories } from "@/lib/store/category";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";

const LEFT_SKELETON_COUNT = 12;
const RIGHT_SKELETON_GROUPS = 4;
const RIGHT_SKELETON_ITEMS = 6;
const CATEGORY_ICON_NAMES = new Set<string>(iconNames);

export default function PageClient() {
  const t = useTranslations();

  const { categories, loading: showSkeleton } = useProductCategories();
  const [selectedIndex, setActiveIndex] = useState<number | null>(null);
  const activeIndex =
    categories.length === 0
      ? null
      : selectedIndex !== null && selectedIndex < categories.length
        ? selectedIndex
        : 0;
  const activeCategory = activeIndex !== null ? categories[activeIndex] : null;
  const level2List = activeCategory?.children ?? [];
  return (
    <div
      className="flex w-full overflow-hidden bg-white"
      style={{
        height:
          "calc(100svh - var(--header-height, 0px) - var(--haiou-mobile-bottom-nav-height, 0px))",
      }}
    >
      <aside className="h-full w-[96px] shrink-0 overflow-y-auto bg-[#f5f6f8] md:w-[168px]">
        {showSkeleton ? (
          <div className="space-y-1 py-2">
            {Array.from({ length: LEFT_SKELETON_COUNT }).map((_, index) => (
              <div key={index} className="px-3 py-3">
                <Skeleton className="h-4 w-full rounded-md" />
              </div>
            ))}
          </div>
        ) : (
          categories.map((category, index) => {
            const active = activeIndex === index;
            return (
              <button
                key={category.id}
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => setActiveIndex(index)}
                className={[
                  "relative flex min-h-12 w-full cursor-pointer items-center px-3 py-3 text-start text-xs leading-snug transition md:px-4",
                  active
                    ? "text-primary bg-white font-semibold"
                    : "text-gray-700 hover:bg-white/80",
                ].join(" ")}
              >
                {active && (
                  <span className="bg-primary absolute start-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-e-full" />
                )}
                <span className="line-clamp-2">{category.name}</span>
              </button>
            );
          })
        )}
      </aside>

      <main className="h-full flex-1 overflow-y-auto bg-white px-4 py-4 md:px-6">
        {showSkeleton && (
          <div className="space-y-7">
            {Array.from({ length: RIGHT_SKELETON_GROUPS }).map(
              (_, groupIndex) => (
                <div key={groupIndex}>
                  <Skeleton className="mb-4 h-4 w-24 rounded-md" />
                  <div className="grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
                    {Array.from({ length: RIGHT_SKELETON_ITEMS }).map(
                      (_, itemIndex) => (
                        <div
                          key={itemIndex}
                          className="flex flex-col items-center gap-2"
                        >
                          <Skeleton className="h-16 w-16 rounded-full" />
                          <Skeleton className="h-3 w-14" />
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        )}

        {!showSkeleton && activeCategory && level2List.length === 0 && (
          <p className="text-sm text-gray-500">{t("No sub-categories")}</p>
        )}

        {!showSkeleton && level2List.length > 0 && (
          <div className="space-y-8 pb-4">
            {level2List.map((level2) => {
              const level3List = level2.children;
              const displayList = level3List.length > 0 ? level3List : [level2];
              return (
                <div key={level2.id}>
                  <h5 className="mb-4 text-[13px] font-semibold text-[#111827]">
                    {level2.name}
                  </h5>

                  <div className="grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
                    {displayList.map((item) => {
                      const { name, icon } = item;
                      return (
                        <Link
                          key={item.id}
                          href={getCategoryHref(item)}
                          className="group flex min-w-0 flex-col items-center gap-2 text-center"
                        >
                          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gray-100 md:h-[72px] md:w-[72px]">
                            {icon?.type === "url" ? (
                              <img
                                src={icon.value}
                                alt=""
                                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                referrerPolicy="no-referrer"
                              />
                            ) : icon?.type === "name" &&
                              CATEGORY_ICON_NAMES.has(icon.value) ? (
                              <DynamicIcon
                                name={icon.value as IconName}
                                aria-hidden="true"
                                className="size-7 text-gray-500"
                              />
                            ) : (
                              <span className="text-xs text-gray-400">?</span>
                            )}
                          </div>

                          <span className="group-hover:text-primary line-clamp-2 max-w-full text-xs leading-snug text-gray-700">
                            {name}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
