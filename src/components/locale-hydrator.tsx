"use client";

import { useLayoutEffect, useState } from "react";

import { type Locale, localeDirection, LOCALE_HTML_LANG } from "@/lib/locale";
import { Direction } from "radix-ui";
import {
  clientLocaleStore,
  createLocaleStore,
  LocaleStoreContext,
} from "@/stores/locale-store";

export function LocaleHydrator({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const [store] = useState(() =>
    typeof window === "undefined"
      ? createLocaleStore(locale)
      : clientLocaleStore,
  );
  useLayoutEffect(() => {
    store.getState().hydrate(locale);
    document.documentElement.dir = localeDirection(locale);
    document.documentElement.lang = LOCALE_HTML_LANG[locale];
  }, [locale, store]);

  return (
    <LocaleStoreContext.Provider value={store}>
      <Direction.Provider dir={localeDirection(locale)}>
        {children}
      </Direction.Provider>
    </LocaleStoreContext.Provider>
  );
}
