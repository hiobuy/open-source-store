import React from "react";
import { useTranslations } from "next-intl";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
interface CustomPaginationProps {
  total: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  pageSizeOptions?: readonly number[];
  onPageChange: (page: number, size: number) => void;
}
const DEFAULT_PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100];
/**
 * Custom pagination component
 * @param total - Total record count
 * @param currentPage - Current page number
 * @param totalPages - Total pages
 * @param pageSize - Items per page
 * @param onPageChange - Callback when page or page size changes
 */
export const CustomPagination: React.FC<CustomPaginationProps> = ({
  total,
  currentPage,
  totalPages,
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onPageChange,
}) => {
  const t = useTranslations();
  // Nothing to page through: hide the bar entirely for empty lists.
  if (total <= 0) return null;
  const countLine = t(
    "Total {total} records, Page {currentPage} / {totalPages}",
    { total, currentPage, totalPages },
  );
  return (
    <div className="mt-4">
      {/* Desktop: single row */}
      <div className="hidden items-center justify-between gap-4 sm:flex">
        <div className="text-sm whitespace-nowrap text-gray-500">
          {countLine}
        </div>
        <div className="flex items-center gap-4">
          {pageSizeOptions.length > 0 && (
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-sm text-gray-500">{t("Per page")}</span>
              <select
                value={pageSize}
                onChange={(e) => onPageChange(1, Number(e.target.value))}
                className="focus:ring-primary cursor-pointer rounded border bg-white px-2 py-1 text-sm focus:ring-2 focus:outline-none"
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <span className="text-sm text-gray-500">{t("items")}</span>
            </div>
          )}
          {totalPages > 1 && (
            <Pagination>
              <PaginationContent className="gap-1">
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() =>
                      currentPage > 1 && onPageChange(currentPage - 1, pageSize)
                    }
                    className={
                      currentPage <= 1
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>

                {/* Show first 3 pages */}
                {Array.from(
                  { length: Math.min(3, totalPages) },
                  (_, i) => i + 1,
                ).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      onClick={() => onPageChange(page, pageSize)}
                      isActive={currentPage === page}
                      className="h-8 min-w-[32px] cursor-pointer px-2 text-sm"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}

                {/* Ellipsis when more than 3 pages */}
                {totalPages > 3 && (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                )}

                <PaginationItem>
                  <PaginationNext
                    onClick={() =>
                      currentPage < totalPages &&
                      onPageChange(currentPage + 1, pageSize)
                    }
                    className={
                      currentPage >= totalPages
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      </div>

      {/* Mobile: two rows, end-aligned */}
      <div className="space-y-2 sm:hidden">
        <div className="text-end text-sm whitespace-nowrap text-gray-500">
          {countLine}
        </div>
        <div className="flex flex-col items-end gap-2">
          {onPageChange && (
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-sm text-gray-500">{t("Per page")}</span>
              <select
                value={pageSize}
                onChange={(e) => onPageChange(1, Number(e.target.value))}
                className="focus:ring-primary cursor-pointer rounded border bg-white px-2 py-1 text-sm focus:ring-2 focus:outline-none"
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <span className="text-sm text-gray-500">{t("items")}</span>
            </div>
          )}
          {totalPages > 1 && (
            <Pagination>
              <PaginationContent className="gap-1">
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() =>
                      currentPage > 1 && onPageChange(currentPage - 1, pageSize)
                    }
                    className={
                      currentPage <= 1
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>

                {/* Show first 3 pages */}
                {Array.from(
                  { length: Math.min(3, totalPages) },
                  (_, i) => i + 1,
                ).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      onClick={() => onPageChange(page, pageSize)}
                      isActive={currentPage === page}
                      className="h-8 min-w-[32px] cursor-pointer px-2 text-xs"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}

                {/* Ellipsis when more than 3 pages */}
                {totalPages > 3 && (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                )}

                <PaginationItem>
                  <PaginationNext
                    onClick={() =>
                      currentPage < totalPages &&
                      onPageChange(currentPage + 1, pageSize)
                    }
                    className={
                      currentPage >= totalPages
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      </div>
    </div>
  );
};
