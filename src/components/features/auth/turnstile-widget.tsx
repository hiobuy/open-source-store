"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: "light" | "dark" | "auto";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export type TurnstileWidgetHandle = {
  reset: () => void;
};

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstile() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Turnstile requires a browser"));
  }
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-procurement-turnstile]",
    );
    if (existing) {
      if (window.turnstile) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => {
          turnstileScriptPromise = null;
          reject(new Error("Turnstile failed to load"));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.procurementTurnstile = "";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => {
        turnstileScriptPromise = null;
        script.remove();
        reject(new Error("Turnstile failed to load"));
      },
      { once: true },
    );
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

export const TurnstileWidget = forwardRef<
  TurnstileWidgetHandle,
  {
    siteKey: string;
    enabled: boolean;
    onTokenChange: (token: string | null) => void;
  }
>(function TurnstileWidget({ siteKey, enabled, onTokenChange }, ref) {
  const t = useTranslations();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled || !siteKey) return;
    let active = true;
    setFailed(false);

    loadTurnstile()
      .then(() => {
        if (!active || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "light",
          callback: (token) => onTokenChange(token),
          "expired-callback": () => onTokenChange(null),
          "error-callback": () => {
            onTokenChange(null);
            setFailed(true);
          },
        });
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      onTokenChange(null);
      const widgetId = widgetIdRef.current;
      widgetIdRef.current = null;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [enabled, onTokenChange, siteKey]);

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        onTokenChange(null);
        const widgetId = widgetIdRef.current;
        if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
      },
    }),
    [onTokenChange],
  );

  if (!enabled || !siteKey) return null;

  return (
    <div>
      <div ref={containerRef} />
      {failed ? (
        <p className="text-destructive text-sm" role="alert">
          {t(
            "The security check couldn’t load Check your connection, then try again",
          )}
        </p>
      ) : null}
    </div>
  );
});
