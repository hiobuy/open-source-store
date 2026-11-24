"use client";
import { useHydrated } from "@/hooks/use-hydrated";
import { useTranslations as useUiTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { extractLanguageFromPath } from "@/lib/utils/language";
export interface HeaderTopAdItem {
  imageUrl?: string;
  linkPath?: string;
  /** internal: 站内链接, external: 外链 */
  linkType?: "internal" | "external";
}
const HIDE_STORAGE_KEY = "ads_show";
function isDismissed() {
  try {
    return sessionStorage.getItem(HIDE_STORAGE_KEY) === "0";
  } catch {
    return false;
  }
}
function openAdLink(ad: HeaderTopAdItem) {
  const linkPath = String(ad.linkPath || "").trim();
  if (!linkPath || linkPath === "#") return;
  if (ad.linkType === "internal") {
    const path = linkPath.replace(/^\/+/, "");
    window.open(`${window.location.origin}/${path}`, "_blank");
    return;
  }
  window.open(linkPath, "_blank");
}
function autoPlayIntervalToMs(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 5000;
  if (n >= 1000) return Math.max(2000, Math.round(n));
  return Math.max(2, Math.round(n)) * 1000;
}
export function HeaderTopAds({
  enabled = true,
  items = [],
  autoPlayInterval = 5,
  className,
}: {
  enabled?: boolean;
  items?: HeaderTopAdItem[];
  autoPlayInterval?: number;
  className?: string;
}) {
  const translateUi = useUiTranslations();

  const pathname = usePathname() || "/";

  const hydrated = useHydrated();
  const [dismissed, setHidden] = useState(false);
  const hidden = !hydrated || dismissed || (hydrated && isDismissed());
  const [transitionEnabled, setTransitionEnabled] = useState(true);
  const actualPath = useMemo(
    () => extractLanguageFromPath(pathname, "zh").actualPath,
    [pathname],
  );
  const normalizedPath = useMemo(() => {
    const trimmed = actualPath.replace(/\/+$/, "");
    return trimmed || "/";
  }, [actualPath]);
  const isLoginOrRegisterPage =
    normalizedPath === "/login" || normalizedPath === "/register";
  const slides = useMemo(
    () =>
      (items || []).filter((item) =>
        Boolean(String(item?.imageUrl || "").trim()),
      ),
    [items],
  );
  const [trackIndex, setTrackIndex] = useState(slides.length > 1 ? 1 : 0);
  const [previousSlideCount, setPreviousSlideCount] = useState(slides.length);
  if (previousSlideCount !== slides.length) {
    setPreviousSlideCount(slides.length);
    setTransitionEnabled(true);
    setTrackIndex(slides.length > 1 ? 1 : 0);
  }
  const slidesWithClone = useMemo(
    () =>
      slides.length > 1
        ? [slides[slides.length - 1], ...slides, slides[0]]
        : slides,
    [slides],
  );
  const autoPlayDelayMs = useMemo(
    () => autoPlayIntervalToMs(autoPlayInterval),
    [autoPlayInterval],
  );
  const isAtCloneTail = slides.length > 1 && trackIndex === slides.length + 1;
  useEffect(() => {
    if (slides.length <= 1) return;
    if (isAtCloneTail) return;
    const timer = window.setTimeout(() => {
      setTrackIndex((prev) => prev + 1);
    }, autoPlayDelayMs);
    return () => clearTimeout(timer);
  }, [slides.length, autoPlayDelayMs, trackIndex, isAtCloneTail]);
  if (!enabled || isLoginOrRegisterPage || hidden || slides.length === 0) {
    return null;
  }
  return (
    <div
      className={cn(
        "top-ads relative hidden transition-all duration-200 ease-in-out md:block",
        className,
      )}
    >
      <div className="h-[70px] overflow-hidden">
        <div
          className="flex flex-col will-change-transform"
          style={{
            transform: `translateY(-${trackIndex * 70}px)`,
            transition: transitionEnabled ? "transform 500ms ease-out" : "none",
          }}
          onTransitionEnd={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.propertyName !== "transform") return;
            if (slides.length > 1 && trackIndex === slides.length + 1) {
              setTransitionEnabled(false);
              setTrackIndex(1);
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  setTransitionEnabled(true);
                });
              });
            }
          }}
        >
          {slidesWithClone.map((ad, adIndex) => (
            <div
              key={String(adIndex)}
              className="bg-placeholder h-[70px] bg-neutral-100"
            >
              <img
                src={String(ad.imageUrl)}
                className={cn(
                  "h-full w-full object-cover",
                  !!ad.linkPath ? "cursor-pointer" : "",
                )}
                onClick={() => openAdLink(ad)}
                alt=""
              />
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        aria-label={translateUi.raw("Hide top ads")}
        className="absolute end-[10%] top-2.5 inline-flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full bg-black/35 text-white hover:bg-black/50"
        onClick={() => {
          if (typeof window !== "undefined") {
            try {
              sessionStorage.setItem(HIDE_STORAGE_KEY, "0");
            } catch {}
          }
          setHidden(true);
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
