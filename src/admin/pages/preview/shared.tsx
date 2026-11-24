import { Tr, useI18n } from "../../lib/i18n";
import type { ReactNode } from "react";
import { Info } from "lucide-react";

export function PreviewNotice() {
  return <div className="mb-5 flex gap-3 rounded-lg border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-[13px] text-indigo-900"><Info size={17} className="mt-0.5 shrink-0" /><div><strong> <Tr k="Interface preview · Sample data" /> </strong><p className="mt-1 text-indigo-800/80"> <Tr k="Changes stay on this page and reset when you leave or reload. No customer records, payments or HioBuy requests are created." /> </p></div></div>;
}

export function PreviewBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "red" | "blue" }) {
  const { t } = useI18n();
  const colors = { neutral: "bg-slate-100 text-slate-600", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-800", red: "bg-red-50 text-red-700", blue: "bg-indigo-50 text-indigo-700" };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${colors[tone]}`}>{typeof children === "string" ? t(children) : children}</span>;
}

export function Metrics({ items }: { items: { label: string; value: number | string; hint: string }[] }) {
  const { t } = useI18n();
  return <div className="admin-metrics mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">{items.map(item => <div key={item.label} className="admin-metric rounded-lg border border-line bg-white px-4 py-4"><p className="text-xs text-slate-500">{t(item.label)}</p><p className="my-2 text-2xl font-semibold tracking-tight text-ink tabular-nums">{item.value}</p><p className="text-[11px] text-slate-400">{t(item.hint)}</p></div>)}</div>;
}

export const tableClass = "w-full text-left text-[13px] [&_th]:whitespace-nowrap [&_th]:bg-slate-50 [&_th]:px-4 [&_th]:py-3 [&_th]:text-xs [&_th]:font-medium [&_th]:text-slate-500 [&_td]:px-4 [&_td]:py-4 [&_td]:align-top [&_tbody_tr]:border-t [&_tbody_tr]:border-slate-100";

export function previewMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function exportPreviewCsv(name: string, rows: (string | number)[][]) {
  const cell = (value: string | number) => {
    const text = String(value);
    return `"${(/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
  };
  const url = URL.createObjectURL(new Blob(["\ufeff" + rows.map(row => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
