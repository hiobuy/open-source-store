import "server-only";

import { LOCALE_HTML_LANG, parseLocale } from "@/lib/locale";
import { resolveProductRequest } from "@/lib/product-request";
import { procurementChannel } from "@/lib/procurement/catalog";
import type { ProcurementProduct } from "@/lib/procurement/types";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { betterAuthCookies, fetchApi } from "./api";

export const getServerProduct = cache(async (pathname: string) => {
  const params = resolveProductRequest(pathname);
  const channel = procurementChannel(params.platform);
  const isUrl = /^https?:\/\//i.test(params.keyword);
  if (!params.keyword || (!isUrl && !channel)) return { status: 404 };

  const [locale, cookieStore] = await Promise.all([getLocale(), cookies()]);
  const cookie = betterAuthCookies(cookieStore.toString());
  if (!cookie) return { status: 401 };

  const language = LOCALE_HTML_LANG[parseLocale(locale)];
  try {
    const response = await fetchApi(
      isUrl ? "products/parse" : "products/detail",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cookie,
        body: JSON.stringify(
          isUrl
            ? { url: params.keyword, language }
            : { channel, id: params.keyword, language },
        ),
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) return { status: response.status };
    const { data } = (await response.json()) as {
      data: { product: ProcurementProduct };
    };
    return { product: data.product, language, status: response.status };
  } catch {
    return { status: 502 };
  }
});
