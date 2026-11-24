"use client";

import { useEffect, useRef } from "react";
import { procurementChannel } from "@/lib/procurement/catalog";
import { recordProcurementProductView } from "@/lib/procurement/client";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";

export function useProcurementProductView(
  platform: string | undefined,
  product: string | number | undefined,
) {
  const hasSession = useProcurementSessionStore((state) => state.hasSession);
  const revision = useProcurementSessionStore(
    (state) => state.clientStateVersion,
  );
  const lastView = useRef("");
  const channel = procurementChannel(platform);
  const productId = String(product ?? "").trim();

  useEffect(() => {
    if (!hasSession || !channel || !productId) {
      lastView.current = "";
      return;
    }

    const key = JSON.stringify([revision, channel, productId]);
    if (lastView.current === key) return;
    lastView.current = key;

    void recordProcurementProductView(channel, productId).catch(() => {
      if (lastView.current === key) lastView.current = "";
    });
  }, [channel, hasSession, productId, revision]);
}
