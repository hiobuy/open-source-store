"use client";

import { createContext, useContext } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  type Locale,
  parseLocale,
} from "@/lib/locale";

function readLocaleCookie(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;

  const value = document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);

  try {
    return parseLocale(value ? decodeURIComponent(value) : undefined);
  } catch {
    return DEFAULT_LOCALE;
  }
}

export type LocaleState = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  hydrate: (locale: Locale) => void;
};

export function createLocaleStore(locale: Locale) {
  return createStore<LocaleState>((set) => ({
    locale,
    setLocale: (locale) => {
      document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
      set({ locale });
    },
    hydrate: (locale) => set({ locale }),
  }));
}

// The browser has one store. Server renders receive a fresh store through context.
export const clientLocaleStore = createLocaleStore(readLocaleCookie());
export const LocaleStoreContext = createContext<StoreApi<LocaleState> | null>(
  null,
);

function useScopedLocaleStore<T>(selector: (state: LocaleState) => T): T {
  const store = useContext(LocaleStoreContext) ?? clientLocaleStore;
  return useStore(store, selector);
}

export const useLocaleStore = Object.assign(useScopedLocaleStore, {
  getState: clientLocaleStore.getState,
});
