"use client";

import { getErrorMessage } from "@/lib/error-message";
import {
  addProcurementFavorite,
  deleteProcurementFavorite,
  getProcurementFavoriteId,
  getProcurementShopSubscriptionId,
  ProcurementApiError,
  subscribeToProcurementShop,
  unsubscribeFromProcurementShop,
} from "@/lib/procurement/client";
import {
  procurementChannel,
  procurementShopPath,
} from "@/lib/procurement/catalog";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
import type { ProcurementProductChannel } from "@/lib/procurement/types";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type SavedItemActions = {
  read: (
    channel: ProcurementProductChannel,
    id: string,
  ) => Promise<string | null>;
  add: (
    channel: ProcurementProductChannel,
    id: string,
    details?: { name: string; listingShopId: string },
  ) => Promise<{ id: string }>;
  remove: (id: string) => Promise<unknown>;
};

const productActions: SavedItemActions = {
  read: getProcurementFavoriteId,
  add: addProcurementFavorite,
  remove: deleteProcurementFavorite,
};

const shopActions: SavedItemActions = {
  read: getProcurementShopSubscriptionId,
  add: (channel, id, details) => {
    const name = details?.name.trim().slice(0, 200) || undefined;
    const path = procurementShopPath(
      channel,
      id,
      undefined,
      details?.listingShopId,
    );
    const url = new URL(path, window.location.origin).href;
    return subscribeToProcurementShop(channel, id, name, url);
  },
  remove: unsubscribeFromProcurementShop,
};

function useProcurementSavedItem(
  actions: SavedItemActions,
  platform: string | number | undefined,
  item: string | number | undefined,
  details?: { name: string; listingShopId: string },
) {
  const t = useTranslations();
  const router = useRouter();
  const hasSession = useProcurementSessionStore((state) => state.hasSession);
  const revision = useProcurementSessionStore(
    (state) => state.clientStateVersion,
  );
  const channel = procurementChannel(platform);
  const itemId = String(item ?? "").trim();
  const available = Boolean(channel && itemId);
  const key =
    hasSession && available ? JSON.stringify([revision, channel, itemId]) : "";
  const [favorite, setFavorite] = useState<{
    key: string;
    id: string | null;
    failed?: boolean;
  }>();
  const [submitting, setSubmitting] = useState(false);
  const current = favorite?.key === key ? favorite : undefined;

  useEffect(() => {
    if (!key || !channel) return;
    let active = true;
    actions.read(channel, itemId).then(
      (id) => {
        if (active) setFavorite({ key, id });
      },
      () => {
        if (active) setFavorite({ key, id: null, failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [actions, channel, key, itemId]);

  function goToLogin() {
    const returnPath = window.location.pathname + window.location.search;
    router.push(`/login?${new URLSearchParams({ redirect: returnPath })}`);
  }

  const loading = submitting || Boolean(key && !current);

  async function toggle(): Promise<boolean | null> {
    if (loading) return null;
    const session = useProcurementSessionStore.getState();
    if (!session.hasSession) {
      goToLogin();
      return null;
    }
    if (!channel || !itemId) {
      toast.error(t("Operation failed"));
      return null;
    }

    setSubmitting(true);
    try {
      const existing =
        !current || current.failed
          ? await actions.read(channel, itemId)
          : current.id;
      if (useProcurementSessionStore.getState().clientStateVersion !== revision)
        return null;

      let id: string | null = null;
      if (existing) await actions.remove(existing);
      else id = (await actions.add(channel, itemId, details)).id;

      if (useProcurementSessionStore.getState().clientStateVersion !== revision)
        return null;
      setFavorite((previous) =>
        !previous || previous.key === key ? { key, id } : previous,
      );
      toast.success(id ? t("Saved successfully") : t("Deleted successfully"));
      return Boolean(id);
    } catch (error) {
      if (error instanceof ProcurementApiError && error.status === 401) {
        goToLogin();
      } else {
        setFavorite((previous) =>
          previous?.key === key ? { ...previous, failed: true } : previous,
        );
        toast.error(getErrorMessage(error) || t("Operation failed"));
      }
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  return { collected: Boolean(current?.id), available, loading, toggle };
}

export function useProcurementFavorite(
  platform: string | number | undefined,
  productId: string | number | undefined,
) {
  return useProcurementSavedItem(productActions, platform, productId);
}

export function useProcurementShopSubscription(
  platform: string,
  shopId: string,
  name: string,
  listingShopId: string,
) {
  return useProcurementSavedItem(shopActions, platform, shopId, {
    name,
    listingShopId,
  });
}
