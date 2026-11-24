/** API text maps: `{ original, translated, language }` (current) or `{ [locale]: text }` (legacy). */
export type LocalizedTextMap = Record<string, string | undefined | null>;

/** Keys that describe the text rather than being display text. */
const metadataKeys = new Set(["language", "translated", "original"]);

const baseLanguage = (value: string) =>
  value.trim().toLowerCase().split(/[-_]/)[0];

const clean = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : "";

/**
 * Resolve a localized API text map for the requested language.
 *
 * `translated` is used when the API did not echo a language or echoed one with the same
 * base language as requested. If it echoes a different language, the translation is not what
 * the visitor asked for, so we prefer `original` and keep it only as a last resort.
 * The `language` key is metadata and is never returned.
 */
export function localizedText(
  map: LocalizedTextMap | null | undefined,
  language: string,
): string {
  if (!map) return "";
  const requested = baseLanguage(language);
  const echoed = clean(map.language);
  const translated = clean(map.translated);
  if (translated && (!echoed || baseLanguage(echoed) === requested)) {
    return translated;
  }
  const keyed = (key: string) =>
    metadataKeys.has(key) ? "" : clean(map[key]);
  return (
    keyed(language) ||
    keyed(requested) ||
    keyed("en") ||
    clean(map.original) ||
    translated ||
    Object.entries(map).reduce(
      (found, [key, value]) =>
        found || (metadataKeys.has(key) ? "" : clean(value)),
      "",
    )
  );
}
