/**
 * 可复用的添加/编辑地址表单弹窗组件
 * 支持 PC 端 Dialog、移动端 Sheet 自适应
 */
"use client";
import type { StoredAddress } from "@/lib/client/services/address-types";
import type {
  AreaRecord,
  CountryRecord,
} from "@/lib/client/services/account-types";
import { useState, useEffect } from "react";
import * as Flags from "country-flag-icons/react/3x2";
import { getProcurementDestinations } from "@/lib/procurement/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  Globe,
  House,
  Mail,
  MapPin,
  Phone,
  Star,
  User,
  UserRound,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
export interface AddressFormData {
  firstName: string;
  lastName: string;
  countryCode: string;
  phone: string;
  country: string;
  province: string;
  city: string;
  detailedAddress: string;
  addressLine2: string;
  postCode: string;
}
export interface AddressSubmitParams {
  area_id: number | string;
  city: string;
  country_id: number | string;
  phone: string;
  postcode: string;
  province?: string;
  firstName: string;
  lastName: string;
  receiver_name: string;
  street: string;
  addressLine2: string;
  regionCode: string;
  sub_area_id: number | string;
  timezone: string;
  is_default?: number;
}
type CountryCodeItem = {
  label: string;
  value: string;
  countryCode: string;
};
type CountryItem = {
  label: string;
  value: string;
  id?: string | number;
  rawData?: CountryRecord;
};
/** Countries and dialing codes from the procurement destinations API. */
async function loadAddressCountries(): Promise<CountryRecord[]> {
  return (await getProcurementDestinations()).map(
    ({ code, name, dial, regions }) => ({
      id: code,
      code,
      name,
      timezone: dial?.replace(/^\+/, "00"),
      regions,
    }),
  );
}

