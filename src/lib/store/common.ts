"use client";

/**
 * Shared display currency, price formatting and customer counters.
 * Amounts are converted from CNY fen with the integer unitsPerCnyE8 rate.
 */
import {
  convertCnyFenToTargetMinor,
  convertTargetMinorToCnyFen,
  formatMinor,
} from "@/lib/currency";
import { create } from "zustand";

export interface CurrencyConfig {
  code: string;
  symbol: string;
  unitsPerCnyE8: number;
}

export interface CustomCurrency {
  code: string;
  unitsPerCnyE8: number;
}

export interface PriceConvertOptions {
  /** Whether the input is in minor units (fen/cents). */
  needFormat?: boolean;
  /** Show only the integer part when the converted amount is whole. */
  formatInt?: boolean;
  /** Whether to show a currency symbol/code. */
  showSymbol?: boolean;
  /** Use the symbol (¥) instead of the code (CNY). */
  useSymbol?: boolean;
  /** Override the store currency for this call. */
  customCurrency?: CustomCurrency | null;
  /** When zero/false, return e.g. "CNY 0.00". */
  needShow?: boolean;
}

/** Shipping/purchase counters and other customer-scoped values. */
export interface QtyInfo {
  daigou_order_sub?: Record<number, number>;
  [key: string]: unknown;
}

interface CommonState {
  currency: CurrencyConfig;
  qtyInfo: QtyInfo;
  unreadMessageCount: number;
  cartCount: number;
  user: Record<string, unknown> | null;
  setCurrency: (c: Partial<CurrencyConfig>) => void;
  saveCurrencyInfo: (config: CurrencyConfig) => void;
  initStorageData: () => void;
  resetCustomerState: () => void;
  priceConvert: (
    data: number | string | null | undefined,
    options?: PriceConvertOptions,
  ) => string;
  restoreCNYPrice: (
    data: number | string | null | undefined,
    options?: {
      needFormat?: boolean;
      customCurrency?: CustomCurrency | null;
    },
  ) => number;
}

const CURRENCY_STORAGE_KEY = "currency_info";
const CURRENCY_UNITS_SCALE = 100_000_000;
const DEFAULT_CURRENCY: CurrencyConfig = {
  code: "CNY",
  symbol: "¥",
  unitsPerCnyE8: CURRENCY_UNITS_SCALE,
};

export function isValidCurrencyConfig(value: unknown): value is CurrencyConfig {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === "string" &&
    /^[A-Z]{3}$/.test(candidate.code) &&
    typeof candidate.symbol === "string" &&
    Number.isSafeInteger(candidate.unitsPerCnyE8) &&
    Number(candidate.unitsPerCnyE8) > 0
  );
}

function tryParseJSON(str: string | null): unknown {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function safeParseNumber(input: number | string): number {
  if (typeof input === "number") return input;
  return Number.parseFloat(input.replace(/,/g, ""));
}

export const useCommonStore = create<CommonState>((set, get) => ({
  currency: DEFAULT_CURRENCY,
  qtyInfo: {},
  unreadMessageCount: 0,
  cartCount: 0,
  user: null,
  setCurrency: (c) =>
    set((s) => ({
      currency: { ...s.currency, ...c },
    })),
  saveCurrencyInfo: (config) => {
    set({ currency: config });
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(CURRENCY_STORAGE_KEY, JSON.stringify(config));
      } catch (e) {
        console.warn("saveCurrencyInfo: localStorage write failed", e);
      }
    }
  },
  initStorageData: () => {
    if (typeof window === "undefined") return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(CURRENCY_STORAGE_KEY);
    } catch {
      return;
    }
    const saved = tryParseJSON(stored);
    if (isValidCurrencyConfig(saved)) {
      set({ currency: saved });
      return;
    }
    if (stored !== null) {
      try {
        localStorage.removeItem(CURRENCY_STORAGE_KEY);
      } catch {}
    }
  },
  resetCustomerState: () => {
    set({ cartCount: 0, unreadMessageCount: 0, qtyInfo: {}, user: null });
  },
  priceConvert: (
    data,
    {
      needFormat = false,
      formatInt = false,
      showSymbol = true,
      useSymbol = false,
      customCurrency = null,
      needShow = false,
    } = {},
  ) => {
    const state = get();
    const currencyCode = customCurrency
      ? customCurrency.code
      : state.currency.code;
    const unitsPerCnyE8 = customCurrency
      ? customCurrency.unitsPerCnyE8
      : state.currency.unitsPerCnyE8;
    const effectiveSymbol =
      useSymbol && !customCurrency ? state.currency.symbol : currencyCode;
    const prefix = showSymbol ? `${effectiveSymbol} ` : "";
    if (!data) {
      return needShow ? `${prefix}0.00` : "0";
    }
    const parsed =
      typeof data === "string" ? Number.parseFloat(data) : Number(data);
    if (!Number.isFinite(parsed)) throw new Error("Invalid amount");

    const cnyFen = Math.round(needFormat ? parsed : parsed * 100);
    const targetMinor =
      currencyCode === "CNY" || unitsPerCnyE8 === CURRENCY_UNITS_SCALE
        ? cnyFen
        : convertCnyFenToTargetMinor(cnyFen, unitsPerCnyE8);
    const amount = targetMinor / 100;
    const fractionDigits = Number.isInteger(amount) && formatInt ? 0 : 2;
    return prefix + formatMinor(targetMinor, fractionDigits);
  },
  restoreCNYPrice: (
    data,
    { needFormat = false, customCurrency = null } = {},
  ) => {
    if (data === null || data === undefined) return 0;
    if (typeof data === "string" && !data.trim()) return 0;
    const parsed = safeParseNumber(data);
    if (Number.isNaN(parsed)) return 0;
    const state = get();
    const currencyCode = customCurrency
      ? customCurrency.code
      : state.currency.code;
    const unitsPerCnyE8 = customCurrency
      ? customCurrency.unitsPerCnyE8
      : state.currency.unitsPerCnyE8;
    const targetMinor = Math.round(needFormat ? parsed : parsed * 100);
    const cnyFen =
      currencyCode === "CNY" || unitsPerCnyE8 === CURRENCY_UNITS_SCALE
        ? targetMinor
        : convertTargetMinorToCnyFen(targetMinor, unitsPerCnyE8);
    return cnyFen / 100;
  },
}));

/** Convenience helper outside React. */
export function priceConvert(
  data: number | string | null | undefined,
  options?: PriceConvertOptions,
): string {
  return useCommonStore.getState().priceConvert(data, options);
}

export function getCurrencyCode(): string {
  return useCommonStore.getState().currency.code;
}

export function getCurrencySymbol(): string {
  return useCommonStore.getState().currency.symbol;
}

export function usePriceConvert() {
  useCommonStore((s) => s.currency);
  return useCommonStore((s) => s.priceConvert);
}

export function useCurrency() {
  const currency = useCommonStore((s) => s.currency);
  const setCurrency = useCommonStore((s) => s.setCurrency);
  const formatPrice = useCommonStore((s) => s.priceConvert);
  return {
    currency,
    setCurrency,
    formatPrice,
    symbol: currency.symbol,
    code: currency.code,
    unitsPerCnyE8: currency.unitsPerCnyE8,
  };
}
