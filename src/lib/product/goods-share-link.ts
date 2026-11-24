import { useProcurementSessionStore } from "@/lib/procurement/session-store";

export function getGoodsShareLink(href: string): string {
  const userId = useProcurementSessionStore.getState().user?.id;
  if (!userId) return href;
  const url = new URL(href);
  url.searchParams.set("invite_id", userId);
  return url.toString();
}
