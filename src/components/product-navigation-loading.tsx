"use client";

import { ROUTER_TRANSITION_START_EVENT } from "@/instrumentation-client";
import { usePathname, useSearchParams } from "next/navigation";
import { useLayoutEffect } from "react";
import { create } from "zustand";
import { RouteLoading } from "./route-loading";

const useProductNavigation = create<{ sourceRoute: string | null }>(() => ({
  sourceRoute: null,
}));

export function ProductNavigationLoading() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const route = `${pathname}?${searchParams}`;
  const sourceRoute = useProductNavigation((state) => state.sourceRoute);

  useLayoutEffect(() => {
    let timeout: number | undefined;

    const clearLoading = () => {
      window.clearTimeout(timeout);
      useProductNavigation.setState({ sourceRoute: null });
    };

    function handleTransitionStart(event: Event) {
      const target = new URL(
        (event as CustomEvent<string>).detail,
        window.location.href,
      );
      const targetRoute = `${target.pathname}?${target.searchParams}`;
      if (
        target.origin !== window.location.origin ||
        !target.pathname.startsWith("/product/") ||
        targetRoute === route
      ) {
        clearLoading();
        return;
      }

      window.clearTimeout(timeout);
      useProductNavigation.setState({ sourceRoute: route });
      timeout = window.setTimeout(clearLoading, 30_000);
    }

    window.addEventListener(
      ROUTER_TRANSITION_START_EVENT,
      handleTransitionStart,
    );
    return () => {
      window.removeEventListener(
        ROUTER_TRANSITION_START_EVENT,
        handleTransitionStart,
      );
      clearLoading();
    };
  }, [route]);

  return sourceRoute === route ? <RouteLoading /> : null;
}
