"use client";

import { useEffect, useLayoutEffect } from "react";
import { useCommonStore } from "@/lib/store/common";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import {
  applyExternalProfileCache,
  useProcurementSessionStore,
} from "@/lib/procurement/session-store";
import {
  PROFILE_CACHE_KEY,
  readProfileCache,
} from "@/lib/procurement/profile-cache";

export function StorefrontBootstrap({
  hasProcurementSession,
  children,
}: {
  hasProcurementSession: boolean;
  children: React.ReactNode;
}) {
  useLayoutEffect(() => {
    useCommonStore.getState().initStorageData();
  }, []);
  useLayoutEffect(() => {
    useProcurementSessionStore
      .getState()
      .applyServerSession(hasProcurementSession);
  }, [hasProcurementSession]);
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== PROFILE_CACHE_KEY) return;
      if (event.newValue === null) {
        useProcurementSessionStore.getState().clearSession();
        return;
      }
      const cached = readProfileCache();
      if (!cached) return;
      applyExternalProfileCache(cached.user, cached.profile);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);
  return (
    <TooltipProvider>
      {children}
      <Toaster theme="light" richColors position="top-center" />
    </TooltipProvider>
  );
}
