"use client";

import { LocalizedLink } from "@/components/localized-link";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ArrowUpToLine, Headphones, ShoppingCart } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { FaDiscord, FaWhatsapp } from "react-icons/fa6";

const POSITION_STORAGE_KEY = "haiou-customer-service-dock-y";
const DRAG_THRESHOLD_PX = 5;
const VIEWPORT_MARGIN_PX = 16;
const CHINA_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const CHANNELS = [
  { name: "WhatsApp", href: "#", Icon: FaWhatsapp, color: "text-[#25d366]" },
  { name: "Discord", href: "#", Icon: FaDiscord, color: "text-[#5865f2]" },
];
const ACTION_CLASS =
  "flex h-12 w-full shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function readSavedPosition(): number {
  if (typeof window === "undefined") return 50;
  try {
    const saved = localStorage.getItem(POSITION_STORAGE_KEY);
    const parsed = saved === null ? NaN : Number(saved);
    return Number.isFinite(parsed) ? parsed : 50;
  } catch {
    return 50;
  }
}

function clampPosition(
  position: number,
  height: number,
  viewportHeight: number,
) {
  const minimum = ((height / 2 + VIEWPORT_MARGIN_PX) / viewportHeight) * 100;
  return Math.min(100 - minimum, Math.max(minimum, position));
}

function ChinaTime() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="shrink-0 text-center">
      <p
        className="text-[11px] leading-4 font-bold tracking-wide text-[#969189]"
        dir="ltr"
      >
        UTC+8
      </p>
      <time
        dateTime={now.toISOString()}
        dir="ltr"
        className="block text-sm leading-5 font-extrabold tracking-tight whitespace-nowrap text-[#202020] tabular-nums"
      >
        {CHINA_TIME_FORMATTER.format(now)}
      </time>
    </div>
  );
}

function SupportPanel({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations();

  return (
    <div className="flex max-h-[calc(100dvh-2rem)] w-16 flex-col overflow-y-auto rounded-3xl bg-white px-1 py-3 shadow-[0_8px_28px_rgba(68,48,25,0.1)]">
      <ChinaTime />
      <LocalizedLink
        href="/cart"
        aria-label={t("Cart")}
        title={t("Cart")}
        className={cn(ACTION_CLASS, "mt-2 text-[#242424]")}
        onClick={onNavigate}
      >
        <ShoppingCart
          className="size-[26px]"
          strokeWidth={2.25}
          aria-hidden="true"
        />
      </LocalizedLink>
      <div className="mx-auto my-2 h-[2px] w-7 shrink-0 bg-[#eee9e1]" />
      {CHANNELS.map(({ name, href, Icon, color }) => (
        <a
          key={name}
          href={href}
          title={name}
          aria-label={name}
          target={href === "#" ? undefined : "_blank"}
          rel={href === "#" ? undefined : "noopener noreferrer"}
          className={cn(ACTION_CLASS, color)}
          draggable={false}
          onClick={(event) => {
            if (href === "#") {
              event.preventDefault();
              return;
            }
            onNavigate?.();
          }}
        >
          <Icon className="size-7" aria-hidden="true" />
        </a>
      ))}
      <div className="mx-auto my-2 h-[2px] w-7 shrink-0 bg-[#eee9e1]" />
      <button
        type="button"
        title={t("Back to top")}
        aria-label={t("Back to top")}
        className={cn(ACTION_CLASS, "hover:text-primary text-[#b5b5b5]")}
        onClick={() => {
          window.scrollTo({ top: 0, behavior: "smooth" });
          onNavigate?.();
        }}
      >
        <ArrowUpToLine
          className="size-[26px]"
          strokeWidth={2.5}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

export function CustomerService() {
  const t = useTranslations();
  const hydrated = useHydrated();
  const isMobile = useIsMobile();
  const dockRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{
    x: number;
    y: number;
    position: number;
    moved: boolean;
  } | null>(null);
  const blockClickRef = useRef(false);
  const [positionY, setPositionY] = useState(readSavedPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  if (!isMobile && mobileExpanded) setMobileExpanded(false);

  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (!hydrated || !dock) return;
    const keepInViewport = () => {
      setPositionY((position) =>
        clampPosition(position, dock.offsetHeight, window.innerHeight),
      );
    };
    keepInViewport();
    const observer = new ResizeObserver(keepInViewport);
    observer.observe(dock);
    window.addEventListener("resize", keepInViewport);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", keepInViewport);
    };
  }, [hydrated]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (
      event.button !== 0 ||
      !event.currentTarget.contains(event.target as Node)
    )
      return;
    blockClickRef.current = false;
    pointerRef.current = {
      x: event.clientX,
      y: event.clientY,
      position: positionY,
      moved: false,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current;
    if (!pointer) return;
    const deltaY = event.clientY - pointer.y;
    if (
      !pointer.moved &&
      Math.hypot(event.clientX - pointer.x, deltaY) < DRAG_THRESHOLD_PX
    )
      return;
    if (!pointer.moved) {
      pointer.moved = true;
      blockClickRef.current = true;
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    const nextPosition = clampPosition(
      pointer.position + (deltaY / window.innerHeight) * 100,
      event.currentTarget.offsetHeight,
      window.innerHeight,
    );
    setPositionY(nextPosition);
    try {
      localStorage.setItem(POSITION_STORAGE_KEY, String(nextPosition));
    } catch {
      // Position persistence is optional when browser storage is unavailable.
    }
  }

  function finishPointer(event: PointerEvent<HTMLDivElement>) {
    pointerRef.current = null;
    setIsDragging(false);
    if (event.type === "pointercancel") blockClickRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  if (!hydrated) return null;

  return createPortal(
    <div
      ref={dockRef}
      data-customer-service-dock
      role="complementary"
      aria-label={t("Customer support shortcuts")}
      className={cn(
        "fixed end-3 z-20 -translate-y-1/2 touch-none md:end-4",
        isDragging ? "cursor-grabbing select-none" : "cursor-grab",
      )}
      style={{ top: `${positionY}%` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onDragStart={(event) => event.preventDefault()}
      onClickCapture={(event) => {
        if (!blockClickRef.current) return;
        blockClickRef.current = false;
        if (event.detail > 0) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      {isMobile ? (
        <Popover open={mobileExpanded} onOpenChange={setMobileExpanded} modal>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("Customer support")}
              className="text-primary focus-visible:outline-primary flex size-13 items-center justify-center rounded-2xl bg-white shadow-[0_4px_24px_rgba(0,0,0,0.12)] focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Headphones className="size-6" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="left"
            sideOffset={12}
            collisionPadding={16}
            aria-label={t("Customer support shortcuts")}
            className="w-auto rounded-3xl border-0 bg-transparent p-0 shadow-none"
          >
            <SupportPanel onNavigate={() => setMobileExpanded(false)} />
          </PopoverContent>
        </Popover>
      ) : (
        <SupportPanel />
      )}
    </div>,
    document.body,
  );
}
