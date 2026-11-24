/**
 * 运费估算组件
 * 运费估算组件: 估算运费并列出可用线路
 */
"use client";
import { useTranslations } from "next-intl";
import { ResponsiveContentFrame } from "@/components/layout/responsive-content-frame";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useIsMobile } from "@/hooks/use-mobile";
import { getErrorMessage } from "@/lib/error-message";
import {
  estimateShipping,
  getShippingCalculatorOptions,
} from "@/lib/procurement/client";
import type {
  ProcurementCalculatorAttribute,
  ProcurementCalculatorCountry,
  ProcurementCalculatorOptions,
  ProcurementShippingEstimate,
  ProcurementShippingEstimateRequest,
} from "@/lib/procurement/types";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
import Link from "next/link";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
/** 默认英文文案（Puck 可逐项覆盖，与 Recharge / EstimationDetails 一致） */
const INDEX_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
/** Hot countries section: API field `hot` === 1 */
const HOT_SECTION_KEY = "HOT";
/** PC country picker: 3-letter tabs (X grouped under VWY) */
const PC_COUNTRY_LETTER_GROUPS: {
  key: string;
  letters: string[];
}[] = [
  { key: "ABC", letters: ["A", "B", "C"] },
  { key: "DEF", letters: ["D", "E", "F"] },
  { key: "GHI", letters: ["G", "H", "I"] },
  { key: "JKL", letters: ["J", "K", "L"] },
  { key: "MNO", letters: ["M", "N", "O"] },
  { key: "PQR", letters: ["P", "Q", "R"] },
  { key: "STU", letters: ["S", "T", "U"] },
  { key: "VWY", letters: ["V", "W", "X", "Y"] },
  { key: "Z", letters: ["Z"] },
];
type CountryRow = {
  raw: ProcurementCalculatorCountry;
  value: string;
  displayName: string;
  letter: string;
  flagUrl?: string;
  searchLower: string;
};
function getCountrySortLetter(c: ProcurementCalculatorCountry): string {
  const name = c.name.trim();
  if (name.length) {
    const first = name[0].toUpperCase();
    if (first >= "A" && first <= "Z") return first;
  }
  const code = c.code.trim();
  return code.length > 0 ? code[0].toUpperCase() : "#";
}
function getCountryFlagUrl(
  c: ProcurementCalculatorCountry,
): string | undefined {
  let iso = c.code.trim().toLowerCase().slice(0, 2);
  if (!/^[a-z]{2}$/.test(iso)) return undefined;
  if (iso === "tw") iso = "cn";
  return `https://flagcdn.com/w80/${iso}.png`;
}
function getCountryEnName(raw: ProcurementCalculatorCountry): string {
  return raw.name.trim() || raw.code.trim();
}
function buildCountryRow(c: ProcurementCalculatorCountry): CountryRow | null {
  const value = c.code.trim();
  if (!value) return null;
  const displayName = c.name.trim() || value;
  const searchLower = `${displayName} ${value}`.toLowerCase();
  return {
    raw: c,
    value,
    displayName,
    letter: getCountrySortLetter(c),
    flagUrl: getCountryFlagUrl(c),
    searchLower,
  };
}

function parsePositiveNumber(value: string, maximum: number): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= maximum
    ? parsed
    : null;
}

function formatUsdFen(value: number): string {
  return `USD ${(value / 100).toFixed(2)}`;
}

const BORDERLESS_CONTROL_CLASS =
  "h-auto min-h-[28px] w-full border-0 bg-transparent p-0 text-sm font-normal text-[#333333] shadow-none focus:outline-none focus:ring-0 placeholder:text-gray-400";
