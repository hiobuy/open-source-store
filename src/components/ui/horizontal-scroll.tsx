/**
 * 横向滚动容器
 */
"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Direction } from "radix-ui";
import { cn } from "@/lib/utils";
import {
  getInlineScrollState,
  scrollInlineBy,
  scrollInlineTo,
  type InlineScrollDirection,
} from "@/lib/utils/inline-scroll";
export interface HorizontalScrollProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  viewportClassName?: string;
  contentClassName?: string;
  arrowClassName?: string;
  leftAriaLabel?: string;
  rightAriaLabel?: string;
  scrollAmount?: number | ((viewport: HTMLDivElement) => number);
  autoScroll?: boolean;
  autoScrollInterval?: number;
  pauseAutoScrollOnHover?: boolean;
}
export function HorizontalScroll({
  children,
  className,
  viewportClassName,
  contentClassName,
  arrowClassName,
  leftAriaLabel,
  rightAriaLabel,
  scrollAmount,
  autoScroll = false,
  autoScrollInterval = 3000,
  pauseAutoScrollOnHover = true,
  onMouseEnter,
  onMouseLeave,
  ...props
}: HorizontalScrollProps) {
  const t = useTranslations();
  const rtl = Direction.useDirection() === "rtl";
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const checkScrollability = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const { canScrollStart, canScrollEnd } = getInlineScrollState(viewport);
    setCanScrollLeft(canScrollStart);
    setCanScrollRight(canScrollEnd);
  }, []);
  const getScrollAmount = React.useCallback(
    (viewport: HTMLDivElement) =>
      typeof scrollAmount === "function"
        ? scrollAmount(viewport)
        : (scrollAmount ?? Math.max(viewport.clientWidth * 0.8, 240)),
    [scrollAmount],
  );
  const scroll = React.useCallback(
    (direction: InlineScrollDirection) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const amount = getScrollAmount(viewport);
      scrollInlineBy(viewport, direction, amount);
      window.setTimeout(checkScrollability, 300);
    },
    [checkScrollability, getScrollAmount],
  );
  React.useEffect(() => {
    if (!autoScroll || autoScrollInterval <= 0) return;
    if (pauseAutoScrollOnHover && isHovered) return;
    const intervalId = window.setInterval(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const amount = getScrollAmount(viewport);
      const { canScrollEnd } = getInlineScrollState(viewport);
      if (canScrollEnd) scrollInlineBy(viewport, "end", amount);
      else scrollInlineTo(viewport, "start");
      window.setTimeout(checkScrollability, 300);
    }, autoScrollInterval);
    return () => window.clearInterval(intervalId);
  }, [
    autoScroll,
    autoScrollInterval,
    checkScrollability,
    getScrollAmount,
    isHovered,
    pauseAutoScrollOnHover,
  ]);
  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    checkScrollability();
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(checkScrollability)
        : null;
    resizeObserver?.observe(viewport);
    window.addEventListener("resize", checkScrollability);
    const frame = window.requestAnimationFrame(checkScrollability);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", checkScrollability);
      resizeObserver?.disconnect();
    };
  }, [checkScrollability, children]);
  const baseArrowClassName = cn(
    "absolute top-1/2 z-10 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/55 shadow-lg transition-colors hover:bg-black/70",
    arrowClassName,
  );
  return (
    <div
      className={cn("relative", className)}
      onMouseEnter={(event) => {
        setIsHovered(true);
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        setIsHovered(false);
        onMouseLeave?.(event);
      }}
      {...props}
    >
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll("start")}
          className={cn(baseArrowClassName, "start-0")}
          aria-label={
            leftAriaLabel ?? t.raw(rtl ? "Scroll right" : "Scroll left")
          }
        >
          <ChevronLeft className="h-5 w-5 text-white" />
        </button>
      )}

      <div
        ref={viewportRef}
        className={cn(
          "hide-scrollbar overflow-x-auto scroll-smooth",
          viewportClassName,
        )}
        onScroll={checkScrollability}
      >
        <div className={cn("flex", contentClassName)}>{children}</div>
      </div>

      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll("end")}
          className={cn(baseArrowClassName, "end-0")}
          aria-label={
            rightAriaLabel ?? t.raw(rtl ? "Scroll left" : "Scroll right")
          }
        >
          <ChevronRight className="h-5 w-5 text-white" />
        </button>
      )}
    </div>
  );
}
