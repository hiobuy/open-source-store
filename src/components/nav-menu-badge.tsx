import type { QtyInfo } from "@/lib/store/common";
import { cn } from "@/lib/utils";
export function getNavMenuBadgeCount(
  keyName: string,
  qtyInfo: QtyInfo,
): number {
  if (!qtyInfo || typeof qtyInfo !== "object") return 0;
  switch (keyName) {
    case "daigouOrder": {
      const daigouOrder = qtyInfo.daigou_order as
        Record<string | number, number> | undefined;
      return Number(daigouOrder?.[0] ?? daigouOrder?.["0"] ?? 0) || 0;
    }
    case "warehouse":
      return Number(qtyInfo.already_storage ?? 0) || 0;
    case "parcelList":
      return Number(qtyInfo.wait_pay ?? 0) || 0;
    case "consult": {
      const consult = qtyInfo.consult as
        | {
            unread_consult?: number;
          }
        | undefined;
      return Number(consult?.unread_consult ?? 0) || 0;
    }
    default:
      return 0;
  }
}
export function formatNavMenuBadgeCount(count: number): string {
  if (count <= 0) return "";
  return count > 99 ? "99+" : String(count);
}
/** 与 DaigouOrder Tab 角标一致的红色数字角标 */
export function CountBadge({
  count,
  className,
  inline = false,
}: {
  count: number;
  className?: string;
  /** 跟在文字后面；默认绝对定位在右上角 */
  inline?: boolean;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        inline
          ? "ms-1 inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-medium text-white"
          : "absolute -end-3 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-medium text-white",
        className,
      )}
    >
      {formatNavMenuBadgeCount(count)}
    </span>
  );
}
export function NavMenuLabelWithBadge({
  label,
  badgeCount,
  className,
}: {
  label: string;
  badgeCount: number;
  className?: string;
}) {
  if (badgeCount <= 0) {
    return <span className={className}>{label}</span>;
  }
  return (
    <span className={cn("inline-flex items-center", className)}>
      <span>{label}</span>
      <CountBadge count={badgeCount} inline />
    </span>
  );
}
