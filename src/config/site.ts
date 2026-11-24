import { DEFAULT_LOCALE, LOCALES, LOCALE_CONFIG } from "@/lib/locale";
export const SITE_LOGO = {
  url: "/assets/brand/hiobuy-logo.png",
  width: 130,
  height: 38.75,
};
export const SITE_LANGUAGES = LOCALES.map((code) => ({
  code,
  name: LOCALE_CONFIG[code].name,
  flag: LOCALE_CONFIG[code].flag,
  language_code: LOCALE_CONFIG[code].apiLocale,
}));
export const DEFAULT_LANGUAGE = SITE_LANGUAGES.find(
  (language) => language.code === DEFAULT_LOCALE,
)!;
