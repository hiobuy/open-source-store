import {
  type Locale,
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  parseLocale,
  localeApiCode,
} from "@/lib/locale";
import { useLocaleStore } from "@/stores/locale-store";
export type LanguageCode = Locale;
export const SUPPORTED_LANGUAGE_CODES = LOCALES;
export const DEFAULT_LANGUAGE = DEFAULT_LOCALE;
export const DEFAULT_LANGUAGE_HEADER_LOCALE = "en_US";
export function parseSupportedLangCode(
  value: string | undefined | null,
): Locale | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .split("-")[0];
  return normalized === "zh" || isLocale(normalized)
    ? parseLocale(value)
    : null;
}
export function extractLanguageFromPath(
  path: string,
  defaultLanguage: string = DEFAULT_LOCALE,
) {
  const parts = path.split("/").filter(Boolean);
  const prefixed = parseSupportedLangCode(parts[0]);
  return {
    lang: prefixed || parseSupportedLangCode(defaultLanguage) || DEFAULT_LOCALE,
    actualPath: prefixed ? "/" + parts.slice(1).join("/") : path || "/",
  };
}
export function resolveLanguageForClient(
  pathname: string,
  defaultLanguage: string = DEFAULT_LOCALE,
): Locale {
  void pathname;
  void defaultLanguage;
  return useLocaleStore.getState().locale;
}
export function buildPathWithLanguage(
  path: string,
  lang?: LanguageCode,
  defaultLanguage: string = DEFAULT_LOCALE,
) {
  void lang;
  return extractLanguageFromPath(path, defaultLanguage).actualPath;
}
export function localeFromShortCode(code: string) {
  return localeApiCode(parseLocale(code));
}
export function writeLangCookie(code: string) {
  useLocaleStore
    .getState()
    .setLocale(parseSupportedLangCode(code) || DEFAULT_LOCALE);
}
export function getLanguageHeaderValueForClient() {
  return localeFromShortCode(useLocaleStore.getState().locale);
}
