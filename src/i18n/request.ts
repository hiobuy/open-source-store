import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { LOCALE_COOKIE, parseLocale } from "@/lib/locale";

import { messageLoaders } from "./messages";

export default getRequestConfig(async () => {
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);

  return {
    locale,
    messages: (await messageLoaders[locale]()).default,
  };
});
