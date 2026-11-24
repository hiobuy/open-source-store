export const LOCALES = [
  "en",
  "cn",
  "ja",
  "ko",
  "es",
  "fr",
  "de",
  "pt",
  "ru",
  "pl",
  "ar",
  "it",
] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "locale";
export const LOCALE_CONFIG = {
  en: {
    name: "English",
    flag: "🇺🇸",
    apiLocale: "en_US",
    htmlLang: "en",
    direction: "ltr",
  },
  cn: {
    name: "中文",
    flag: "🇨🇳",
    apiLocale: "zh_CN",
    htmlLang: "zh-CN",
    direction: "ltr",
  },
  ja: {
    name: "日本語",
    flag: "🇯🇵",
    apiLocale: "ja",
    htmlLang: "ja",
    direction: "ltr",
  },
  ko: {
    name: "한국어",
    flag: "🇰🇷",
    apiLocale: "ko_KR",
    htmlLang: "ko",
    direction: "ltr",
  },
  es: {
    name: "Español",
    flag: "🇪🇸",
    apiLocale: "es_ES",
    htmlLang: "es",
    direction: "ltr",
  },
  fr: {
    name: "Français",
    flag: "🇫🇷",
    apiLocale: "fr_FR",
    htmlLang: "fr",
    direction: "ltr",
  },
  de: {
    name: "Deutsch",
    flag: "🇩🇪",
    apiLocale: "de_DE",
    htmlLang: "de",
    direction: "ltr",
  },
  pt: {
    name: "Português",
    flag: "🇵🇹",
    apiLocale: "pt_BR",
    htmlLang: "pt-BR",
    direction: "ltr",
  },
  ru: {
    name: "Русский",
    flag: "🇷🇺",
    apiLocale: "ru_RU",
    htmlLang: "ru",
    direction: "ltr",
  },
  pl: {
    name: "Polski",
    flag: "🇵🇱",
    apiLocale: "pl_PL",
    htmlLang: "pl",
    direction: "ltr",
  },
  ar: {
    name: "العربية",
    flag: "🇸🇦",
    apiLocale: "ar",
    htmlLang: "ar",
    direction: "rtl",
  },
  it: {
    name: "Italiano",
    flag: "🇮🇹",
    apiLocale: "it_IT",
    htmlLang: "it",
    direction: "ltr",
  },
} as const;
export const LOCALE_HTML_LANG: Record<Locale, string> = Object.fromEntries(
  LOCALES.map((code) => [code, LOCALE_CONFIG[code].htmlLang]),
) as Record<Locale, string>;
export function isLocale(value: string | undefined): value is Locale {
  return LOCALES.some((locale) => locale === value);
}
export function parseLocale(value: string | undefined): Locale {
  const normalized = value?.trim().replaceAll("_", "-").toLowerCase();
  const short = normalized?.split("-")[0];
  const code = short === "zh" ? "cn" : short;
  return isLocale(code) ? code : DEFAULT_LOCALE;
}
export function localeDirection(locale: Locale): "ltr" | "rtl" {
  return LOCALE_CONFIG[locale].direction;
}
export function localeApiCode(locale: Locale): string {
  return LOCALE_CONFIG[locale].apiLocale;
}
