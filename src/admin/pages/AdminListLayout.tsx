import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ADMIN_PAGE_SIZES, paginationWindow } from "../../domain/admin-pagination";
import { useI18n } from "../lib/i18n";
import { cn } from "../lib/utils";

export function AdminListViewport({ children, resetKey, label, busy = false }: { children: ReactNode; resetKey: string; label: string; busy?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (ref.current) ref.current.scrollTop = 0; }, [resetKey]);
  return <div ref={ref} role="region" tabIndex={0} aria-label={label} aria-busy={busy} className="admin-list-viewport scroll-area outline-offset-[-2px]">
    <div inert={busy || undefined} className={cn("min-h-full", busy && "opacity-60")}>{children}</div>
  </div>;
}

export function AdminPagination({ page, pageSize, total, onChange, onPageSizeChange, disabled = false }: {
  page: number; pageSize: number; total: number; onChange: (page: number) => void; onPageSizeChange: (size: number) => void; disabled?: boolean;
}) {
  const { t } = useI18n();
  const view = paginationWindow(page, pageSize, total);
  const buttonClass = "grid size-8 shrink-0 place-items-center rounded-md text-xs transition disabled:cursor-not-allowed disabled:opacity-40 sm:size-9";
  return <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-white px-4 py-4 text-xs text-slate-400 sm:px-5">
    <p className="tabular-nums" aria-live="polite">{t("Showing {from}–{to} of {total} records", { from: view.from, to: view.to, total })}</p>
    <nav aria-label={t("List pagination")} className="flex max-w-full flex-wrap items-center gap-1 sm:gap-2">
      <select className="mr-2 h-9 rounded-md border border-line bg-white px-2 text-xs text-slate-500 disabled:opacity-40" aria-label={t("Records per page")} disabled={disabled} value={pageSize} onChange={event => onPageSizeChange(Number(event.target.value))}>
        {ADMIN_PAGE_SIZES.map(size => <option key={size} value={size}>{t("{count} / page", { count: size })}</option>)}
      </select>
      <button type="button" className={buttonClass} aria-label={t("Previous page")} disabled={disabled || view.page === 1} onClick={() => onChange(view.page - 1)}><ChevronLeft size={16} /></button>
      {view.buttons.map((number, index) => number === "ellipsis" ? <span key={`gap-${index}`} className="px-1" aria-hidden="true">…</span> : <button key={number} type="button" className={cn(buttonClass, number === view.page ? "border border-indigo-200 bg-indigo-50 font-medium text-indigo-600" : "hover:bg-slate-50 hover:text-ink")} aria-label={t("Go to page {page}", { page: number })} aria-current={number === view.page ? "page" : undefined} disabled={disabled} onClick={() => { if (number !== view.page) onChange(number); }}>{number}</button>)}
      <button type="button" className={buttonClass} aria-label={t("Next page")} disabled={disabled || view.page === view.pages} onClick={() => onChange(view.page + 1)}><ChevronRight size={16} /></button>
    </nav>
  </div>;
}