function SortSolidTriangles({ value }: { value: "price-low" | "price-high" }) {
  return (
    <span className="flex flex-col items-center gap-[3px]" aria-hidden>
      <svg viewBox="0 0 10 6" className="h-1.5 w-2.5">
        <polygon
          points="5,0 10,6 0,6"
          className={value === "price-low" ? "fill-primary" : "fill-[#9CA3AF]"}
        />
      </svg>
      <svg viewBox="0 0 10 6" className="h-1.5 w-2.5">
        <polygon
          points="0,0 10,0 5,6"
          className={value === "price-high" ? "fill-primary" : "fill-[#9CA3AF]"}
        />
      </svg>
    </span>
  );
}
function PriceSortControl({
  value,
  onChange,
  label,
  lowLabel,
  highLabel,
}: {
  value: "price-low" | "price-high";
  onChange: (value: "price-low" | "price-high") => void;
  label: string;
  lowLabel: string;
  highLabel: string;
}) {
  const toggle = () =>
    onChange(value === "price-low" ? "price-high" : "price-low");
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={value === "price-low" ? lowLabel : highLabel}
      className="inline-flex w-fit shrink-0 cursor-pointer items-center gap-2 self-start rounded-[8px] border border-[#E2E4F0] bg-white px-3 py-1.5 text-start transition-colors hover:bg-gray-50"
    >
      <span className="text-sm font-normal text-[#333333]">{label}</span>
      <SortSolidTriangles value={value} />
    </button>
  );
}
function FormInlineField({
  label,
  required = false,
  active = false,
  className,
  children,
}: {
  label: React.ReactNode;
  required?: boolean;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-[8px] border border-[#E2E4F0] bg-white px-3",
        active && "border-primary ring-primary/20 ring-2",
        className,
      )}
    >
      <div className="max-w-[46%] shrink-0 text-xs leading-tight font-medium text-[#333333] sm:max-w-none sm:text-sm">
        {required ? <span className="text-red-500">*</span> : null}
        {required ? " " : null}
        {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
function DimensionInlineField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-h-11 min-w-0 items-center gap-1 overflow-hidden rounded-[8px] border border-[#E2E4F0] bg-white px-2 py-1.5 sm:gap-1.5 sm:px-2.5">
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#333333] sm:text-sm">
        {label}
      </span>
      <div className="flex shrink-0 items-center">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          max="10000"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className={cn(
            BORDERLESS_CONTROL_CLASS,
            "w-6 min-w-0 text-end text-xs sm:w-8 sm:text-sm",
          )}
        />
        <span className="shrink-0 text-xs text-gray-400 sm:text-sm">cm</span>
      </div>
    </div>
  );
}
function EstimationFaqSection({
  t,
  isMobile,
  hasQueried,
}: {
  t: ReturnType<typeof useTranslations>;
  isMobile: boolean;
  hasQueried: boolean;
}) {
  const compact = isMobile || hasQueried;
  const faqItems = useMemo(
    () => [
      {
        title: t(
          "What are '1st Weight Unit' and weight measured after the '1st Weight Unit'?",
        ),
        content: t(
          "1st Weight Unit is the minimum weight that parcel will be charged for Parcel within the first weight unit will be charged as the first weight unit Any weight over the first weight unit will be charged as the weight measured after the 1st Weight Unit",
        ),
      },
      {
        title: t("Embargo clause :"),
        content: t(
          "Shipping Cost Estimation Module is an intelligent and flexible shipping calculation engine, providing users with accurate and real-time shipping cost calculation services The estimated freight displayed is for reference only; the final shipping fee is subject to the actual weight and dimensions after warehouse packing Please note that parcels containing prohibited or restricted items may not be shipped through certain lines Prohibited or restricted items include but are not limited to: tobacco, alcohol, drugs and contraband, weapons and ammunition, explosives, flammable and corrosive materials, live animals and plants, perishable goods without proper packaging, cash and negotiable securities, items that infringe intellectual property rights, and other goods restricted by carriers or destination country laws If your parcel contains restricted goods, available shipping routes may be limited or unavailable You are responsible for ensuring your shipment complies with applicable laws and regulations",
        ),
      },
    ],
    [t],
  );
  const [openItems, setOpenItems] = useState<boolean[]>(() =>
    faqItems.map(() => !compact),
  );
  const faqKey = JSON.stringify([compact, faqItems]);
  const [previousFaqKey, setPreviousFaqKey] = useState(faqKey);
  if (previousFaqKey !== faqKey) {
    setPreviousFaqKey(faqKey);
    setOpenItems(faqItems.map(() => !compact));
  }
  const toggleItem = (index: number) => {
    setOpenItems((prev) => prev.map((open, i) => (i === index ? !open : open)));
  };
  if (!faqItems.some((item) => item.title.trim() || item.content.trim())) {
    return null;
  }
  return (
    <div
      className={cn(
        compact &&
          "rounded-xl border border-[#F1F5F9] bg-white p-4 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]",
      )}
    >
      <h4
        className={cn(
          "font-bold text-[#333333]",
          compact
            ? "mb-3 text-start text-base"
            : "mb-3 text-center text-xl md:mb-4 md:text-2xl",
        )}
      >
        {t("FAQ")}
      </h4>
      <div className={cn(compact ? "space-y-2" : "space-y-3")}>
        {faqItems.map((item, index) => {
          const isOpen = openItems[index];
          const hasContent = !!item.content.trim();
          return (
            <div
              key={`${item.title}-${index}`}
              className={cn(
                !compact && "rounded-[8px] bg-[#F5F5F5] px-3 py-3 md:px-4",
              )}
            >
              <button
                type="button"
                onClick={() => toggleItem(index)}
                className="flex w-full items-start gap-2 text-start"
                aria-expanded={isOpen}
              >
                <ChevronDown
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0 text-[#999999] transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 leading-snug",
                    compact
                      ? "truncate text-sm font-normal text-[#333333]"
                      : "text-sm font-bold text-[#333333] md:text-base",
                    isOpen && compact && "whitespace-normal",
                  )}
                >
                  {item.title}
                </span>
              </button>
              {isOpen && hasContent && (
                <p className="mt-2 ps-6 text-xs leading-relaxed whitespace-pre-line text-[#666666] md:text-sm">
                  {item.content}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PageClient() {
  const t = useTranslations();
  const isMobile = useIsMobile();
  const [selectedCountryKey, setSelectedCountryKey] = useState<string | null>(
    null,
  );
  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [propOptions, setPropOptions] = useState<
    ProcurementCalculatorAttribute[]
  >([]);
  const [selectedAttributeCode, setSelectedAttributeCode] = useState<
    string | null
  >(null);
  const [loadingProps, setLoadingProps] = useState(true);
  const [isPropSheetOpen, setIsPropSheetOpen] = useState(false);
  const [isPropDropdownOpen, setIsPropDropdownOpen] = useState(false);
  const propPickerContainerRef = useRef<HTMLDivElement>(null);

  const [options, setOptions] = useState<ProcurementCalculatorOptions | null>(
    null,
  );
  const [optionsError, setOptionsError] = useState(false);
  const [estimate, setEstimate] = useState<ProcurementShippingEstimate | null>(
    null,
  );
  const [submittedCountryCode, setSubmittedCountryCode] = useState("");
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [hasQueried, setHasQueried] = useState(false);
  const [queryFailed, setQueryFailed] = useState(false);
  const [sortBy, setSortBy] = useState<"price-low" | "price-high">("price-low");

  const [countries, setCountries] = useState<ProcurementCalculatorCountry[]>(
    [],
  );
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [isCountrySheetOpen, setIsCountrySheetOpen] = useState(false);
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [activePcCountryTab, setActivePcCountryTab] =
    useState<string>(HOT_SECTION_KEY);
  const [countrySearchQuery, setCountrySearchQuery] = useState("");
  const [activeCountryIndexLetter, setActiveCountryIndexLetter] = useState("A");
  const countryListScrollRef = useRef<HTMLDivElement>(null);
  const countrySectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const countryPickerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    getShippingCalculatorOptions()
      .then((next) => {
        if (!active) return;
        const byCode = new Map<string, ProcurementCalculatorCountry>();
        for (const country of next.countries ?? []) {
          const code = country.code.trim();
          if (code && !byCode.has(code)) byCode.set(code, { ...country, code });
        }
        const deduped = Array.from(byCode.values());
        const attributesByCode = new Map<
          string,
          ProcurementCalculatorAttribute
        >();
        for (const attribute of next.attributes ?? []) {
          const code = attribute.code.trim();
          if (code && !attributesByCode.has(code)) {
            attributesByCode.set(code, { ...attribute, code });
          }
        }
        setOptions(next);
        setOptionsError(false);
        setCountries(deduped);
        setPropOptions(Array.from(attributesByCode.values()));
        setSelectedCountryKey((prev) => {
          if (prev && deduped.some((country) => country.code === prev)) {
            return prev;
          }
          return deduped[0]?.code ?? null;
        });
      })
      .catch(() => {
        if (!active) return;
        setOptions(null);
        setOptionsError(true);
        setCountries([]);
        setPropOptions([]);
      })
      .finally(() => {
        if (active) {
          setLoadingCountries(false);
          setLoadingProps(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const optionsReady = Boolean(
    options && (options.connected || options.demo === true),
  );
  const canInquire =
    optionsReady && countries.length > 0 && propOptions.length > 0;
  const optionsNotice = optionsError
    ? t("The service is temporarily unavailable Please try again")
    : options?.message?.trim() ||
      (!loadingCountries && options && !optionsReady
        ? t("The service is temporarily unavailable Please try again")
        : !loadingCountries && options && !canInquire
          ? t("No options available")
          : "");

  const handlePropSelect = (attributeCode: string) => {
    setSelectedAttributeCode((prev) =>
      prev === attributeCode ? null : attributeCode,
    );
  };
  const selectedPropName =
    selectedAttributeCode != null
      ? (propOptions.find((item) => item.code === selectedAttributeCode)
          ?.name ?? "")
      : "";
  const handleReset = () => {
    setWeight("");
    setLength("");
    setWidth("");
    setHeight("");
    setSelectedAttributeCode(null);
  };

  const handleInquire = async () => {
    if (loadingQuery || !canInquire) return;
    if (!selectedCountryKey) {
      toast.error(t("Please select a destination country"));
      return;
    }
    const selectedCountry = countries.find(
      (country) => country.code === selectedCountryKey,
    );
    if (!selectedCountry) {
      toast.error(t("Please select a destination country"));
      return;
    }
    if (!selectedAttributeCode) {
      toast.error(t("Select product type"));
      return;
    }
    const attribute = propOptions.find(
      (item) => item.code === selectedAttributeCode,
    );
    if (!attribute) {
      toast.error(t("Select product type"));
      return;
    }
    const weightKg = parsePositiveNumber(weight, 100000);
    if (weightKg === null) {
      toast.error(t("Please enter a valid weight"));
      return;
    }

    const dimensionInputs = [length, width, height].map((value) =>
      value.trim(),
    );
    const filledDimensions = dimensionInputs.filter(Boolean).length;
    if (filledDimensions !== 0 && filledDimensions !== 3) {
      toast.error(t("Please enter all three dimensions or leave them empty"));
      return;
    }
    let dimensionValues: Pick<
      ProcurementShippingEstimateRequest,
      "lengthCm" | "widthCm" | "heightCm"
    > = {};
    if (filledDimensions === 3) {
      const [lengthCm, widthCm, heightCm] = dimensionInputs.map((value) =>
        parsePositiveNumber(value, 10000),
      );
      if (lengthCm === null || widthCm === null || heightCm === null) {
        toast.error(t("Please enter valid dimensions"));
        return;
      }
      dimensionValues = { lengthCm, widthCm, heightCm };
    }

    setSubmittedCountryCode(selectedCountry.code);
    setEstimate(null);
    setQueryFailed(false);
    setHasQueried(false);
    setLoadingQuery(true);
    try {
      const result = await estimateShipping({
        countryCode: selectedCountry.code,
        attribute: attribute.code,
        weightKg,
        ...dimensionValues,
      });
      setEstimate(result);
      if (result.quotes.length > 0) toast.success(t("Query successful"));
      else toast.info(t("No shipping routes available"));
    } catch (error) {
      setQueryFailed(true);
      toast.error(
        getErrorMessage(error) ||
          t("The service is temporarily unavailable Please try again"),
      );
    } finally {
      setLoadingQuery(false);
      setHasQueried(true);
    }
  };

  const sortedQuotes = useMemo(() => {
    const quotes = estimate?.quotes ?? [];
    return [...quotes].sort((a, b) =>
      sortBy === "price-low"
        ? a.priceUsdFen - b.priceUsdFen
        : b.priceUsdFen - a.priceUsdFen,
    );
  }, [estimate, sortBy]);
  const countryRows = useMemo(() => {
    return countries
      .map(buildCountryRow)
      .filter((r): r is CountryRow => r !== null);
  }, [countries]);
  const filteredCountryRows = useMemo(() => {
    const q = countrySearchQuery.trim().toLowerCase();
    if (!q) return countryRows;
    return countryRows.filter((r) => r.searchLower.includes(q));
  }, [countryRows, countrySearchQuery]);
  const hotCountryRows = useMemo<CountryRow[]>(() => [], []);
  const letterOnlyCountryRows = filteredCountryRows;
  const countriesGroupedByLetter = useMemo(() => {
    const map: Record<string, CountryRow[]> = {};
    letterOnlyCountryRows.forEach((row) => {
      const L = row.letter;
      if (!map[L]) map[L] = [];
      map[L].push(row);
    });
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => a.displayName.localeCompare(b.displayName, "en"));
    });
    return map;
  }, [letterOnlyCountryRows]);
  const sectionLetters = useMemo(() => {
    const keys = Object.keys(countriesGroupedByLetter);
    const sorted = keys.filter((k) => k !== "#").sort();
    if (keys.includes("#")) sorted.push("#");
    if (hotCountryRows.length > 0) {
      return [HOT_SECTION_KEY, ...sorted];
    }
    return sorted;
  }, [countriesGroupedByLetter, hotCountryRows.length]);
  const destinationDisplayName = useMemo(() => {
    if (!selectedCountryKey) return "";
    const row = countryRows.find((r) => r.value === selectedCountryKey);
    return row?.displayName || "";
  }, [selectedCountryKey, countryRows]);
  /** Index bar: leading Hot jumps to HOT section */
  const indexLettersForBar = useMemo(() => {
    const tail = [
      ...INDEX_LETTERS,
      ...(countriesGroupedByLetter["#"]?.length ? ["#"] : []),
    ];
    if (hotCountryRows.length > 0) return [t("Hot"), ...tail];
    return tail;
  }, [countriesGroupedByLetter, hotCountryRows.length, t]);
  const pcCountryTabs = useMemo(() => {
    const tabs: {
      key: string;
      label: string;
      letters: string[];
    }[] = [];
    if (hotCountryRows.length > 0) {
      tabs.push({ key: HOT_SECTION_KEY, label: "HOT", letters: [] });
    }
    for (const group of PC_COUNTRY_LETTER_GROUPS) {
      if (
        letterOnlyCountryRows.some((row) => group.letters.includes(row.letter))
      ) {
        tabs.push({ key: group.key, label: group.key, letters: group.letters });
      }
    }
    return tabs;
  }, [hotCountryRows.length, letterOnlyCountryRows]);
  const defaultPcCountryTab = pcCountryTabs[0]?.key ?? HOT_SECTION_KEY;
  const pcDisplayedCountryRows = useMemo(() => {
    const q = countrySearchQuery.trim();
    if (q) {
      return [...filteredCountryRows].sort((a, b) =>
        getCountryEnName(a.raw).localeCompare(getCountryEnName(b.raw), "en"),
      );
    }
    if (activePcCountryTab === HOT_SECTION_KEY) return hotCountryRows;
    const group = PC_COUNTRY_LETTER_GROUPS.find(
      (g) => g.key === activePcCountryTab,
    );
    if (!group) return [];
    return letterOnlyCountryRows.filter((r) =>
      group.letters.includes(r.letter),
    );
  }, [
    countrySearchQuery,
    filteredCountryRows,
    activePcCountryTab,
    hotCountryRows,
    letterOnlyCountryRows,
  ]);
  const handleCountryListScroll = useCallback(() => {
    const container = countryListScrollRef.current;
    if (!container || sectionLetters.length === 0) return;
    const anchor = container.getBoundingClientRect().top + 56;
    let active = sectionLetters[0];
    for (const letter of sectionLetters) {
      const el = countrySectionRefs.current[letter];
      if (!el) continue;
      const top = el.getBoundingClientRect().top;
      if (top <= anchor) active = letter;
    }
    setActiveCountryIndexLetter(active);
  }, [sectionLetters]);
  const scrollCountryToLetter = useCallback(
    (sectionKey: string) => {
      if (sectionKey === HOT_SECTION_KEY) {
        if (!hotCountryRows.length) return;
      } else if (!countriesGroupedByLetter[sectionKey]?.length) {
        return;
      }
      const el = countrySectionRefs.current[sectionKey];
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveCountryIndexLetter(sectionKey);
    },
    [countriesGroupedByLetter, hotCountryRows.length],
  );
  useEffect(() => {
    if (!isCountrySheetOpen) return;
    const t = window.setTimeout(() => handleCountryListScroll(), 80);
    return () => window.clearTimeout(t);
  }, [
    isCountrySheetOpen,
    sectionLetters,
    handleCountryListScroll,
    filteredCountryRows.length,
  ]);
  const onCountrySheetOpenChange = (open: boolean) => {
    setIsCountrySheetOpen(open);
    if (!open) setCountrySearchQuery("");
  };
  const onCountryDropdownOpenChange = (open: boolean) => {
    setIsCountryDropdownOpen(open);
    if (!open) setCountrySearchQuery("");
  };
  const openCountryPicker = () => {
    if (loadingCountries) return;
    if (isMobile) {
      setIsCountrySheetOpen(true);
      return;
    }
    setActivePcCountryTab(defaultPcCountryTab);
    setIsCountryDropdownOpen(true);
  };
  const selectCountry = (value: string) => {
    setSelectedCountryKey(value);
    if (isMobile) {
      onCountrySheetOpenChange(false);
    } else {
      onCountryDropdownOpenChange(false);
    }
  };
  useEffect(() => {
    if (!isCountryDropdownOpen || isMobile) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (
        countryPickerContainerRef.current &&
        !countryPickerContainerRef.current.contains(event.target as Node)
      ) {
        onCountryDropdownOpenChange(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isCountryDropdownOpen, isMobile]);
  const onPropSheetOpenChange = (open: boolean) => {
    setIsPropSheetOpen(open);
  };
  const onPropDropdownOpenChange = (open: boolean) => {
    setIsPropDropdownOpen(open);
  };
  const openPropPicker = () => {
    if (isMobile) {
      setIsPropSheetOpen(true);
      return;
    }
    setIsPropDropdownOpen(true);
  };
  const selectPropOption = (attributeCode: string) => {
    handlePropSelect(attributeCode);
    if (!isMobile) {
      onPropDropdownOpenChange(false);
    }
  };
  useEffect(() => {
    if (!isPropDropdownOpen || isMobile) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (
        propPickerContainerRef.current &&
        !propPickerContainerRef.current.contains(event.target as Node)
      ) {
        onPropDropdownOpenChange(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isPropDropdownOpen, isMobile]);
  return (
    <ResponsiveContentFrame>
      {
        <div className="pt-2 md:pt-6">
          <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
            {/* Results Panel — DOM first for PC left column; order swaps on mobile */}
            {hasQueried && (
              <div className="order-2 mb-4 lg:order-1 lg:col-span-2 lg:mb-0">
                <div className="mb-4 flex flex-col items-start gap-2 md:flex-row md:items-center md:justify-between md:gap-0">
                  <div className="flex items-center gap-1 md:gap-2">
                    <h3 className="text-[20px] font-bold text-[#333333]">
                      {t("Available Lines")}
                    </h3>
                    <span className="text-[14px] font-normal text-[#666666]">
                      {t("({count} Results found)", {
                        count: estimate?.quotes.length ?? 0,
                      })}
                    </span>
                  </div>
                  <PriceSortControl
                    value={sortBy}
                    onChange={setSortBy}
                    label={t("Sort by Price")}
                    lowLabel={t("Price: Low to High")}
                    highLabel={t("Price: High to Low")}
                  />
                </div>

                {queryFailed ? (
                  <div className="rounded-xl border border-[#E2E4F0] bg-white p-4 text-sm text-[#666666]">
                    {t(
                      "The service is temporarily unavailable Please try again",
                    )}
                  </div>
                ) : sortedQuotes.length === 0 ? (
                  <div className="rounded-xl border border-[#E2E4F0] bg-white p-4 text-sm text-[#666666]">
                    {t("No shipping routes available")}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sortedQuotes.map((quote, index) => (
                      <div
                        key={`${quote.code}-${index}`}
                        className="rounded-xl border border-[#D1D5DB] bg-white p-3 md:p-4"
                      >
                        {/* Mobile Layout */}
                        <div className="flex flex-col md:hidden">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-base font-bold text-[#333333]">
                                  {quote.name}
                                </h4>
                                {quote.partial ? (
                                  <span className="border-primary text-primary inline-flex items-center rounded-[4px] border px-2 py-0.5 text-xs font-medium">
                                    {t("Partial")}
                                  </span>
                                ) : null}
                              </div>
                              {quote.description ? (
                                <p className="mt-1 text-xs leading-relaxed whitespace-pre-line text-[#666666]">
                                  {quote.description}
                                </p>
                              ) : null}
                            </div>
                            <Link
                              href={`/estimation-details?code=${encodeURIComponent(quote.code)}&country=${encodeURIComponent(submittedCountryCode)}`}
                              className="flex shrink-0 items-center gap-0.5 text-xs font-normal text-[#666666]"
                            >
                              {t("See Details")}
                              <ChevronRight className="h-4 w-4" />
                            </Link>
                          </div>

                          <div className="-mx-3 my-3 h-px bg-[#F3F4F6] md:mx-0" />

                          <div className="space-y-3">
                            <div className="grid grid-cols-2 items-start gap-4">
                              <div className="min-w-0">
                                <div className="mb-1 text-xs text-[#666666]">
                                  {t("Price")}
                                </div>
                                <div className="text-primary text-sm font-bold">
                                  <bdi dir="ltr">
                                    {formatUsdFen(quote.priceUsdFen)}
                                  </bdi>
                                </div>
                              </div>
                              {quote.eta ? (
                                <div className="min-w-0 text-end">
                                  <div className="mb-1 text-xs text-[#666666]">
                                    {t("Delivery Time")}
                                  </div>
                                  <div className="text-sm font-bold text-[#333333]">
                                    {quote.eta}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                            {quote.note ? (
                              <p className="mt-3 text-[10px] leading-relaxed whitespace-pre-line text-[#9CA3AF]">
                                {quote.note}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        {/* PC Layout */}
                        <div className="hidden md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-start md:gap-4 lg:gap-6">
                          <div className="flex min-w-0 flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-base font-bold text-[#333333]">
                                {quote.name}
                              </h4>
                              {quote.partial ? (
                                <span className="border-primary text-primary inline-flex items-center rounded-[4px] border px-2 py-0.5 text-xs font-medium">
                                  {t("Partial")}
                                </span>
                              ) : null}
                            </div>
                            {quote.description ? (
                              <p className="text-xs leading-relaxed whitespace-pre-line text-[#666666]">
                                {quote.description}
                              </p>
                            ) : null}
                            {quote.note ? (
                              <p className="text-xs leading-relaxed whitespace-pre-line text-[#666666]">
                                {quote.note}
                              </p>
                            ) : null}
                          </div>

                          <div className="min-w-0">
                            <div className="mb-1 text-xs text-[#666666]">
                              {t("Price")}
                            </div>
                            <div className="text-primary text-xs font-medium">
                              <bdi dir="ltr">
                                {formatUsdFen(quote.priceUsdFen)}
                              </bdi>
                            </div>
                          </div>

                          <div className="min-w-0">
                            {quote.eta ? (
                              <>
                                <div className="mb-1 text-xs text-[#666666]">
                                  {t("Delivery Time")}
                                </div>
                                <div className="text-sm font-bold text-[#333333]">
                                  {quote.eta}
                                </div>
                              </>
                            ) : null}
                          </div>

                          <div className="flex justify-end self-start">
                            <Link
                              href={`/estimation-details?code=${encodeURIComponent(quote.code)}&country=${encodeURIComponent(submittedCountryCode)}`}
                              className="rounded-[8px] border border-[#333333] bg-white px-4 py-2 text-sm font-normal text-[#333333] transition-colors hover:bg-gray-50"
                            >
                              {t("Details")}
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!queryFailed && estimate?.disclaimer?.trim() ? (
                  <p className="mt-4 text-xs leading-relaxed whitespace-pre-line text-[#666666]">
                    {estimate.disclaimer}
                  </p>
                ) : null}
              </div>
            )}

            {/* Form Panel — DOM second for PC right column; order swaps on mobile */}
            <div
              className={cn(
                hasQueried
                  ? "order-1 lg:order-2 lg:col-span-1"
                  : "lg:col-span-3",
              )}
            >
              <div className="space-y-4">
                <div className="rounded-xl border border-[#F1F5F9] bg-white p-4 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]">
                  <h3 className="mb-4 text-center text-2xl font-medium text-[#333333]">
                    {t("Shipping Estimation")}
                  </h3>

                  <div className="space-y-4">
                    {optionsNotice ? (
                      <p
                        className="rounded-[8px] bg-[#F8FAFC] px-3 py-2 text-sm text-[#666666]"
                        role={optionsError ? "alert" : undefined}
                      >
                        {optionsNotice}
                      </p>
                    ) : null}

                    <div
                      className={cn(
                        "grid grid-cols-1 gap-4",
                        !hasQueried && "md:grid-cols-2",
                      )}
                    >
                      {/* Delivery Area */}
                      <div className="relative" ref={countryPickerContainerRef}>
                        <FormInlineField
                          label={t("Delivery Area")}
                          required
                          active={!isMobile && isCountryDropdownOpen}
                        >
                          <button
                            type="button"
                            onClick={openCountryPicker}
                            disabled={loadingCountries}
                            className="flex w-full items-center justify-end gap-2 border-0 bg-transparent p-0 text-sm font-normal disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <span
                              className={cn(
                                "min-w-0 truncate text-end",
                                !destinationDisplayName
                                  ? "text-gray-400"
                                  : "text-[#333333]",
                              )}
                            >
                              {loadingCountries
                                ? t("Loading")
                                : destinationDisplayName ||
                                  t("Select destination")}
                            </span>
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 shrink-0 text-gray-400 transition-transform",
                                !isMobile &&
                                  isCountryDropdownOpen &&
                                  "rotate-180",
                              )}
                            />
                          </button>
                        </FormInlineField>

                        {/* PC: inline country picker */}
                        {!isMobile && isCountryDropdownOpen && (
                          <div className="absolute start-0 end-0 top-full z-50 mt-1 overflow-hidden rounded-[8px] border border-[#E2E4F0] bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.08)]">
                            <div className="border-b border-[#F1F5F9] px-4 py-3">
                              <div className="relative">
                                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <input
                                  type="search"
                                  value={countrySearchQuery}
                                  onChange={(e) =>
                                    setCountrySearchQuery(e.target.value)
                                  }
                                  placeholder={t("Select destination")}
                                  className="focus:border-primary focus:ring-primary/20 h-10 w-full rounded-[8px] border border-[#E2E4F0] bg-white py-2 ps-9 pe-3 text-sm text-[#333333] placeholder:text-gray-400 focus:ring-2 focus:outline-none"
                                />
                              </div>
                            </div>

                            {!countrySearchQuery.trim() && (
                              <div className="flex items-center gap-5 overflow-x-auto border-b border-[#F1F5F9] px-4">
                                {pcCountryTabs.map((tab) => (
                                  <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() =>
                                      setActivePcCountryTab(tab.key)
                                    }
                                    className={cn(
                                      "shrink-0 border-b-2 py-3 text-sm font-medium uppercase transition-colors",
                                      activePcCountryTab === tab.key
                                        ? "border-primary text-primary"
                                        : "border-transparent text-[#666666] hover:text-[#333333]",
                                    )}
                                  >
                                    {tab.label}
                                  </button>
                                ))}
                              </div>
                            )}

                            <div className="max-h-80 overflow-y-auto overscroll-contain p-3">
                              {loadingCountries ? (
                                <div className="py-8 text-center text-sm text-gray-500">
                                  {t("Loading")}
                                </div>
                              ) : pcDisplayedCountryRows.length === 0 ? (
                                <div className="py-8 text-center text-sm text-gray-500">
                                  {t("No matching countries")}
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                                  {pcDisplayedCountryRows.map((row) => {
                                    const isSelected =
                                      selectedCountryKey === row.value;
                                    const enName =
                                      getCountryEnName(row.raw) ||
                                      row.displayName;
                                    return (
                                      <button
                                        key={row.value}
                                        type="button"
                                        onClick={() => selectCountry(row.value)}
                                        className={cn(
                                          "flex min-w-0 items-center gap-2 rounded-[6px] px-2 py-2.5 text-start transition-colors hover:bg-gray-50",
                                          isSelected && "bg-primary/5",
                                        )}
                                      >
                                        <div className="flex h-5 w-7 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-gray-100">
                                          {row.flagUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                              src={row.flagUrl}
                                              alt=""
                                              className="h-full w-full object-cover"
                                            />
                                          ) : (
                                            <span className="text-[10px] font-medium text-gray-500">
                                              {enName.slice(0, 1)}
                                            </span>
                                          )}
                                        </div>
                                        <span
                                          className={cn(
                                            "min-w-0 truncate text-sm",
                                            isSelected
                                              ? "text-primary font-medium"
                                              : "text-[#333333]",
                                          )}
                                        >
                                          <span>{enName}</span>
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Mobile: bottom sheet */}
                        <Sheet
                          open={isMobile && isCountrySheetOpen}
                          onOpenChange={onCountrySheetOpenChange}
                        >
                          <SheetContent
                            side="bottom"
                            className="flex h-[85dvh] max-h-[85vh] flex-col gap-0 rounded-t-[20px] p-0 [&>button]:hidden"
                          >
                            <div className="relative flex h-12 shrink-0 items-center justify-center border-b border-gray-200 px-4">
                              <button
                                type="button"
                                onClick={() => onCountrySheetOpenChange(false)}
                                className="absolute start-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full hover:bg-gray-100"
                                aria-label={t("Back")}
                              >
                                <ArrowLeft className="h-5 w-5 text-[#333333]" />
                              </button>
                              <SheetTitle className="text-base font-semibold text-[#333333]">
                                {t("Country")}
                              </SheetTitle>
                              <SheetDescription className="sr-only">
                                {t("Select destination country")}
                              </SheetDescription>
                            </div>

                            <div className="shrink-0 px-4 pt-3 pb-3">
                              <div className="relative">
                                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <input
                                  type="search"
                                  value={countrySearchQuery}
                                  onChange={(e) =>
                                    setCountrySearchQuery(e.target.value)
                                  }
                                  placeholder={t("Search by country name")}
                                  className="focus:border-primary focus:ring-primary/15 h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] py-2 ps-9 pe-3 text-sm text-[#333333] placeholder:text-gray-400 focus:ring-2 focus:outline-none"
                                />
                              </div>
                            </div>

                            <div className="flex min-h-0 flex-1">
                              <div
                                ref={countryListScrollRef}
                                onScroll={handleCountryListScroll}
                                className="min-w-0 flex-1 overflow-y-auto overscroll-contain"
                              >
                                {loadingCountries ? (
                                  <div className="py-8 text-center text-sm text-gray-500">
                                    {t("Loading")}
                                  </div>
                                ) : sectionLetters.length === 0 ? (
                                  <div className="py-8 text-center text-sm text-gray-500">
                                    {t("No matching countries")}
                                  </div>
                                ) : (
                                  sectionLetters.map((sectionKey) => {
                                    const isHotSection =
                                      sectionKey === HOT_SECTION_KEY;
                                    const sectionTitle = isHotSection
                                      ? t("Hot")
                                      : sectionKey;
                                    const rows = isHotSection
                                      ? hotCountryRows
                                      : (countriesGroupedByLetter[sectionKey] ??
                                        []);
                                    return (
                                      <div
                                        key={sectionKey}
                                        ref={(node) => {
                                          countrySectionRefs.current[
                                            sectionKey
                                          ] = node;
                                        }}
                                      >
                                        <div className="bg-[#F5F5F5] px-4 py-2 text-sm font-bold text-[#333333]">
                                          {sectionTitle}
                                        </div>
                                        {rows.map((row) => {
                                          const isSelected =
                                            selectedCountryKey === row.value;
                                          return (
                                            <button
                                              key={row.value}
                                              type="button"
                                              onClick={() =>
                                                selectCountry(row.value)
                                              }
                                              className={`flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-start transition-colors hover:bg-gray-50 ${isSelected ? "bg-primary/5" : ""}`}
                                            >
                                              <div className="flex h-8 w-11 shrink-0 items-center justify-center overflow-hidden rounded bg-gray-100">
                                                {row.flagUrl ? (
                                                  // eslint-disable-next-line @next/next/no-img-element
                                                  <img
                                                    src={row.flagUrl}
                                                    alt=""
                                                    className="h-full w-full object-cover"
                                                  />
                                                ) : (
                                                  <span className="text-xs font-medium text-gray-500">
                                                    {row.displayName.slice(
                                                      0,
                                                      1,
                                                    )}
                                                  </span>
                                                )}
                                              </div>
                                              <span
                                                className={`min-w-0 flex-1 text-sm ${isSelected ? "text-primary font-medium" : "text-[#333333]"}`}
                                              >
                                                {row.displayName}
                                              </span>
                                              {isSelected && (
                                                <Check
                                                  className="text-primary h-[18px] w-[18px] shrink-0"
                                                  strokeWidth={2.5}
                                                />
                                              )}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    );
                                  })
                                )}
                              </div>

                              <div className="flex w-8 shrink-0 flex-col items-center gap-0.5 border-s border-gray-100 bg-white py-2 text-[10px] leading-tight">
                                {indexLettersForBar.map((displayLetter) => {
                                  const sectionKey =
                                    displayLetter === t("Hot")
                                      ? HOT_SECTION_KEY
                                      : displayLetter;
                                  const has =
                                    sectionKey === HOT_SECTION_KEY
                                      ? hotCountryRows.length > 0
                                      : !!countriesGroupedByLetter[
                                          displayLetter
                                        ]?.length;
                                  const isActive =
                                    displayLetter === t("Hot")
                                      ? activeCountryIndexLetter ===
                                        HOT_SECTION_KEY
                                      : activeCountryIndexLetter ===
                                        displayLetter;
                                  return (
                                    <button
                                      key={`${displayLetter}-${sectionKey}`}
                                      type="button"
                                      disabled={!has}
                                      onClick={() =>
                                        scrollCountryToLetter(sectionKey)
                                      }
                                      className={`rounded px-0.5 py-0.5 ${!has ? "cursor-default text-gray-300" : isActive ? "text-primary font-semibold" : "active:text-primary text-gray-500"}`}
                                    >
                                      {displayLetter}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </SheetContent>
                        </Sheet>
                      </div>

                      {/* Weight */}
                      <FormInlineField label={t("Weight (kg)")} required>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="100000"
                          step="any"
                          value={weight}
                          onChange={(e) => setWeight(e.target.value)}
                          placeholder={t("Enter weight")}
                          className={cn(BORDERLESS_CONTROL_CLASS, "text-end")}
                        />
                      </FormInlineField>

                      {/* Product Type */}
                      <div className="relative" ref={propPickerContainerRef}>
                        <FormInlineField
                          label={t("Product Type")}
                          required
                          active={!isMobile && isPropDropdownOpen}
                        >
                          <button
                            type="button"
                            onClick={openPropPicker}
                            className="flex w-full items-center justify-end gap-2 border-0 bg-transparent p-0 text-sm font-normal"
                          >
                            <span
                              className={cn(
                                "min-w-0 truncate text-end",
                                !selectedPropName
                                  ? "text-gray-400"
                                  : "text-[#333333]",
                              )}
                            >
                              {selectedPropName || t("Select product type")}
                            </span>
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 shrink-0 text-gray-400 transition-transform",
                                !isMobile && isPropDropdownOpen && "rotate-180",
                              )}
                            />
                          </button>
                        </FormInlineField>

                        {/* PC: inline product type picker */}
                        {!isMobile && isPropDropdownOpen && (
                          <div className="absolute start-0 end-0 top-full z-50 mt-1 overflow-hidden rounded-[8px] border border-[#E2E4F0] bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.08)]">
                            <div className="max-h-[280px] overflow-y-auto overscroll-contain">
                              {loadingProps ? (
                                <div className="py-8 text-center text-sm text-gray-500">
                                  {t("Loading")}
                                </div>
                              ) : propOptions.length > 0 ? (
                                propOptions.map((opt) => {
                                  const isSelected =
                                    selectedAttributeCode === opt.code;
                                  return (
                                    <button
                                      key={opt.code}
                                      type="button"
                                      onClick={() => selectPropOption(opt.code)}
                                      className={cn(
                                        "flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-start transition-colors last:border-b-0 hover:bg-gray-50",
                                        isSelected && "bg-primary/5",
                                      )}
                                    >
                                      <span
                                        className={cn(
                                          "min-w-0 flex-1 text-sm",
                                          isSelected
                                            ? "text-primary font-medium"
                                            : "text-[#333333]",
                                        )}
                                      >
                                        {opt.name}
                                      </span>
                                      {isSelected && (
                                        <Check
                                          className="text-primary h-[18px] w-[18px] shrink-0"
                                          strokeWidth={2.5}
                                        />
                                      )}
                                    </button>
                                  );
                                })
                              ) : (
                                <div className="py-8 text-center text-sm text-gray-500">
                                  {t("No options available")}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Mobile: bottom sheet */}
                        <Sheet
                          open={isMobile && isPropSheetOpen}
                          onOpenChange={onPropSheetOpenChange}
                        >
                          <SheetContent
                            side="bottom"
                            className="flex h-[80vh] max-h-[80vh] flex-col gap-0 rounded-t-[20px] p-0 [&>button]:hidden"
                          >
                            <SheetHeader className="relative flex flex-row items-center gap-3 border-b border-gray-200 px-4 py-3">
                              <button
                                type="button"
                                onClick={() => onPropSheetOpenChange(false)}
                                className="flex items-center justify-center"
                              >
                                <ArrowLeft className="h-5 w-5 text-[#333333]" />
                              </button>
                              <SheetTitle className="flex-1 text-start text-base font-medium text-[#333333]">
                                {t("Product Type")}
                              </SheetTitle>
                              <SheetDescription className="sr-only">
                                {t("Select product type")}
                              </SheetDescription>
                            </SheetHeader>

                            <div className="flex-1 overflow-y-auto">
                              {loadingProps ? (
                                <div className="p-4 text-center text-sm text-gray-500">
                                  {t("Loading")}
                                </div>
                              ) : propOptions.length > 0 ? (
                                <div>
                                  {propOptions.map((opt) => {
                                    const isSelected =
                                      selectedAttributeCode === opt.code;
                                    return (
                                      <button
                                        key={opt.code}
                                        type="button"
                                        onClick={() =>
                                          selectPropOption(opt.code)
                                        }
                                        className={`flex w-full cursor-pointer items-center border-b border-gray-100 px-4 py-3 text-start transition-colors hover:bg-gray-50 ${isSelected ? "bg-primary/5" : ""}`}
                                      >
                                        <span
                                          className={`text-sm ${isSelected ? "text-primary font-medium" : "text-[#333333]"}`}
                                        >
                                          {opt.name}
                                        </span>
                                        {isSelected && (
                                          <span className="text-primary ms-auto">
                                            ✓
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="p-4 text-center text-sm text-gray-500">
                                  {t("No options available")}
                                </div>
                              )}
                            </div>

                            <div className="border-t border-gray-200 px-4 py-4">
                              <button
                                type="button"
                                onClick={() => onPropSheetOpenChange(false)}
                                className="bg-primary hover:bg-primary/90 h-11 w-full rounded-[8px] text-sm font-normal text-white transition-colors"
                              >
                                {t("Confirm")}
                              </button>
                            </div>
                          </SheetContent>
                        </Sheet>
                      </div>

                      {/* Dimensions */}
                      <div
                        className={cn(
                          "grid min-w-0 gap-1.5 sm:gap-2",
                          hasQueried && !isMobile
                            ? "grid-cols-1"
                            : "grid-cols-3",
                        )}
                      >
                        <DimensionInlineField
                          label={t("Length")}
                          value={length}
                          onChange={setLength}
                        />
                        <DimensionInlineField
                          label={t("Width")}
                          value={width}
                          onChange={setWidth}
                        />
                        <DimensionInlineField
                          label={t("Height")}
                          value={height}
                          onChange={setHeight}
                        />
                      </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex flex-row flex-wrap items-center justify-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleReset}
                        className="border-primary text-primary hover:bg-primary/5 h-[46px] shrink-0 rounded-[8px] border bg-white px-6 text-sm font-normal transition-colors"
                      >
                        {t("Reset")}
                      </button>
                      <button
                        type="button"
                        onClick={handleInquire}
                        disabled={loadingQuery || !canInquire}
                        aria-busy={loadingQuery}
                        aria-label={loadingQuery ? t("Searching") : undefined}
                        className="bg-primary hover:bg-primary/90 relative h-[46px] shrink-0 rounded-[8px] px-6 text-sm font-normal text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className={cn(loadingQuery && "invisible")}>
                          {t("Inquire")}
                        </span>
                        {loadingQuery && (
                          <span className="absolute inset-0 grid place-items-center">
                            <Spinner className="size-5" aria-hidden="true" />
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {!loadingQuery && (
                  <EstimationFaqSection
                    t={t}
                    isMobile={isMobile}
                    hasQueried={hasQueried}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      }
    </ResponsiveContentFrame>
  );
}
