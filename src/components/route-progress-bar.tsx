"use client";

import { NAVIGATION_START_EVENT } from "@/lib/hooks/use-router-with-progress";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

export function RouteProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams}`;
  const committedRoute = useRef(routeKey);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const finishRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const indicator = indicatorRef.current;
    const fill = fillRef.current;
    if (!indicator || !fill) return;

    let animation: Animation | undefined;
    let timeout: number | undefined;

    const reset = () => {
      window.clearTimeout(timeout);
      animation?.cancel();
      indicator.hidden = true;
    };

    const start = (initialWidth: number) => {
      reset();
      indicator.hidden = false;
      animation = fill.animate(
        [{ width: `${initialWidth}%` }, { width: "85%" }],
        { duration: 800, easing: "ease-out", fill: "forwards" },
      );
      timeout = window.setTimeout(reset, 30_000);
    };

    finishRef.current = () => {
      if (indicator.hidden) return;
      const width = window.getComputedStyle(fill).width;
      window.clearTimeout(timeout);
      animation?.cancel();
      animation = fill.animate([{ width }, { width: "100%" }], {
        duration: 300,
        easing: "ease-out",
        fill: "forwards",
      });
      animation.onfinish = reset;
    };

    function handleLinkClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element) ||
        event.target.closest('[data-progress-ignore="true"]')
      )
        return;

      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (
        !link ||
        link.hasAttribute("download") ||
        (link.target && link.target !== "_self")
      )
        return;

      if (
        link.origin === window.location.origin &&
        link.pathname !== window.location.pathname
      )
        start(10);
    }

    function handleProgrammaticNavigation(event: Event) {
      const url = new URL(
        (event as CustomEvent<string>).detail,
        window.location.href,
      );
      if (
        url.origin === window.location.origin &&
        (url.pathname !== window.location.pathname ||
          url.search !== window.location.search)
      )
        start(10);
    }

    function handlePopState() {
      const url = new URL(window.location.href);
      if (`${url.pathname}?${url.searchParams}` !== committedRoute.current)
        start(20);
    }

    document.addEventListener("click", handleLinkClick, true);
    window.addEventListener(
      NAVIGATION_START_EVENT,
      handleProgrammaticNavigation,
    );
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("click", handleLinkClick, true);
      window.removeEventListener(
        NAVIGATION_START_EVENT,
        handleProgrammaticNavigation,
      );
      window.removeEventListener("popstate", handlePopState);
      finishRef.current = null;
      reset();
    };
  }, []);

  useEffect(() => {
    if (committedRoute.current === routeKey) return;
    committedRoute.current = routeKey;
    finishRef.current?.();
  }, [routeKey]);

  return (
    <div
      ref={indicatorRef}
      hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-0.5"
      role="progressbar"
      aria-label="Loading"
    >
      <div
        ref={fillRef}
        className="bg-primary h-full w-0"
        style={{
          boxShadow:
            "0 0 8px color-mix(in srgb, var(--primary) 40%, transparent)",
        }}
      />
    </div>
  );
}
