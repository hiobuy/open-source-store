import type { ProcurementAddress } from "@/lib/procurement/types";

/**
 * Address fields used by the display formatter. Keeping this as a Pick makes
 * the formatter reusable for saved addresses, shipment snapshots and legacy
 * address rows that expose the same fields.
 */
export type AddressLinesInput = Pick<
  ProcurementAddress,
  | "countryCode"
  | "countryName"
  | "state"
  | "city"
  | "district"
  | "postalCode"
  | "addressLine1"
  | "addressLine2"
>;

type AddressParts = {
  countryCode: string;
  countryName: string;
  state: string;
  city: string;
  district: string;
  postalCode: string;
  addressLine1: string;
  addressLine2: string;
};

type AddressFormatter = (parts: AddressParts) => string[];

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function baseLines(parts: AddressParts) {
  return [parts.addressLine1, parts.addressLine2, parts.district].filter(
    Boolean,
  );
}

function withCountry(lines: string[], parts: AddressParts) {
  const country = parts.countryName || parts.countryCode;
  if (country) lines.push(country.toUpperCase());
  return lines;
}

function cityStateText(city: string, state: string) {
  if (city && state) {
    return city.toLowerCase() === state.toLowerCase()
      ? city
      : `${city}, ${state}`;
  }
  return city || state;
}

/** e.g. US, CA, AU, PH: line1 / line2 / district / "City, ST 12345". */
function formatCityStatePostal(parts: AddressParts) {
  const lines = baseLines(parts);
  const cityLine = [cityStateText(parts.city, parts.state), parts.postalCode]
    .filter(Boolean)
    .join(" ");
  if (cityLine) lines.push(cityLine);
  return withCountry(lines, parts);
}

/** e.g. DE, FR, ES, MX: line1 / line2 / district / "12345 City" / state. */
function formatPostalCityState(parts: AddressParts) {
  const lines = baseLines(parts);
  const postalCity = [parts.postalCode, parts.city].filter(Boolean).join(" ");
  if (postalCity) lines.push(postalCity);
  if (parts.state && parts.state !== parts.city) lines.push(parts.state);
  return withCountry(lines, parts);
}

/** e.g. GB, IE, ZA, NG, IN, SG: city / state / postcode on separate lines. */
function formatCityStatePostcode(parts: AddressParts) {
  const lines = baseLines(parts);
  if (parts.city) lines.push(parts.city);
  if (parts.state && parts.state !== parts.city) lines.push(parts.state);
  if (parts.postalCode) lines.push(parts.postalCode);
  return withCountry(lines, parts);
}

/** Brazil convention: "City - ST" followed by the postcode line. */
function formatBrazil(parts: AddressParts) {
  const lines = baseLines(parts);
  const cityState = parts.city
    ? parts.state
      ? `${parts.city} - ${parts.state}`
      : parts.city
    : parts.state;
  if (cityState) lines.push(cityState);
  if (parts.postalCode) lines.push(parts.postalCode);
  return withCountry(lines, parts);
}

// Country-code -> formatter table. Add codes here when a country needs a more
// specific convention; everything else falls back to the city/state/postcode
// form used by most remaining countries.
const ADDRESS_FORMATTERS: Record<string, AddressFormatter> = Object.fromEntries(
  [
    ...[
      "US",
      "CA",
      "AU",
      "NZ",
      "PH",
      "PR",
      "GU",
      "VI",
      "AS",
      "MP",
      "JP",
      "KR",
      "CN",
      "TW",
      "HK",
      "MO",
    ].map((code) => [code, formatCityStatePostal]),
    ...[
      "DE",
      "AT",
      "CH",
      "FR",
      "BE",
      "NL",
      "LU",
      "IT",
      "ES",
      "PT",
      "PL",
      "CZ",
      "SK",
      "HU",
      "SE",
      "NO",
      "DK",
      "FI",
      "IS",
      "GR",
      "RO",
      "BG",
      "HR",
      "SI",
      "EE",
      "LV",
      "LT",
      "TR",
      "IL",
      "MX",
      "AR",
      "CL",
      "CO",
      "PE",
      "UY",
      "EC",
      "VE",
      "CR",
      "PA",
      "GT",
      "DO",
      "RU",
      "UA",
    ].map((code) => [code, formatPostalCityState]),
    ...[
      "GB",
      "IE",
      "ZA",
      "NG",
      "KE",
      "EG",
      "IN",
      "SG",
      "MY",
      "PK",
      "BD",
      "LK",
      "GH",
      "TZ",
      "UG",
    ].map((code) => [code, formatCityStatePostcode]),
    ["BR", formatBrazil],
  ],
);

/**
 * Format an address into display lines using the convention for its country.
 * Empty fields are omitted and the country always ends up on its own line.
 */
export function formatAddressLines(address: AddressLinesInput): string[] {
  const parts: AddressParts = {
    countryCode: clean(address.countryCode).toUpperCase(),
    countryName: clean(address.countryName),
    state: clean(address.state),
    city: clean(address.city),
    district: clean(address.district),
    postalCode: clean(address.postalCode),
    addressLine1: clean(address.addressLine1),
    addressLine2: clean(address.addressLine2),
  };
  const formatter =
    ADDRESS_FORMATTERS[parts.countryCode] ?? formatCityStatePostal;
  return formatter(parts);
}
