import { useState } from "react";
import { Search, X } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { inputClass } from "../components/ui";
import { cn } from "../lib/utils";

const groups = [
  { label: "General settings", ids: ["business", "language", "invoicing"] },
  { label: "Products and pricing", ids: ["product-categories", "product-pricing", "product-search-cache", "pricing", "exchange-rates"] },
  { label: "Fulfillment services", ids: ["integration", "destinations", "tracking", "wallet"] },
  { label: "Customer communications and payments", ids: ["payments", "email"] },
  { label: "Security and system", ids: ["team", "client-origins", "advanced"] },
];
const keywords: Record<string, string> = {
  business: "Brand logo company address",
  language: "Translation locale currency",
  invoicing: "Invoice billing tax",
  "product-categories": "Category hierarchy import images",
  "product-pricing": "Product markup service fee",
  "product-search-cache": "Keyword search cache duration filters sorting",
  pricing: "Freight markup shipping price",
  "exchange-rates": "Exchange rate currency CNY USD",
  integration: "HioBuy API key warehouse sync webhook",
  destinations: "Country shipping destination",
  tracking: "Tracking events logistics labels",
  wallet: "HioBuy fulfillment balance transactions",
  payments: "Stripe bank transfer payment",
  email: "SMTP email templates notifications",
  team: "Staff roles permissions invitations",
  "client-origins": "CORS origin domain port whitelist localhost",
  advanced: "Google login authentication Turnstile security numbering assistant AI",
};

export function SettingsNavigation<T extends string>({ items, value, onChange }: {
  items: readonly (readonly [T, string, string])[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const sections = groups.map(group => ({ ...group, items: group.ids.flatMap(id => {
    const item = items.find(([key]) => key === id);
    if (!item) return [];
    const haystack = [id, item[1], t(item[1]), group.label, t(group.label), keywords[id], t(keywords[id])].join(" ").toLocaleLowerCase();
    return terms.every(term => haystack.includes(term)) ? [item] : [];
  }) })).filter(group => group.items.length);
  const selected = items.find(([id]) => id === value);
  const selectedMatches = sections.some(section => section.items.some(([id]) => id === value));
  return <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
    <div className="relative mb-3">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" />
      <input type="search" aria-label={t("Search settings")} placeholder={t("Search settings")} className={cn(inputClass, "pl-9 pr-9")} value={search} onChange={e => setSearch(e.target.value)} />
      {search && <button type="button" aria-label={t("Clear settings search")} className="absolute right-2 top-2 rounded p-1 text-slate-500 hover:bg-slate-100 focus-visible:outline-2" onClick={() => setSearch("")}><X aria-hidden="true" className="size-4" /></button>}
    </div>
    <label className="block lg:hidden">
      <span className="mb-1 block text-xs text-slate-500">{t("Choose a setting")}</span>
      <select className={inputClass} value={value} disabled={!sections.length} onChange={e => {
        const item = items.find(([id]) => id === e.target.value);
        if (item) onChange(item[0]);
      }}>
        {!selectedMatches && <option value={value} disabled>{selected ? t(selected[1]) : t("Choose a setting")}</option>}
        {sections.map(section => <optgroup key={section.label} label={t(section.label)}>
          {section.items.map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
        </optgroup>)}
      </select>
    </label>
    <nav aria-label={t("Settings navigation")} className="hidden space-y-5 lg:block">
      {sections.map(section => <div key={section.label}>
        <h2 className="mb-1.5 px-3 text-xs font-medium text-slate-400">{t(section.label)}</h2>
        <ul className="space-y-0.5">{section.items.map(([id, label]) => <li key={id}>
          <button type="button" aria-current={value === id ? "page" : undefined} onClick={() => onChange(id)} className={cn("w-full rounded-lg px-3 py-2 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2", value === id ? "bg-slate-100 font-semibold text-ink" : "text-slate-600 hover:bg-slate-50 hover:text-ink")}>{t(label)}</button>
        </li>)}</ul>
      </div>)}
    </nav>
    {!sections.length && <p role="status" className="mt-3 px-1 text-sm text-slate-500">{t("No matching settings. Try another keyword.")}</p>}
  </aside>;
}