export interface AddressFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "add" | "edit";
  editingId?: string | null;
  initialData?:
    | (Partial<StoredAddress> & {
        recipientName?: string;
        firstName?: string;
        lastName?: string;
        addressLine2?: string | null;
        countryIsoCode?: string;
        post_code?: string;
        isDefault?: boolean;
      })
    | null;
  onSubmit: (params: AddressSubmitParams) => Promise<void>;
}
const DEFAULT_FORM_DATA: AddressFormData = {
  firstName: "",
  lastName: "",
  countryCode: "",
  phone: "",
  country: "",
  province: "",
  city: "",
  detailedAddress: "",
  addressLine2: "",
  postCode: "",
};
export function AddressFormModal({
  open,
  onOpenChange,
  mode = "add",
  editingId = null,
  initialData,
  onSubmit,
}: AddressFormModalProps) {
  const t = useTranslations();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  const [countryCodes, setCountryCodes] = useState<CountryCodeItem[]>([]);
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [formData, setFormData] = useState<AddressFormData>(DEFAULT_FORM_DATA);
  const [selectedCountryAreas, setSelectedCountryAreas] = useState<
    AreaRecord[]
  >([]);
  const [selectedArea, setSelectedArea] = useState<{
    area_id?: number;
    sub_area_id?: number;
    name?: string;
  } | null>(null);
  const [isAreaPickerOpen, setIsAreaPickerOpen] = useState(false);
  const [areaPickerPath, setAreaPickerPath] = useState<
    Array<{
      id: number;
      name: string;
      level: number;
    }>
  >([]);
  const [currentAreaList, setCurrentAreaList] = useState<AreaRecord[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const handleFormChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === "country") {
      const selectedCountry = countries.find((c) => c.value === value);
      const areas =
        selectedCountry?.rawData?.areas ||
        selectedCountry?.rawData?.children ||
        [];
      if (areas?.length > 0) {
        setSelectedCountryAreas(areas);
        setCurrentAreaList(areas);
        setAreaPickerPath([]);
        setSelectedArea(null);
        setFormData((prev) => ({ ...prev, province: "", city: "" }));
      } else {
        setSelectedCountryAreas([]);
        setCurrentAreaList([]);
        setAreaPickerPath([]);
        setSelectedArea(null);
      }
      if (!formData.countryCode) {
        setFormData((prev) => ({
          ...prev,
          countryCode: selectedCountry?.rawData?.timezone || "",
        }));
      }
    }
  };
  const handleAreaSelect = (area: AreaRecord) => {
    const areaName = area.name || area.label || "";
    const areaId = area.id ?? area.area_id;
    if (areaId == null) return;
    const children = area.children || area.areas || [];
    const currentLevel = areaPickerPath.length + 1;
    const newPath = [
      ...areaPickerPath,
      { id: areaId, name: areaName, level: currentLevel },
    ];
    setAreaPickerPath(newPath);
    if (children?.length > 0 && currentLevel < 4) {
      setCurrentAreaList(children);
    } else {
      const fullPath = newPath.map((p) => p.name).join("/");
      setSelectedArea({
        area_id: newPath.length >= 1 ? newPath[0].id : areaId,
        sub_area_id:
          newPath.length >= 2
            ? newPath[1].id
            : newPath.length >= 1
              ? newPath[0].id
              : 0,
        name: fullPath,
      });
      setFormData((prev) => ({ ...prev, city: fullPath }));
      setIsAreaPickerOpen(false);
    }
  };
  const handleAreaTabClick = (level: number) => {
    const newPath = areaPickerPath.slice(0, level);
    setAreaPickerPath(newPath);
    let currentList = selectedCountryAreas;
    for (let i = 0; i < newPath.length; i++) {
      const pathItem = newPath[i];
      const found = currentList.find(
        (item) => (item.id || item.area_id) === pathItem.id,
      );
      if (found) {
        currentList = found.children || found.areas || [];
      } else break;
    }
    setCurrentAreaList(currentList);
  };
  const handleConfirm = async () => {
    try {
      setLoading(true);
      const selectedCountry = countries.find(
        (c) => c.value === formData.country,
      );
      const countryId =
        selectedCountry?.id ||
        selectedCountry?.rawData?.id ||
        selectedCountry?.rawData?.country_id;
      let timezoneValue = formData.countryCode?.trim() || "";
      if (timezoneValue) {
        if (timezoneValue.startsWith("+")) {
          timezoneValue = "00" + timezoneValue.substring(1);
        } else if (!timezoneValue.startsWith("00")) {
          timezoneValue = "00" + timezoneValue;
        }
      }
      const cityValue = selectedArea ? "" : formData.city || "";
      const areaId = selectedArea?.area_id;
      const subAreaId = selectedArea?.sub_area_id;
      const firstName = formData.firstName.trim();
      const lastName = formData.lastName.trim();
      const params: AddressSubmitParams = {
        area_id:
          areaId === undefined || areaId === null || areaId === 0 ? "" : areaId,
        city: cityValue,
        country_id:
          countryId === undefined || countryId === null || countryId === 0
            ? ""
            : countryId,
        phone: formData.phone,
        postcode: formData.postCode || "",
        province: formData.province || "",
        firstName,
        lastName,
        receiver_name: [firstName, lastName].filter(Boolean).join(" "),
        street: formData.detailedAddress || "",
        addressLine2: formData.addressLine2.trim(),
        regionCode: selectedCountry?.rawData?.regions?.[0]?.code ?? "",
        sub_area_id:
          subAreaId === undefined || subAreaId === null || subAreaId === 0
            ? ""
            : subAreaId,
        timezone: timezoneValue,
        is_default: isDefault ? 1 : 0,
      };
      await onSubmit(params);
      onOpenChange(false);
      setFormData(DEFAULT_FORM_DATA);
      setSelectedCountryAreas([]);
      setCurrentAreaList([]);
      setAreaPickerPath([]);
      setSelectedArea(null);
    } catch {
      // The submit handler displays validation/API errors. Keep this form open
      // for correction without leaking a rejected event-handler promise.
    } finally {
      setLoading(false);
    }
  };
  const resetAndOpen = () => {
    setFormData(DEFAULT_FORM_DATA);
    setSelectedCountryAreas([]);
    setCurrentAreaList([]);
    setAreaPickerPath([]);
    setSelectedArea(null);
    setIsDefault(false);
  };
  const fillFormFromInitialData = (
    rawData: NonNullable<AddressFormModalProps["initialData"]>,
  ) => {
    if (!rawData) return;
    const timezoneValue = rawData.timezone || "";
    let countryCode = "";
    const matchedCode = countryCodes.find((code) => {
      const codeValue = code.value || "";
      const codeLabel = code.label || "";
      if (codeValue === timezoneValue || codeLabel === timezoneValue)
        return true;
      const timezoneNum = timezoneValue.replace(/^(00|\+)/, "");
      const codeValueNum = codeValue.replace(/^(00|\+)/, "");
      const codeLabelNum = codeLabel.replace(/^(00|\+)/, "");
      return codeValueNum === timezoneNum || codeLabelNum === timezoneNum;
    });
    if (matchedCode) countryCode = matchedCode.value;
    else countryCode = timezoneValue;
    let countryValue = rawData.countryIsoCode ?? "";
    if (!countryValue && rawData.country) {
      const country = countries.find(
        (c) =>
          c.id === rawData.country?.id || c.rawData?.id === rawData.country?.id,
      );
      if (country) countryValue = country.value;
    }
    if (countryValue) {
      const selectedCountry = countries.find((c) => c.value === countryValue);
      const areas =
        selectedCountry?.rawData?.areas ||
        selectedCountry?.rawData?.children ||
        [];
      if (areas?.length > 0) {
        setSelectedCountryAreas(areas);
        setCurrentAreaList(areas);
        if (rawData.area || rawData.sub_area) {
          const path: Array<{
            id: number;
            name: string;
            level: number;
          }> = [];
          if (rawData.area)
            path.push({
              id: rawData.area.id ?? rawData.area_id ?? 0,
              name: rawData.area.name ?? "",
              level: 1,
            });
          if (rawData.sub_area)
            path.push({
              id: rawData.sub_area.id ?? rawData.sub_area_id ?? 0,
              name: rawData.sub_area.name ?? "",
              level: 2,
            });
          if (rawData.low_area)
            path.push({
              id: rawData.low_area.id ?? 0,
              name: rawData.low_area.name ?? "",
              level: 3,
            });
          setAreaPickerPath(path);
          setSelectedArea({
            area_id: rawData.area?.id || rawData.area_id || 0,
            sub_area_id: rawData.sub_area?.id || rawData.sub_area_id || 0,
            name: path.map((p) => p.name).join("/"),
          });
        }
      }
    }
    const cityStr =
      rawData.city || (rawData.area ? getAddressContent(rawData) : "") || "";
    let province = rawData.province ?? "";
    let city = rawData.city ?? cityStr;
    if (province === "" && cityStr.includes(",")) {
      const [p, ...c] = cityStr.split(",").map((s: string) => s.trim());
      province = p || "";
      city = c.join(", ").trim() || cityStr;
    }
    const named = rawData as typeof rawData & {
      source?: {
        firstName?: string;
        lastName?: string;
        addressLine2?: string | null;
      };
    };
    const fallbackName = (
      rawData.receiver_name ||
      rawData.recipientName ||
      ""
    ).trim();
    const [fallbackFirst = "", ...fallbackLast] = fallbackName.split(/\s+/);
    setFormData({
      firstName: named.firstName || named.source?.firstName || fallbackFirst,
      lastName:
        named.lastName || named.source?.lastName || fallbackLast.join(" "),
      countryCode,
      phone: rawData.phone || "",
      country: countryValue,
      province,
      city,
      detailedAddress: rawData.street || rawData.address || "",
      addressLine2:
        named.addressLine2 ||
        named.source?.addressLine2 ||
        (rawData.street ? rawData.address : "") ||
        "",
      postCode: rawData.postcode || rawData.post_code || "",
    });
    setIsDefault(rawData.is_default === 1 || rawData.isDefault === true);
  };
  function getAddressContent(address: Partial<StoredAddress>): string {
    if (!address) return "";
    let content = "";
    if (address.area != null) {
      if (address.low_area != null) content += `${address.low_area.name},`;
      if (address.sub_area != null) content += `${address.sub_area.name},`;
      content += `${address.area.name},`;
    } else if (address.city) {
      content += `${address.city},`;
    }
    if (address.country) content += address.country.name;
    return content;
  }
  useEffect(() => {
    const fetchCountries = async () => {
      try {
        const countryList = await loadAddressCountries();
        const timezones: Array<{
          value: string;
          label: string;
          countryCode: string;
        }> = [];
        countryList.forEach((c) => {
          if (c.timezone && !timezones.some((t) => t.value === c.timezone)) {
            timezones.push({
              value: c.timezone,
              label: "+" + c.timezone.replace(/^0{1,3}/, ""),
              countryCode: c.code || "",
            });
          }
        });
        timezones.sort((a, b) => a.value.localeCompare(b.value));
        setCountryCodes(timezones);
        const formatted = countryList
          .map((c) => ({
            label: c.name || c.cn_name || c.en_name || "",
            value: c.code || c.iso_code || "",
            id: c.id,
            rawData: c,
          }))
          .filter((c) => c.label && c.value);
        const unique = new Map<string, CountryItem>();
        formatted.forEach((c: CountryItem) => {
          if (!unique.has(c.value)) unique.set(c.value, c);
        });
        setCountries(Array.from(unique.values()));
      } catch {
        setCountries([]);
      }
    };
    fetchCountries();
  }, []);
  const formKey = JSON.stringify([
    open,
    mode,
    editingId,
    initialData,
    countryCodes,
    countries,
  ]);
  const [previousFormKey, setPreviousFormKey] = useState<string | null>(null);
  if (previousFormKey !== formKey) {
    setPreviousFormKey(formKey);
    if (open) {
      if (mode === "edit" && initialData) fillFormFromInitialData(initialData);
      else resetAndOpen();
    }
  }
  const fieldLabelClassName = "mb-2 block text-[13px] font-bold text-[#1F2937]";
  const textFieldClassName =
    "h-11 w-full rounded-[12px] border border-[#D9E1EC] bg-white px-4 text-sm text-[#344054] placeholder:text-[#B8C1CC] focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10";
  const sectionTitleClassName =
    "text-xs font-bold uppercase tracking-[0.06em] text-[#8A94A6]";
  const formContent = (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-[#E8EEF5] bg-[#F7F9FC] p-4 md:p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-[10px] bg-[#EEE8FF] text-[#8B5CF6]">
            <UserRound className="size-4" />
          </span>
          <span className={sectionTitleClassName}>{t("Recipient Info")}</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={fieldLabelClassName}>
              <span className="text-primary">*</span> {t("First Name")}
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-[#98A2B3]" />
              <input
                type="text"
                value={formData.firstName}
                maxLength={40}
                autoComplete="given-name"
                onChange={(e) => handleFormChange("firstName", e.target.value)}
                placeholder={t("Please enter your first name")}
                className={`${textFieldClassName} ps-11`}
              />
            </div>
          </div>
          <div>
            <label className={fieldLabelClassName}>
              <span className="text-primary">*</span> {t("Last Name")}
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-[#98A2B3]" />
              <input
                type="text"
                value={formData.lastName}
                maxLength={40}
                autoComplete="family-name"
                onChange={(e) => handleFormChange("lastName", e.target.value)}
                placeholder={t("Please enter your last name")}
                className={`${textFieldClassName} ps-11`}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[20px] border border-[#E8EEF5] bg-[#F7F9FC] p-4 md:p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-[10px] bg-[#E6F0FF] text-[#4F86FF]">
            <MapPin className="size-4" />
          </span>
          <span className={sectionTitleClassName}>
            {t("Shipping Location")}
          </span>
        </div>
        <div className="space-y-4">
          <div>
            <label className={fieldLabelClassName}>
              <span className="text-primary">*</span> {t("country / region")}
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="relative">
                <Globe className="pointer-events-none absolute start-4 top-1/2 z-10 size-4 -translate-y-1/2 text-[#98A2B3]" />
                <Select
                  value={formData.country}
                  onValueChange={(v) => handleFormChange("country", v)}
                >
                  <SelectTrigger className={`${textFieldClassName} ps-11`}>
                    <SelectValue placeholder={t("Country")} />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((country, index) => {
                      const Flag =
                        Flags[
                          country.value.toUpperCase() as keyof typeof Flags
                        ];
                      return (
                        <SelectItem
                          key={`${country.value}-${index}`}
                          value={country.value}
                        >
                          <div className="flex items-center gap-2">
                            {Flag && (
                              <Flag title={country.label} className="w-6" />
                            )}
                            <span>{country.label}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <Building2 className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-[#98A2B3]" />
                <input
                  type="text"
                  value={formData.province}
                  onChange={(e) => handleFormChange("province", e.target.value)}
                  placeholder={t("Province/State")}
                  className={`${textFieldClassName} ps-11`}
                />
              </div>
              <div className="relative">
                <Mail className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-[#98A2B3]" />
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => handleFormChange("city", e.target.value)}
                  placeholder={t("City")}
                  className={`${textFieldClassName} ps-11`}
                />
              </div>
            </div>
          </div>

          <div>
            <label className={fieldLabelClassName}>
              <span className="text-primary">*</span> {t("Address")}
            </label>
            <div className="relative">
              <House className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-[#98A2B3]" />
              <input
                type="text"
                value={formData.detailedAddress}
                onChange={(e) =>
                  handleFormChange("detailedAddress", e.target.value)
                }
                placeholder={t("Please enter your address")}
                className={`${textFieldClassName} ps-11`}
              />
            </div>
          </div>

          <div>
            <label className={fieldLabelClassName}>{t("Address line 2")}</label>
            <div className="relative">
              <House className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-[#98A2B3]" />
              <input
                type="text"
                value={formData.addressLine2}
                maxLength={160}
                autoComplete="address-line2"
                onChange={(e) =>
                  handleFormChange("addressLine2", e.target.value)
                }
                placeholder={t("Apartment, suite, unit, floor (optional)")}
                className={`${textFieldClassName} ps-11`}
              />
            </div>
          </div>

          <div>
            <label className={fieldLabelClassName}>{t("post code")}</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-[#98A2B3]" />
              <input
                type="text"
                value={formData.postCode}
                onChange={(e) => handleFormChange("postCode", e.target.value)}
                placeholder={t("Please enter your postal code")}
                className={`${textFieldClassName} ps-11`}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[20px] border border-[#E8EEF5] bg-[#F7F9FC] p-4 md:p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-[10px] bg-[#DDF9EA] text-[#12B76A]">
            <Phone className="size-4" />
          </span>
          <span className={sectionTitleClassName}>{t("Contact Details")}</span>
        </div>
        <div>
          <label className={fieldLabelClassName}>
            <span className="text-primary">*</span> {t("contact number")}
          </label>
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
            <div className="relative">
              <Select
                value={formData.countryCode}
                onValueChange={(v) => handleFormChange("countryCode", v)}
              >
                <SelectTrigger className={`${textFieldClassName} px-3`}>
                  <SelectValue placeholder={t("Code")}>
                    +{formData.countryCode.replace(/^0{1,3}/, "")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {countryCodes.map((code) => {
                    return (
                      <SelectItem key={code.value} value={code.value}>
                        <div className="flex items-center gap-2">
                          <span>{code.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="relative">
              <Phone className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-[#98A2B3]" />
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleFormChange("phone", e.target.value)}
                placeholder={t("Please enter your contact number")}
                className={`${textFieldClassName} ps-11`}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-[18px] border border-[#E8EEF5] bg-[#F7F9FC] px-4 py-4">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex size-7 items-center justify-center rounded-md border border-[#E5EAF1] bg-white text-[#98A2B3]">
            <Star className="size-3" />
          </span>
          <div>
            <div className="text-xs font-semibold text-[#475467]">
              {t("Set as default address")}
            </div>
            <div className="text-[10px] text-[#98A2B3]">
              {t("Use this address for future orders")}
            </div>
          </div>
        </div>
        <Switch checked={isDefault} onCheckedChange={setIsDefault} />
      </div>
    </div>
  );
  const title = mode === "edit" ? t("Edit Address") : t("Add New Address");
  const saveText = mode === "edit" ? t("Save Changes") : t("Confirm");
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="h-[88dvh] max-h-[88dvh] w-full max-w-[100vw] overflow-hidden rounded-t-[28px] border-0 p-0 [&>button]:top-6 [&>button>svg]:size-6"
        >
          <div className="flex h-full min-h-0 min-w-0 flex-col">
            <SheetHeader className="shrink-0 border-b border-[#EEF2F6] px-5 py-5">
              <SheetTitle className="text-start text-lg font-bold">
                {title}
              </SheetTitle>
            </SheetHeader>
            <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-5">
              {formContent}
            </div>
            <div className="shrink-0 border-t border-[#EEF2F6] bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="h-12 rounded-[14px] border border-[#D9E1EC] bg-white text-base font-semibold text-[#667085] transition-colors hover:bg-[#F8FAFC]"
                >
                  {t("Cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={loading}
                  className="flex h-12 items-center justify-center gap-2 rounded-[14px] bg-[#FF7A3D] px-4 text-base font-semibold text-white transition-colors hover:bg-[#FF6B35] disabled:opacity-70"
                >
                  {loading ? (
                    <Spinner className="size-6 text-white" />
                  ) : (
                    <span>{saveText}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[640px] overflow-hidden rounded-[28px] border-0 p-0 shadow-[0_28px_72px_rgba(16,24,40,0.2)] [&>button]:top-5 [&>button]:text-[#98A2B3] [&>button>svg]:size-6">
        <DialogHeader className="border-b border-[#EEF2F6] px-7 py-5">
          <DialogTitle className="text-[22px] leading-none font-semibold text-[#1F2937]">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[calc(90vh-184px)] overflow-y-auto px-7 py-6">
          {formContent}
        </div>
        <div className="border-t border-[#EEF2F6] px-7 py-5">
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-11 rounded-[12px] border border-[#D9E1EC] bg-white px-5 text-base font-semibold text-[#667085] transition-colors hover:bg-[#F8FAFC]"
            >
              {t("Cancel")}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="flex h-11 min-w-[180px] items-center justify-center gap-2 rounded-[12px] bg-[#FF7A3D] px-6 text-base font-semibold text-white transition-colors hover:bg-[#FF6B35] disabled:opacity-70"
            >
              {loading ? (
                <Spinner className="size-6 text-white" />
              ) : (
                <span>{saveText}</span>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
