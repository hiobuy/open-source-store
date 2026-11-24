"use client";
import { ShippingChannelDetailModal } from "./components/shipping-channel-detail-modal";
import { type ShippingLine } from "./components/shipping-line-detail-body";
import { AddressSelectDialog } from "@/components/features/checkout/address-select-modal";
import { Section } from "@/components/layout/section";
import { ShippingChannelIcon } from "@/components/shipping-channel-icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-mobile";
import type {
  AddressData as LegacyAddress,
  ShippingChannel as LegacyChannel,
} from "@/lib/client/services/create-order-types";
import type {
  InsuranceInfo,
  TariffInfo,
} from "@/lib/client/services/shipping-config-types";
import { useProcurementResource } from "@/hooks/use-procurement-resource";
import {
  createProcurementShipment,
  getProcurementAddresses,
  quoteProcurementShipment,
  saveProcurementAddress,
} from "@/lib/procurement/client";
import type { ProcurementAddress } from "@/lib/procurement/types";
import { formatAddressLines } from "@/lib/address-format";
import type {
  ProcurementShipmentInput,
  ProcurementShippingQuote,
} from "@/lib/procurement/logistics-types";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
import { purchaseLoginHref } from "@/lib/procurement/purchase";
import { AddressFormModal } from "@/components/features/address/address-form-modal";
import { getErrorMessage } from "@/lib/error-message";
import { usePriceConvert } from "@/lib/store/common";
import { useParcelStore } from "@/lib/store/parcel";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  HelpCircle,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Truck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
type AddressData = Omit<LegacyAddress, "id"> & {
  id: string;
  countryIsoCode: string;
  source: ProcurementAddress;
};
type ShippingChannel = LegacyChannel & {
  quote: ProcurementShippingQuote;
  quoteId: string;
  addressId: string;
  expiresAt?: string;
};

function addressView(address: ProcurementAddress): AddressData {
  return {
    id: address.id,
    receiver_name: address.name,
    phone: address.phone,
    timezone: address.phoneCode.replace(/^\+/, "00"),
    countryIsoCode: address.countryCode,
    country_name: address.countryName,
    province: address.state,
    city: address.city,
    district: address.district ?? undefined,
    street: address.addressLine1,
    address: address.addressLine2 ?? undefined,
    postcode: address.postalCode,
    is_default: Number(address.isDefault),
    source: address,
  };
}

const addressMaskPhone = (timezone?: string, phone?: string): string => {
  if (!phone) return "";
  const tz = timezone ? timezone.replace(/^0{1,3}/, "") : "";
  return `${tz} ${String(phone)}`;
};
const addressIsAddressComplete = (address: AddressData | null): boolean => {
  if (!address) return false;
  const hasArea = address.area?.name || address.city;
  const hasStreet = address.street || address.address;
  const hasReceiver = address.receiver_name;
  const hasPhone = address.phone;
  return !!(hasArea && hasStreet && hasReceiver && hasPhone);
};
function subscribeToParcelHydration(onStoreChange: () => void) {
  const persistApi = useParcelStore.persist;
  if (!persistApi || persistApi.hasHydrated()) return () => {};
  return persistApi.onFinishHydration(onStoreChange);
}

function getParcelHydrationSnapshot(): boolean {
  const persistApi = useParcelStore.persist;
  return persistApi ? persistApi.hasHydrated() : true;
}

interface ItemsParcelDetail {
  id: number;
  name: string;
  qty: number;
  spec: string;
  images?: string[];
  full_path_images?: string[];
}
interface ItemsParcelProp {
  id: number;
  name: string;
}
interface ItemsParcelData {
  id: string;
  express_num?: string;
  package_name?: string;
  package_weight?: number;
  length?: number;
  width?: number;
  height?: number;
  package_pictures?: string[];
  details?: ItemsParcelDetail[];
  prop?: ItemsParcelProp[];
  express_name?: string;
  status_name?: string;
  created_at?: string;
  updated_at?: string;
  chosen_service?: Array<{
    id: number;
    content: string;
  }>;
  free_store?: {
    days: number;
    start_at: string;
  };
}
function unavailableShippingOption<T>(): T | null {
  return null;
}

// 新接口暂无增值服务列表/提交字段，先隐藏；后端支持后改为 true 并接入接口
const SHOW_PACKING_SERVICES = false;
// 增值服务数据类型
interface PackingAddValueService {
  id: number;
  name: string;
  price: number;
  remark?: string;
  enabled: number;
  company_id: number;
  created_at: string;
  updated_at: string;
  type: number;
  work_order_type_id: number | null;
  code: string;
  origin_price: number;
}
function shippingPriceLabel({
  currency,
  estimatedMinFen,
  estimatedMaxFen,
}: ProcurementShippingQuote) {
  const min = (estimatedMinFen / 100).toFixed(2);
  return estimatedMinFen === estimatedMaxFen
    ? `${currency} ${min}`
    : `${currency} ${min}–${(estimatedMaxFen / 100).toFixed(2)}`;
}
function useSubmittedParcelsHydrated(): boolean {
  const mounted = useHydrated();
  const hydrated = useSyncExternalStore(
    subscribeToParcelHydration,
    getParcelHydrationSnapshot,
    () => false,
  );
  return mounted && hydrated;
}

function ItemsParcelListSkeleton() {
  return (
    <div className="mt-4 rounded-lg bg-gray-100 md:bg-white md:p-4">
      <div className="mb-4 hidden gap-4 rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-gray-600 md:grid md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-4 w-20" />
        ))}
      </div>

      <div className="hidden space-y-4 md:block">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-gray-200 p-4">
            <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-4">
              <div className="flex items-start gap-2">
                <Skeleton className="h-16 w-16 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
              <div className="pt-5">
                <Skeleton className="h-4 w-12" />
              </div>
              <div className="pt-5">
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="pt-4">
                <Skeleton className="h-6 w-16 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4 md:hidden">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="space-y-4 rounded-lg bg-white p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex gap-4">
              <Skeleton className="h-24 w-24 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShippingChannelSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-2/5" />
        </div>
        <Skeleton className="h-4 w-12 shrink-0" />
      </div>
    </div>
  );
}

export default function PageClient() {
  const session = useProcurementSessionStore(
    (state) => state.clientStateVersion,
  );
  return <Consolidation key={session} />;
}

function Consolidation() {
  const session = useProcurementSessionStore((state) => state.hasSession);
  const submittedParcels = useParcelStore((state) => state.submittedParcels);
  const clearSubmittedParcels = useParcelStore(
    (state) => state.clearSubmittedParcels,
  );
  const addresses = useProcurementResource(
    getProcurementAddresses,
    session ? true : null,
  );
  const addressOptions = useMemo(
    () => addresses.data?.map(addressView) ?? [],
    [addresses.data],
  );
  const [chosenAddress, setChosenAddress] = useState<AddressData | null>(null);
  const selectedAddress =
    chosenAddress ??
    addressOptions.find((address) => address.is_default) ??
    addressOptions[0] ??
    null;
  const [add_service, setAddService] = useState<number[]>([]);
  const [vip_remark, setVipRemark] = useState<string>("");
  const [selectedShippingChannel, setSelectedShippingChannel] =
    useState<ShippingChannel | null>(null);
  const [is_insurance, setIsInsurance] = useState<number>(0);
  const [is_tariff, setIsTariff] = useState<number>(0);
  // 收货地址
  const t = useTranslations();
  const addressMarginTop = 0;
  const addressMarginBottom = 0;
  const addressMounted = useHydrated();
  const addressAddress = selectedAddress;
  const addressLoading = addresses.loading;
  const [addressIsModalOpen, addressSetIsModalOpen] = useState(false);
  const [addressAddressFormModalOpen, addressSetAddressFormModalOpen] =
    useState(false);
  const [addressAddressFormMode, addressSetAddressFormMode] = useState<
    "add" | "edit"
  >("add");
  const [addressEditingAddressData, addressSetEditingAddressData] =
    useState<AddressData | null>(null);
  const addressApplyAddress = (item: AddressData) => {
    setChosenAddress(item);
    setSelectedShippingChannel(null);
  };
  const addressOpenAddAddressForm = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    addressSetAddressFormMode("add");
    addressSetEditingAddressData(null);
    addressSetAddressFormModalOpen(true);
  };
  const addressOpenEditAddressForm = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!addressAddress) return;
    addressSetAddressFormMode("edit");
    addressSetEditingAddressData(addressAddress);
    addressSetAddressFormModalOpen(true);
  };
  // 待寄商品
  const itemsMounted = useSubmittedParcelsHydrated();
  const [itemsExpandedParcels, itemsSetExpandedParcels] = useState<Set<string>>(
    new Set(),
  );
  const itemsSubmittedParcels = useMemo(
    () =>
      submittedParcels.map((parcel): ItemsParcelData => ({
        id: parcel.id,
        express_num: parcel.domesticTrackingNumber,
        express_name: parcel.courier,
        package_name: parcel.productName ?? undefined,
        package_weight: parcel.weightGrams ?? undefined,
        length: parcel.lengthMm == null ? undefined : parcel.lengthMm * 10,
        width: parcel.widthMm == null ? undefined : parcel.widthMm * 10,
        height: parcel.heightMm == null ? undefined : parcel.heightMm * 10,
        package_pictures: parcel.photos.flatMap((photo) =>
          photo.url ? [photo.url] : [],
        ),
        details: parcel.goodsItems.map((item, index) => ({
          id: index,
          name: item.name,
          qty: item.quantity,
          spec: "",
          full_path_images: item.imageUrl ? [item.imageUrl] : [],
        })),
        prop: parcel.cargoAttributes.map((name, index) => ({
          id: index,
          name,
        })),
        status_name: parcel.displayStatus.label,
        created_at: parcel.createdAt,
      })),
    [submittedParcels],
  );
  // 切换展开/收起
  const itemsToggleExpand = (parcelId: string) => {
    itemsSetExpandedParcels((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(parcelId)) {
        newSet.delete(parcelId);
      } else {
        newSet.add(parcelId);
      }
      return newSet;
    });
  };
  // 复制包裹号
  const itemsHandleCopyExpressNum = async (expressNum: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(expressNum);
        toast.success(t("Successfully copied to clipboard"));
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = expressNum;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand("copy");
          toast.success(t("Successfully copied to clipboard"));
        } catch (err) {
          console.error("复制失败:", err);
          toast.error(t("Failed to copy to clipboard"));
        }
        document.body.removeChild(textArea);
      }
    } catch (error) {
      console.error("复制失败:", error);
      toast.error(t("Failed to copy to clipboard"));
    }
  };
  // 格式化重量
  const itemsFormatWeight = (weight: number) => {
    return `${(weight / 1000).toFixed(3)} KG`;
  };
  // 格式化尺寸
  const itemsFormatDimension = (
    length: number,
    width: number,
    height: number,
  ) => {
    return `${(length / 100).toFixed(2)}*${(width / 100).toFixed(2)}*${(height / 100).toFixed(2)} CM`;
  };
  // 包装服务
  const packingMarginTop = 16;
  const packingMarginBottom = 0;
  const packingMounted = useHydrated();
  const packingServices: PackingAddValueService[] = [];
  const packingLoading = false;
  const packingPriceConvert = usePriceConvert();
  // 切换服务选择
  const packingToggleService = (serviceId: number) => {
    const newSelectedIds = add_service.includes(serviceId)
      ? add_service.filter((id) => id !== serviceId)
      : [...add_service, serviceId];
    setAddService(newSelectedIds);
  };
  // 运输渠道
  const shippingMarginTop = 16;
  const shippingMarginBottom = 0;
  const shippingTranslateUi = useTranslations();
  const shippingMounted = useHydrated();
  const [shippingChannels, shippingSetChannels] = useState<ShippingChannel[]>(
    [],
  );
  const [quotedAddressId, setQuotedAddressId] = useState<string>();
  const [quoteRevision, setQuoteRevision] = useState(0);
  const [shippingIsModalOpen, shippingSetIsModalOpen] = useState(false);
  const [shippingTempSelectedChannel, shippingSetTempSelectedChannel] =
    useState<ShippingChannel | null>(null);
  const shippingInsuranceInfo = unavailableShippingOption<InsuranceInfo>();
  const shippingInsuranceLoading = false;
  const shippingTariffInfo = unavailableShippingOption<TariffInfo>();
  const shippingTariffLoading = false;
  const [shippingShowInsuranceRemark, shippingSetShowInsuranceRemark] =
    useState(false);
  const [shippingShowTariffRemark, shippingSetShowTariffRemark] =
    useState(false);
  const [shippingChannelDetailOpen, shippingSetChannelDetailOpen] =
    useState(false);
  const [shippingChannelDetailFallback, shippingSetChannelDetailFallback] =
    useState<ShippingLine | null>(null);
  const shippingIsMobile = useIsMobile();
  const shippingPriceConvert = usePriceConvert();
  const shippingPackageIds = useMemo(
    () =>
      submittedParcels.filter(({ eligible }) => eligible).map(({ id }) => id),
    [submittedParcels],
  );
  const shippingTotalPackageValue = submittedParcels.reduce(
    (total, parcel) => total + (parcel.declaredValueFen ?? 0),
    0,
  );
  const selectedAddressId = selectedAddress?.id;
  const shippingLoading =
    !!selectedAddressId &&
    submittedParcels.length > 0 &&
    shippingPackageIds.length === submittedParcels.length &&
    quotedAddressId !== selectedAddressId;
  useEffect(() => {
    if (
      !selectedAddressId ||
      shippingPackageIds.length !== submittedParcels.length ||
      !submittedParcels.length
    )
      return;
    let active = true;
    quoteProcurementShipment(shippingPackageIds, selectedAddressId).then(
      (result) => {
        if (!active) return;
        const quoteId = result.quoteId;
        const channels: ShippingChannel[] = quoteId
          ? result.routes.map((quote, index) => ({
              id: index + 1,
              name: quote.routeName,
              reference_time:
                quote.daysMin == null
                  ? undefined
                  : quote.daysMax == null || quote.daysMax === quote.daysMin
                    ? String(quote.daysMin)
                    : `${quote.daysMin}–${quote.daysMax}`,
              quote,
              quoteId,
              addressId: selectedAddressId,
              expiresAt: result.expiresAt,
            }))
          : [];
        shippingSetChannels(channels);
        setSelectedShippingChannel(channels[0] ?? null);
        setQuotedAddressId(selectedAddressId);
        if (result.failure) toast.error(result.failure.message);
      },
      (error: unknown) => {
        if (!active) return;
        shippingSetChannels([]);
        setSelectedShippingChannel(null);
        setQuotedAddressId(selectedAddressId);
        toast.error(getErrorMessage(error) || t("No suitable route found"));
      },
    );
    return () => {
      active = false;
    };
  }, [
    submittedParcels.length,
    selectedAddressId,
    shippingPackageIds,
    quoteRevision,
    t("No suitable route found"),
  ]);
  // 计算保险费用
  const shippingCalculateInsuranceFee = (): number => {
    if (
      !shippingInsuranceInfo ||
      !selectedShippingChannel ||
      shippingTotalPackageValue === 0
    ) {
      return 0;
    }
    // 检查是否支持保险
    if (
      shippingInsuranceInfo.enabled === 0 ||
      !shippingInsuranceInfo.enabled_line_ids.includes(
        selectedShippingChannel.id,
      )
    ) {
      return 0;
    }
    // 计算总金额（分转元）
    const totalValueInYuan = shippingTotalPackageValue / 100;
    // 判断在哪个区间
    // data[0]: 小于等于 start/100
    // data[1]: 大于 start/100
    const threshold = shippingInsuranceInfo.data[0]?.start / 100 || 0;
    const insuranceRule =
      totalValueInYuan <= threshold
        ? shippingInsuranceInfo.data[0]
        : shippingInsuranceInfo.data[1];
    if (!insuranceRule) {
      return 0;
    }
    let fee = 0;
    // 根据 insurance_type 计算费用
    if (insuranceRule.insurance_type === 1) {
      // 按比例：总金额 * 比例%
      fee = totalValueInYuan * (insuranceRule.insurance_proportion / 100);
    } else if (insuranceRule.insurance_type === 2) {
      // 固定金额
      fee = insuranceRule.insurance_proportion;
    }
    // 判断是否在最小和最大金额范围内
    const minFee = insuranceRule.min / 100;
    const maxFee = insuranceRule.max / 100;
    if (fee < minFee) {
      fee = minFee;
    } else if (fee > maxFee) {
      fee = maxFee;
    }
    // 转回分
    return Math.round(fee * 100);
  };
  // 判断是否显示保险服务
  const shippingShouldShowInsurance = (): boolean => {
    if (!shippingInsuranceInfo || !selectedShippingChannel) {
      return false;
    }
    return (
      shippingInsuranceInfo.enabled === 1 &&
      shippingInsuranceInfo.enabled_line_ids.includes(
        selectedShippingChannel.id,
      )
    );
  };
  // 判断是否强制选择
  const shippingIsInsuranceForced = (): boolean => {
    if (
      !shippingInsuranceInfo ||
      !selectedShippingChannel ||
      shippingTotalPackageValue === 0
    ) {
      return false;
    }
    const totalValueInYuan = shippingTotalPackageValue / 100;
    const threshold = shippingInsuranceInfo.data[0]?.start / 100 || 0;
    const insuranceRule =
      totalValueInYuan <= threshold
        ? shippingInsuranceInfo.data[0]
        : shippingInsuranceInfo.data[1];
    return insuranceRule?.is_force === 1;
  };
  // 计算关税费用
  const shippingCalculateTariffFee = (): number => {
    if (
      !shippingTariffInfo ||
      !selectedShippingChannel ||
      shippingTotalPackageValue === 0
    ) {
      return 0;
    }
    // 检查是否支持关税
    if (
      shippingTariffInfo.enabled === 0 ||
      !shippingTariffInfo.enabled_line_ids.includes(selectedShippingChannel.id)
    ) {
      return 0;
    }
    // 计算总金额（分转元）
    const totalValueInYuan = shippingTotalPackageValue / 100;
    // 找到第一个满足条件的规则（总金额 > threshold）
    // 需要按 threshold 从大到小排序，找到第一个满足条件的
    // threshold 的单位是分，需要除以 100 转成元才能和 totalValueInYuan（元）比较
    const sortedRules = [...shippingTariffInfo.data].sort(
      (a, b) => b.threshold - a.threshold,
    );
    const tariffRule = sortedRules.find(
      (rule) => totalValueInYuan > rule.threshold / 100,
    );
    if (!tariffRule) {
      return 0;
    }
    let fee = 0;
    // 根据 type 计算费用
    if (tariffRule.type === 1) {
      // 按比例：总金额 * amount%
      fee = totalValueInYuan * (tariffRule.amount / 10000);
    } else if (tariffRule.type === 2) {
      // 固定金额（amount 是分，需要转元）
      fee = tariffRule.amount / 100;
    }
    // 判断是否在最小和最大金额范围内（如果有的话）
    if (tariffRule.min !== undefined && tariffRule.max !== undefined) {
      const minFee = tariffRule.min / 100;
      const maxFee = tariffRule.max / 100;
      if (fee < minFee) {
        fee = minFee;
      } else if (fee > maxFee) {
        fee = maxFee;
      }
    }
    // 转回分
    return Math.round(fee * 100);
  };
  // 判断是否显示关税服务
  const shippingShouldShowTariff = (): boolean => {
    if (!shippingTariffInfo || !selectedShippingChannel) {
      return false;
    }
    return (
      shippingTariffInfo.enabled === 1 &&
      shippingTariffInfo.enabled_line_ids.includes(selectedShippingChannel.id)
    );
  };
  // 判断是否强制选择关税
  const shippingIsTariffForced = (): boolean => {
    if (
      !shippingTariffInfo ||
      !selectedShippingChannel ||
      shippingTotalPackageValue === 0
    ) {
      return false;
    }
    const totalValueInYuan = shippingTotalPackageValue / 100;
    const sortedRules = [...shippingTariffInfo.data].sort(
      (a, b) => b.threshold - a.threshold,
    );
    const tariffRule = sortedRules.find(
      (rule) => totalValueInYuan > rule.threshold / 100,
    );
    return tariffRule?.enforce === 1;
  };
  // 获取保险服务的 remark
  const shippingGetInsuranceRemark = (): string => {
    if (
      !shippingInsuranceInfo ||
      !selectedShippingChannel ||
      shippingTotalPackageValue === 0
    ) {
      return shippingInsuranceInfo?.explanation || "";
    }
    const totalValueInYuan = shippingTotalPackageValue / 100;
    const threshold = shippingInsuranceInfo.data[0]?.start / 100 || 0;
    const insuranceRule =
      totalValueInYuan <= threshold
        ? shippingInsuranceInfo.data[0]
        : shippingInsuranceInfo.data[1];
    return insuranceRule?.remark || shippingInsuranceInfo.explanation || "";
  };
  // 获取关税服务的 remark
  const shippingGetTariffRemark = (): string => {
    if (
      !shippingTariffInfo ||
      !selectedShippingChannel ||
      shippingTotalPackageValue === 0
    ) {
      return shippingTariffInfo?.explanation || "";
    }
    const totalValueInYuan = shippingTotalPackageValue / 100;
    const sortedRules = [...shippingTariffInfo.data].sort(
      (a, b) => b.threshold - a.threshold,
    );
    const tariffRule = sortedRules.find(
      (rule) => totalValueInYuan > rule.threshold / 100,
    );
    return tariffRule?.remark || shippingTariffInfo.explanation || "";
  };
  // 打开选择弹窗
  const shippingHandleOpenModal = () => {
    shippingSetTempSelectedChannel(selectedShippingChannel);
    shippingSetIsModalOpen(true);
  };
  const shippingOpenChannelDetail = (
    channel: ShippingChannel,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    shippingSetChannelDetailFallback({
      name: channel.name,
      description: channel.quote.description,
      reference_time: channel.reference_time,
      price: shippingPriceLabel(channel.quote),
      remark: channel.quote.restrictions,
    });
    shippingSetChannelDetailOpen(true);
  };
  // 确认选择（PC端）
  const shippingHandleConfirm = () => {
    if (shippingTempSelectedChannel) {
      setSelectedShippingChannel(shippingTempSelectedChannel);
      shippingSetIsModalOpen(false);
    }
  };
  // 直接选择（H5端）
  const shippingHandleSelectChannel = (channel: ShippingChannel) => {
    setSelectedShippingChannel(channel);
    shippingSetIsModalOpen(false);
  };
  // 提交包裹
  const submissionMounted = useHydrated();
  const [submissionSubmitting, submissionSetSubmitting] = useState(false);
  const submissionContainerRef = useRef<HTMLDivElement>(null);
  const [submissionContainerWidth, submissionSetContainerWidth] = useState<
    number | null
  >(null);
  const [submissionContainerLeft, submissionSetContainerLeft] = useState<
    number | null
  >(null);
  const submissionRouter = useRouter();
  const submissionSubmittedParcels = itemsSubmittedParcels;
  const submissionAttempt = useRef<{ body: string; key: string }>(null);
  const submissionPending = useRef(false);
  // 计算容器宽度和位置
  useEffect(() => {
    if (!submissionMounted) return;
    const updateContainerPosition = () => {
      if (submissionContainerRef.current) {
        const rect = submissionContainerRef.current.getBoundingClientRect();
        submissionSetContainerWidth(rect.width);
        submissionSetContainerLeft(rect.left);
      }
    };
    updateContainerPosition();
    window.addEventListener("resize", updateContainerPosition);
    window.addEventListener("scroll", updateContainerPosition);
    return () => {
      window.removeEventListener("resize", updateContainerPosition);
      window.removeEventListener("scroll", updateContainerPosition);
    };
  }, [submissionMounted]);
  // 处理提交
  const submissionHandleSubmit = async () => {
    // 验证必要数据
    if (!selectedAddress) {
      toast.error(t("Please select a shipping address"));
      return;
    }
    if (
      !submissionSubmittedParcels ||
      submissionSubmittedParcels.length === 0
    ) {
      toast.error(t("Please select at least one parcel"));
      return;
    }
    if (!selectedShippingChannel) {
      toast.error(t("Please select a shipping channel"));
      return;
    }
    if (submissionPending.current) return;
    if (!session) {
      submissionRouter.push(
        purchaseLoginHref(window.location.pathname + window.location.search),
      );
      return;
    }
    if (shippingPackageIds.length !== submittedParcels.length) {
      toast.error(t("Please select at least one parcel"));
      return;
    }
    if (
      selectedShippingChannel.addressId !== selectedAddress.id ||
      (selectedShippingChannel.expiresAt &&
        Date.parse(selectedShippingChannel.expiresAt) <= Date.now())
    ) {
      setSelectedShippingChannel(null);
      shippingSetChannels([]);
      setQuotedAddressId(undefined);
      setQuoteRevision((version) => version + 1);
      toast.error(shippingTranslateUi("Checkout expired"));
      return;
    }
    const packingNote = vip_remark.trim();
    const input: ProcurementShipmentInput = {
      addressId: selectedAddress.id,
      packageIds: shippingPackageIds,
      quoteId: selectedShippingChannel.quoteId,
      routeCode: selectedShippingChannel.quote.routeCode,
      packingInstruction: packingNote
        ? "Other instructions"
        : "Keep original seller packaging",
      packingNote: packingNote || undefined,
    };
    const body = JSON.stringify(input);
    if (submissionAttempt.current?.body !== body) {
      submissionAttempt.current = { body, key: crypto.randomUUID() };
    }
    submissionPending.current = true;
    submissionSetSubmitting(true);
    try {
      await createProcurementShipment(input, submissionAttempt.current.key);
      toast.success(t("Created successfully"));
      clearSubmittedParcels();
      submissionRouter.replace("/member-center/shipments");
    } catch (error: unknown) {
      console.error("创建订单失败:", error);
      // 显示错误信息
      const errorMessage =
        getErrorMessage(error) || t("Order creation failed please try again");
      toast.error(errorMessage);
    } finally {
      submissionPending.current = false;
      submissionSetSubmitting(false);
    }
  };
  const addressContent = (() => {
    if (!addressMounted) {
      return (
        <Section className="px-2">
          {
            <div
              className="rounded-lg bg-white py-3"
              style={{
                marginTop: `${addressMarginTop}px`,
                marginBottom: `${addressMarginBottom}px`,
              }}
            >
              <div className="space-y-2 px-4">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
          }
        </Section>
      );
    }
    const addressIsComplete = addressIsAddressComplete(addressAddress);
    const addressIsDefault = Boolean(addressAddress?.is_default);
    const addressLines = addressAddress
      ? formatAddressLines(addressAddress.source)
      : [];
    return (
      <Section className="px-2">
        {
          <>
            <div
              className="rounded-lg bg-white py-3"
              style={{
                marginTop: `${addressMarginTop}px`,
                marginBottom: `${addressMarginBottom}px`,
              }}
            >
              <h3 className="border-border mb-3 flex items-center gap-2 border-b px-4 pb-3 text-base font-bold">
                <span className="bg-primary/10 text-primary rounded-lg p-1.5">
                  <MapPin className="size-4 shrink-0" />
                </span>
                <span>{t("Shipping address")}</span>
              </h3>

              <div className="px-4">
                {addressLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-1/3" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-full" />
                  </div>
                ) : addressAddress?.id ? (
                  <div className="border-border border-s-primary overflow-hidden rounded-lg border border-s-4">
                    <div className="space-y-2 ps-3 pe-4 pt-3 pb-2.5 md:ps-5">
                      <p className="flex items-center gap-2 font-bold">
                        <span className="text-sm">
                          {addressAddress.receiver_name}
                        </span>
                        {addressIsDefault && (
                          <span className="bg-primary rounded-full px-1.5 py-0.5 text-[10px] text-white uppercase">
                            {t("Default")}
                          </span>
                        )}
                        <span className="flex-1" />
                        <button
                          type="button"
                          className="border-border hover:border-primary/20 hover:bg-primary/20 hover:text-primary flex h-6.5 w-6.5 items-center justify-center rounded-md border text-gray-400 transition-all"
                          onClick={addressOpenEditAddressForm}
                        >
                          <Pencil className="size-4" />
                        </button>
                      </p>
                      <p className="flex items-start gap-2 text-xs text-[#5A5A5A]">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-gray-400" />
                        <span className="min-w-0">
                          {addressLines.length > 0
                            ? addressLines.map((line, index) => (
                                <span
                                  key={`${line}-${index}`}
                                  className="block break-words"
                                >
                                  {line}
                                </span>
                              ))
                            : t("Incomplete address")}
                        </span>
                      </p>
                      {addressAddress.phone && (
                        <p className="flex items-center gap-2 text-xs text-[#5A5A5A]">
                          <Phone className="size-4 shrink-0 text-gray-400" />
                          <bdi dir="ltr">
                            +
                            {addressMaskPhone(
                              addressAddress.timezone,
                              String(addressAddress.phone),
                            )}
                          </bdi>
                        </p>
                      )}
                      {!addressIsComplete && (
                        <div className="text-primary flex items-start gap-2 pt-1 text-xs">
                          <AlertCircle className="mt-0.5 size-4 shrink-0" />
                          <span>
                            {t(
                              "Please complete the shipping address to avoid delays in shipment",
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="border-border flex items-center justify-end gap-3 border-t bg-[#F5F6F7] py-2 ps-5 pe-4 text-xs">
                      <button
                        type="button"
                        onClick={addressOpenAddAddressForm}
                        className="hover:bg-primary/10 hover:text-primary flex items-center gap-1 rounded-md bg-transparent px-2 py-0.5 font-medium text-gray-600"
                      >
                        <Plus className="size-3" />
                        {t("Add")}
                      </button>
                      <button
                        type="button"
                        onClick={() => addressSetIsModalOpen(true)}
                        className="group bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition-all hover:scale-105"
                      >
                        {t("Change address")}
                        <ChevronRight className="size-3 transition-all group-hover:translate-x-1" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="border-border hover:border-primary/40 hover:bg-primary/5 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3 transition-colors"
                    onClick={() => addressSetIsModalOpen(true)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        addressSetIsModalOpen(true);
                      }
                    }}
                  >
                    <div className="hover:text-primary flex items-center gap-2 text-sm text-gray-500 transition-colors">
                      <MapPin className="size-4 shrink-0 text-gray-400" />
                      <span>{t("Please select shipping address")}</span>
                    </div>
                    <div className="shrink-0">
                      <button
                        type="button"
                        onClick={addressOpenAddAddressForm}
                        className="hover:bg-primary/10 hover:text-primary flex items-center gap-1 rounded-md bg-transparent px-2 py-1 font-medium text-gray-600"
                      >
                        <Plus className="size-3" />
                        {t("Add")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <AddressSelectDialog
              open={addressIsModalOpen}
              onOpenChange={addressSetIsModalOpen}
              selectedId={addressAddress?.id}
              title={t("Shipping address")}
              emptyListText={t("No saved addresses")}
              defaultAddressText={t("Default")}
              loadErrorFallbackText={t("Failed to load addresses")}
              addresses={addressOptions}
              loading={addresses.loading}
              error={addresses.error}
              onConfirm={(item) => {
                const address = addressOptions.find(({ id }) => id === item.id);
                if (address) addressApplyAddress(address);
              }}
              onEdit={(item) => {
                const address = addressOptions.find(({ id }) => id === item.id);
                if (!address) return;
                addressSetIsModalOpen(false);
                addressSetAddressFormMode("edit");
                addressSetEditingAddressData(address);
                addressSetAddressFormModalOpen(true);
              }}
            />

            <AddressFormModal
              open={addressAddressFormModalOpen}
              onOpenChange={(open) => {
                addressSetAddressFormModalOpen(open);
                if (!open) addressSetEditingAddressData(null);
              }}
              mode={addressAddressFormMode}
              editingId={
                addressAddressFormMode === "edit" &&
                addressEditingAddressData?.id
                  ? String(addressEditingAddressData.id)
                  : null
              }
              initialData={
                addressEditingAddressData && {
                  ...addressEditingAddressData,
                  id: undefined,
                }
              }
              onSubmit={async (params) => {
                const existing = addressEditingAddressData?.source;
                const countryCode = String(params.country_id);
                const state = params.province?.trim() || "";
                const saved = await saveProcurementAddress(
                  {
                    firstName: params.firstName.trim(),
                    lastName: params.lastName.trim(),
                    phoneCode: params.timezone.replace(/^00/, "+"),
                    phone: params.phone,
                    countryCode,
                    state,
                    regionCode: params.regionCode,
                    city: params.city,
                    postalCode: params.postcode,
                    addressLine1: params.street,
                    addressLine2: params.addressLine2,
                    district: existing?.district ?? undefined,
                    email: existing?.email ?? undefined,
                    company: existing?.company ?? undefined,
                    isDefault: params.is_default === 1,
                  },
                  existing?.id,
                );
                addressApplyAddress(addressView(saved));
                addresses.reload();
                toast.success(
                  existing ? t("Address updated") : t("Address added"),
                );
              }}
            />
          </>
        }
      </Section>
    );
  })();
  const itemsContent = (() => {
    // 确保只在客户端挂载后渲染
    // 避免 hydration mismatch
    if (!itemsMounted) {
      return (
        <Section className="px-2">
          <ItemsParcelListSkeleton />
        </Section>
      );
    }
    const itemsParcels = itemsSubmittedParcels;
    if (itemsParcels.length === 0) {
      return (
        <Section className="px-2">
          {
            <div className="mt-4 rounded-lg bg-gray-100 md:bg-white md:p-4">
              <div className="py-12 text-center">
                <div className="text-gray-500">{t("No parcel data")}</div>
              </div>
            </div>
          }
        </Section>
      );
    }
    return (
      <Section className="px-2">
        {
          <div className="mt-4 rounded-lg bg-gray-100 md:bg-white md:p-4">
            {/* 大屏幕：表格头部 */}
            <div className="mb-4 hidden gap-4 rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-gray-600 md:grid md:grid-cols-4">
              <div>{t("Product Details")}</div>
              <div>{t("Weight(g)")}</div>
              <div>{t("Dimension(cm)")}</div>
              <div>{t("Attributes")}</div>
            </div>

            {/* 大屏幕：包裹列表 */}
            <div className="hidden space-y-4 md:block">
              {itemsParcels.map((parcel) => {
                const details = parcel.details || [];
                const isExpanded = itemsExpandedParcels.has(parcel.id);
                const hasMultipleItems = details.length > 1;
                return (
                  <div
                    key={parcel.id}
                    className="rounded-lg border border-gray-200 p-4 transition-shadow hover:shadow-md"
                  >
                    {/* 第一行：包裹号和复制按钮 */}
                    <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">
                          {parcel.express_num || "—"}
                        </span>
                        {parcel.express_num && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              itemsHandleCopyExpressNum(parcel.express_num!);
                            }}
                            className="text-gray-400 transition-colors hover:text-gray-600"
                            title={t("Copy parcel number")}
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 分隔线下面的内容 */}
                    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-4">
                      {/* Product Details */}
                      <div className="md:col-span-1">
                        <div className="space-y-2">
                          {details.length === 0 ? (
                            <div className="flex items-start gap-2">
                              <div className="h-16 w-16 shrink-0">
                                <img
                                  src="/assets/images/package/package.png"
                                  alt={t("Parcel")}
                                  className="h-full w-full rounded border border-gray-200 object-cover"
                                  onError={(e) => {
                                    (
                                      e.target as HTMLImageElement
                                    ).style.display = "none";
                                    (
                                      e.target as HTMLImageElement
                                    ).parentElement!.innerHTML =
                                      `<div class="w-full h-full bg-gray-100 rounded border border-gray-200 flex items-center justify-center"><span class="text-xs text-gray-400">${t("No Image")}</span></div>`;
                                  }}
                                />
                              </div>
                              <div className="flex-1 text-sm text-gray-700">
                                {parcel.package_name || t("Package")}
                              </div>
                            </div>
                          ) : (
                            <>
                              {/* 显示第一个 detail */}
                              {details.length > 0 && (
                                <div className="flex items-start gap-2">
                                  <div className="h-16 w-16 shrink-0">
                                    {details[0].full_path_images &&
                                    details[0].full_path_images.length > 0 ? (
                                      <img
                                        src={details[0].full_path_images[0]}
                                        alt={details[0].name || t("Package")}
                                        className="h-full w-full rounded border border-gray-200 object-cover"
                                        onError={(e) => {
                                          (
                                            e.target as HTMLImageElement
                                          ).style.display = "none";
                                          const parent = (
                                            e.target as HTMLImageElement
                                          ).parentElement;
                                          if (
                                            parent &&
                                            !parent.querySelector(
                                              ".error-placeholder",
                                            )
                                          ) {
                                            parent.innerHTML = `<div class="w-full h-full bg-gray-100 rounded border border-gray-200 flex items-center justify-center error-placeholder"><span class="text-xs text-gray-400">${t("No Image")}</span></div>`;
                                          }
                                        }}
                                      />
                                    ) : details[0].images &&
                                      details[0].images.length > 0 ? (
                                      <img
                                        src={details[0].images[0]}
                                        alt={details[0].name || t("Package")}
                                        className="h-full w-full rounded border border-gray-200 object-cover"
                                        onError={(e) => {
                                          (
                                            e.target as HTMLImageElement
                                          ).style.display = "none";
                                          const parent = (
                                            e.target as HTMLImageElement
                                          ).parentElement;
                                          if (
                                            parent &&
                                            !parent.querySelector(
                                              ".error-placeholder",
                                            )
                                          ) {
                                            parent.innerHTML = `<div class="w-full h-full bg-gray-100 rounded border border-gray-200 flex items-center justify-center error-placeholder"><span class="text-xs text-gray-400">${t("No Image")}</span></div>`;
                                          }
                                        }}
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center rounded border border-gray-200 bg-gray-100">
                                        <span className="text-xs text-gray-400">
                                          {t("No Image")}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="line-clamp-2 flex-1 text-sm text-gray-700">
                                    {details[0].name ||
                                      parcel.package_name ||
                                      t("Unnamed product")}
                                  </div>
                                </div>
                              )}
                              {/* 展开的其他 details */}
                              {isExpanded && details.length > 1 && (
                                <div className="space-y-2 pt-2">
                                  {details.slice(1).map((detail, idx) => (
                                    <div
                                      key={detail.id || idx}
                                      className="flex items-start gap-2"
                                    >
                                      <div className="h-16 w-16 shrink-0">
                                        {detail.full_path_images &&
                                        detail.full_path_images.length > 0 ? (
                                          <img
                                            src={detail.full_path_images[0]}
                                            alt={detail.name || t("Package")}
                                            className="h-full w-full rounded border border-gray-200 object-cover"
                                            onError={(e) => {
                                              (
                                                e.target as HTMLImageElement
                                              ).style.display = "none";
                                              const parent = (
                                                e.target as HTMLImageElement
                                              ).parentElement;
                                              if (
                                                parent &&
                                                !parent.querySelector(
                                                  ".error-placeholder",
                                                )
                                              ) {
                                                parent.innerHTML = `<div class="w-full h-full bg-gray-100 rounded border border-gray-200 flex items-center justify-center error-placeholder"><span class="text-xs text-gray-400">${t("No Image")}</span></div>`;
                                              }
                                            }}
                                          />
                                        ) : detail.images &&
                                          detail.images.length > 0 ? (
                                          <img
                                            src={detail.images[0]}
                                            alt={detail.name || t("Package")}
                                            className="h-full w-full rounded border border-gray-200 object-cover"
                                            onError={(e) => {
                                              (
                                                e.target as HTMLImageElement
                                              ).style.display = "none";
                                              const parent = (
                                                e.target as HTMLImageElement
                                              ).parentElement;
                                              if (
                                                parent &&
                                                !parent.querySelector(
                                                  ".error-placeholder",
                                                )
                                              ) {
                                                parent.innerHTML = `<div class="w-full h-full bg-gray-100 rounded border border-gray-200 flex items-center justify-center error-placeholder"><span class="text-xs text-gray-400">${t("No Image")}</span></div>`;
                                              }
                                            }}
                                          />
                                        ) : (
                                          <div className="flex h-full w-full items-center justify-center rounded border border-gray-200 bg-gray-100">
                                            <span className="text-xs text-gray-400">
                                              {t("No Image")}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                      <div className="line-clamp-2 flex-1 text-sm text-gray-700">
                                        {detail.name || t("Unnamed product")}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* multiple Item 按钮 */}
                              {hasMultipleItems && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    itemsToggleExpand(parcel.id);
                                  }}
                                  className="flex shrink-0 cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs whitespace-nowrap transition-colors"
                                  style={{
                                    backgroundColor: "rgba(22, 119, 255, 0.1)",
                                    color: "#1677FF",
                                  }}
                                >
                                  <span>
                                    {isExpanded
                                      ? t("Collapse")
                                      : t("multiple Item")}
                                  </span>
                                  <ChevronDown
                                    className="h-3 w-3"
                                    style={{
                                      color: "#1677FF",
                                      transform: isExpanded
                                        ? "rotate(180deg)"
                                        : "rotate(0deg)",
                                      transition: "transform 0.2s",
                                    }}
                                  />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Weight */}
                      <div className="md:col-span-1">
                        <div className="text-sm" style={{ paddingTop: "20px" }}>
                          {parcel.package_weight
                            ? itemsFormatWeight(parcel.package_weight)
                            : "—"}
                        </div>
                      </div>

                      {/* Dimension */}
                      <div className="md:col-span-1">
                        <div className="text-sm" style={{ paddingTop: "20px" }}>
                          {parcel.length && parcel.width && parcel.height
                            ? itemsFormatDimension(
                                parcel.length,
                                parcel.width,
                                parcel.height,
                              )
                            : "—"}
                        </div>
                      </div>

                      {/* Attributes */}
                      <div className="md:col-span-1">
                        <div style={{ paddingTop: "16px" }}>
                          {parcel.prop && parcel.prop.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {parcel.prop.map((p) => (
                                <span
                                  key={p.id}
                                  className="bg-primary/10 text-primary rounded px-2 py-1 text-xs"
                                >
                                  {p.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 小屏幕：包裹列表 */}
            <div className="space-y-4 md:hidden">
              {itemsParcels.map((parcel) => {
                const details = parcel.details || [];
                const isExpanded = itemsExpandedParcels.has(parcel.id);
                const hasMultipleItems = details.length > 1;
                return (
                  <div
                    key={parcel.id}
                    className="space-y-4 rounded-lg bg-white p-4"
                  >
                    {/* 包裹号和复制按钮 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">
                          {parcel.express_num || "—"}
                        </span>
                        {parcel.express_num && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              itemsHandleCopyExpressNum(parcel.express_num!);
                            }}
                            className="text-gray-400 transition-colors hover:text-gray-600"
                            title={t("Copy parcel number")}
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 包裹信息区域 */}
                    <div className="space-y-4">
                      {details.length === 0 ? (
                        <div className="flex gap-4">
                          <div className="h-24 w-24 shrink-0">
                            <img
                              src="/assets/images/package/package.png"
                              alt={t("Parcel")}
                              className="h-full w-full rounded border border-gray-200 object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                                (
                                  e.target as HTMLImageElement
                                ).parentElement!.innerHTML =
                                  `<div class="w-full h-full bg-gray-100 rounded border border-gray-200 flex items-center justify-center"><span class="text-xs text-gray-400">${t("No Image")}</span></div>`;
                              }}
                            />
                          </div>
                          <div className="flex-1 space-y-2">
                            <div className="text-sm text-gray-700">
                              {parcel.package_name || t("Package")}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* 第一个 detail */}
                          {details.length > 0 && (
                            <div className="flex gap-4">
                              <div className="h-24 w-24 shrink-0">
                                {details[0].full_path_images &&
                                details[0].full_path_images.length > 0 ? (
                                  <img
                                    src={details[0].full_path_images[0]}
                                    alt={details[0].name || t("Package")}
                                    className="h-full w-full rounded border border-gray-200 object-cover"
                                    onError={(e) => {
                                      (
                                        e.target as HTMLImageElement
                                      ).style.display = "none";
                                      const parent = (
                                        e.target as HTMLImageElement
                                      ).parentElement;
                                      if (
                                        parent &&
                                        !parent.querySelector(
                                          ".error-placeholder",
                                        )
                                      ) {
                                        parent.innerHTML = `<div class="w-full h-full bg-gray-100 rounded border border-gray-200 flex items-center justify-center error-placeholder"><span class="text-xs text-gray-400">${t("No Image")}</span></div>`;
                                      }
                                    }}
                                  />
                                ) : details[0].images &&
                                  details[0].images.length > 0 ? (
                                  <img
                                    src={details[0].images[0]}
                                    alt={details[0].name || t("Package")}
                                    className="h-full w-full rounded border border-gray-200 object-cover"
                                    onError={(e) => {
                                      (
                                        e.target as HTMLImageElement
                                      ).style.display = "none";
                                      const parent = (
                                        e.target as HTMLImageElement
                                      ).parentElement;
                                      if (
                                        parent &&
                                        !parent.querySelector(
                                          ".error-placeholder",
                                        )
                                      ) {
                                        parent.innerHTML = `<div class="w-full h-full bg-gray-100 rounded border border-gray-200 flex items-center justify-center error-placeholder"><span class="text-xs text-gray-400">${t("No Image")}</span></div>`;
                                      }
                                    }}
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center rounded border border-gray-200 bg-gray-100">
                                    <span className="text-xs text-gray-400">
                                      {t("No Image")}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 space-y-2">
                                <div className="line-clamp-2 text-sm text-gray-700">
                                  {details[0].name ||
                                    parcel.package_name ||
                                    t("Unnamed product")}
                                </div>
                                {details[0].spec && (
                                  <div className="text-xs text-gray-500">
                                    {details[0].spec}
                                  </div>
                                )}
                                <div className="text-xs text-gray-500">
                                  x{details[0].qty}
                                </div>
                              </div>
                            </div>
                          )}
                          {/* 展开的其他 details */}
                          {isExpanded && details.length > 1 && (
                            <>
                              {details.slice(1).map((detail, idx) => (
                                <div
                                  key={detail.id || idx}
                                  className="flex gap-4"
                                >
                                  <div className="h-24 w-24 shrink-0">
                                    {detail.full_path_images &&
                                    detail.full_path_images.length > 0 ? (
                                      <img
                                        src={detail.full_path_images[0]}
                                        alt={detail.name || t("Package")}
                                        className="h-full w-full rounded border border-gray-200 object-cover"
                                        onError={(e) => {
                                          (
                                            e.target as HTMLImageElement
                                          ).style.display = "none";
                                          const parent = (
                                            e.target as HTMLImageElement
                                          ).parentElement;
                                          if (
                                            parent &&
                                            !parent.querySelector(
                                              ".error-placeholder",
                                            )
                                          ) {
                                            parent.innerHTML = `<div class="w-full h-full bg-gray-100 rounded border border-gray-200 flex items-center justify-center error-placeholder"><span class="text-xs text-gray-400">${t("No Image")}</span></div>`;
                                          }
                                        }}
                                      />
                                    ) : detail.images &&
                                      detail.images.length > 0 ? (
                                      <img
                                        src={detail.images[0]}
                                        alt={detail.name || t("Package")}
                                        className="h-full w-full rounded border border-gray-200 object-cover"
                                        onError={(e) => {
                                          (
                                            e.target as HTMLImageElement
                                          ).style.display = "none";
                                          const parent = (
                                            e.target as HTMLImageElement
                                          ).parentElement;
                                          if (
                                            parent &&
                                            !parent.querySelector(
                                              ".error-placeholder",
                                            )
                                          ) {
                                            parent.innerHTML = `<div class="w-full h-full bg-gray-100 rounded border border-gray-200 flex items-center justify-center error-placeholder"><span class="text-xs text-gray-400">${t("No Image")}</span></div>`;
                                          }
                                        }}
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center rounded border border-gray-200 bg-gray-100">
                                        <span className="text-xs text-gray-400">
                                          {t("No Image")}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <div className="line-clamp-2 text-sm text-gray-700">
                                      {detail.name || t("Unnamed product")}
                                    </div>
                                    {detail.spec && (
                                      <div className="text-xs text-gray-500">
                                        {detail.spec}
                                      </div>
                                    )}
                                    <div className="text-xs text-gray-500">
                                      x{detail.qty}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </>
                          )}
                          {/* multiple Item 按钮 */}
                          {hasMultipleItems && (
                            <div>
                              <button
                                onClick={() => itemsToggleExpand(parcel.id)}
                                className="flex shrink-0 cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs whitespace-nowrap transition-colors"
                                style={{
                                  backgroundColor: "rgba(22, 119, 255, 0.1)",
                                  color: "#1677FF",
                                }}
                              >
                                <span>
                                  {isExpanded
                                    ? t("Collapse")
                                    : t("multiple Item")}
                                </span>
                                <ChevronDown
                                  className="h-3 w-3"
                                  style={{
                                    color: "#1677FF",
                                    transform: isExpanded
                                      ? "rotate(180deg)"
                                      : "rotate(0deg)",
                                    transition: "transform 0.2s",
                                  }}
                                />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* 其他信息 */}
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600">
                            {t("Weight:")}
                          </span>
                          <span className="text-xs text-gray-900">
                            {parcel.package_weight
                              ? itemsFormatWeight(parcel.package_weight)
                              : "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600">
                            {t("Dimension:")}
                          </span>
                          <span className="text-xs text-gray-900">
                            {parcel.length && parcel.width && parcel.height
                              ? itemsFormatDimension(
                                  parcel.length,
                                  parcel.width,
                                  parcel.height,
                                )
                              : "—"}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {parcel.prop && parcel.prop.length > 0 ? (
                          parcel.prop.map((p) => (
                            <span
                              key={p.id}
                              className="bg-primary/10 text-primary rounded px-2 py-1 text-xs"
                            >
                              {p.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-500">—</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        }
      </Section>
    );
  })();
  const packingContent = (() => {
    // 避免 hydration mismatch
    if (!packingMounted) {
      return (
        <Section className="px-2">
          {
            <div
              className="rounded-lg bg-white p-4 md:p-6"
              style={{
                marginTop: `${packingMarginTop}px`,
                marginBottom: `${packingMarginBottom}px`,
              }}
            >
              <div className="flex items-center justify-center py-8">
                <Spinner />
              </div>
            </div>
          }
        </Section>
      );
    }
    return (
      <Section className="px-2">
        {
          <div
            className="rounded-lg bg-white p-4 md:p-4"
            style={{
              marginTop: `${packingMarginTop}px`,
              marginBottom: `${packingMarginBottom}px`,
            }}
          >
            {/* 标题 */}
            <h3 className="mb-4 text-base font-semibold text-gray-900 md:text-lg">
              {t("Packing Services")}
            </h3>

            {packingLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner />
              </div>
            ) : packingServices.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                <p>
                  {t("There are no value-added services for the time being")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 服务列表 */}
                {packingServices.map((service) => {
                  const isSelected = add_service.includes(service.id);
                  return (
                    <div
                      key={service.id}
                      className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
                        isSelected
                          ? "border-[#FF5B00] bg-orange-50"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                      onClick={() => packingToggleService(service.id)}
                    >
                      {/* 服务名称 */}
                      <span className="flex-1 text-sm font-medium text-gray-900 md:text-base">
                        {service.name}
                      </span>

                      {/* 价格和复选框 */}
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-900 md:text-base">
                          <bdi dir="ltr">
                            {packingPriceConvert(service.price, {
                              needFormat: true,
                            })}
                          </bdi>
                        </span>
                        <div
                          className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                            isSelected
                              ? "border-[#FF5B00] bg-[#FF5B00]"
                              : "border-gray-300 bg-white"
                          }`}
                        >
                          {isSelected && (
                            <Check className="h-3 w-3 text-white" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* 备注输入框 */}
                <div className="mt-4">
                  <textarea
                    value={vip_remark}
                    onChange={(e) => setVipRemark(e.target.value)}
                    placeholder={t("Remark")}
                    className="focus:ring-opacity-20 w-full resize-none rounded-lg border-0 bg-gray-100 p-3 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-[#FF5B00] focus:outline-none"
                    rows={4}
                  />
                </div>
              </div>
            )}
          </div>
        }
      </Section>
    );
  })();
  const shippingContent = (() => {
    if (!selectedAddress) return null;
    // 避免 hydration mismatch
    if (!shippingMounted) {
      return (
        <Section className="px-2">
          {
            <div
              className="rounded-lg bg-white p-4"
              style={{
                marginTop: `${shippingMarginTop}px`,
                marginBottom: `${shippingMarginBottom}px`,
              }}
            >
              <h3 className="mb-4 text-base font-semibold text-gray-900 md:text-lg">
                {t("Shipping Type")}
              </h3>
              <ShippingChannelSkeleton />
            </div>
          }
        </Section>
      );
    }
    // 渠道列表内容
    const shippingChannelListContent = (
      <div className="space-y-3">
        {shippingChannels.map((channel) => {
          // 弹窗内只按临时选中高亮；勿再并上 selectedShippingChannel，否则 PC 端点选新渠道后旧渠道仍会高亮
          const isSelected = shippingTempSelectedChannel?.id === channel.id;
          return (
            <div
              key={channel.id}
              className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                isSelected
                  ? "border-[#FF5B00] bg-orange-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
              onClick={() => {
                if (shippingIsMobile) {
                  shippingHandleSelectChannel(channel);
                } else {
                  shippingSetTempSelectedChannel(channel);
                }
              }}
            >
              <div className="flex items-start gap-3">
                {/* 渠道图标 */}
                {channel.icon?.icon ? (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-yellow-100">
                    <ShippingChannelIcon
                      src={channel.icon.icon}
                      alt={channel.icon.name || channel.name}
                      className="h-10 w-10 object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-100">
                    <Truck className="h-6 w-6 text-[#FF5B00]" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  {/* 渠道名称 */}
                  <div className="mb-1 font-semibold text-gray-900">
                    {channel.name || channel.cn_name || channel.en_name || "—"}
                  </div>

                  {/* 服务标签 */}
                  <div className="mb-2 flex flex-wrap gap-2">
                    <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                      {t("Freight")}
                    </span>
                    {channel.expire_fee && channel.expire_fee > 0 && (
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                        {t("Free assurance")}
                      </span>
                    )}
                  </div>

                  {/* 运费 */}
                  <div className="mb-1 text-sm text-gray-900">
                    {t("Shipping Fee")}{" "}
                    <span className="font-semibold text-[#FF5B00]">
                      <bdi dir="ltr">{shippingPriceLabel(channel.quote)}</bdi>
                    </span>
                  </div>

                  {/* 运输时间 */}
                  {channel.reference_time && (
                    <div className="mb-1 text-xs text-gray-600">
                      {t("Transit time:")} {channel.reference_time}
                    </div>
                  )}

                  {/* 货物类型 */}
                  {channel.props && channel.props.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {channel.props.map((prop) => (
                        <span
                          key={prop.id}
                          className="rounded px-2 py-0.5 text-xs"
                          style={{
                            backgroundColor:
                              prop.color || "rgba(255, 91, 0, 0.1)",
                            color: prop.font_color || "#FF5B00",
                          }}
                        >
                          {prop.name || prop.prop_name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Channel details currently only combine list fields and are incomplete; hidden until the API returns full details. */}
                <button
                  type="button"
                  className="-me-1 hidden shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  aria-label={t("Channel details")}
                  onClick={(e) => shippingOpenChannelDetail(channel, e)}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
    return (
      <Section className="px-2">
        {
          <>
            <div
              className="rounded-lg bg-white p-4 md:p-6"
              style={{
                marginTop: `${shippingMarginTop}px`,
                marginBottom: `${shippingMarginBottom}px`,
              }}
            >
              {/* 标题 */}
              <h3 className="mb-4 text-base font-semibold text-gray-900 md:text-lg">
                {t("Shipping Type")}
              </h3>

              {shippingLoading ? (
                <ShippingChannelSkeleton />
              ) : !selectedShippingChannel ? (
                <div className="py-8 text-center text-gray-500">
                  <p>{t("Please select the address and parcel first")}</p>
                </div>
              ) : (
                <div
                  className="cursor-pointer rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300"
                  onClick={shippingHandleOpenModal}
                >
                  <div className="flex items-center gap-3">
                    {/* 渠道图标 */}
                    {selectedShippingChannel.icon?.icon ? (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-yellow-100">
                        <ShippingChannelIcon
                          src={selectedShippingChannel.icon.icon}
                          alt={
                            selectedShippingChannel.icon.name ||
                            selectedShippingChannel.name
                          }
                          className="h-10 w-10 object-contain"
                        />
                      </div>
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-100">
                        <Truck className="h-6 w-6 text-[#FF5B00]" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="mb-1 font-semibold text-gray-900">
                        {selectedShippingChannel.name ||
                          selectedShippingChannel.cn_name ||
                          t("Choose express")}
                      </div>
                      <div className="text-xs text-gray-600">
                        <div>
                          {t("Shipping Fee")}{" "}
                          <span className="font-semibold text-[#FF5B00]">
                            <bdi dir="ltr">
                              {shippingPriceLabel(
                                selectedShippingChannel.quote,
                              )}
                            </bdi>
                          </span>
                        </div>
                        {selectedShippingChannel.reference_time && (
                          <div>
                            {t("Transit time:")}{" "}
                            {selectedShippingChannel.reference_time}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center text-gray-400">
                      <span className="text-xs">
                        {shippingTranslateUi.raw("more")}
                      </span>
                      <ChevronRight className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              )}

              {/* 保险服务 */}
              {shippingShouldShowInsurance() && (
                <div className="mt-4 flex items-center gap-2">
                  <Checkbox
                    checked={is_insurance === 1}
                    onCheckedChange={(checked) => {
                      if (!shippingIsInsuranceForced()) {
                        setIsInsurance(checked ? 1 : 0);
                      }
                    }}
                    disabled={shippingIsInsuranceForced()}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-gray-700">
                    {t("Insurance service")}
                  </span>
                  <HelpCircle
                    className="h-4 w-4 cursor-pointer text-gray-400 hover:text-gray-600"
                    onClick={() => shippingSetShowInsuranceRemark(true)}
                  />
                  <span className="ms-auto text-sm text-gray-600">
                    CNY{" "}
                    <bdi dir="ltr">
                      {shippingPriceConvert(shippingCalculateInsuranceFee(), {
                        needFormat: true,
                        showSymbol: false,
                      })}
                    </bdi>
                  </span>
                </div>
              )}

              {/* 关税服务 */}
              {shippingShouldShowTariff() && (
                <div className="mt-4 flex items-center gap-2">
                  <Checkbox
                    checked={is_tariff === 1}
                    onCheckedChange={(checked) => {
                      if (!shippingIsTariffForced()) {
                        setIsTariff(checked ? 1 : 0);
                      }
                    }}
                    disabled={shippingIsTariffForced()}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-gray-700">{t("Tariff")}</span>
                  <HelpCircle
                    className="h-4 w-4 cursor-pointer text-gray-400 hover:text-gray-600"
                    onClick={() => shippingSetShowTariffRemark(true)}
                  />
                  <span className="ms-auto text-sm text-gray-600">
                    CNY{" "}
                    <bdi dir="ltr">
                      {shippingPriceConvert(shippingCalculateTariffFee(), {
                        needFormat: true,
                        showSymbol: false,
                      })}
                    </bdi>
                  </span>
                </div>
              )}
            </div>

            {/* H5端：底部弹窗 */}
            {shippingIsMobile && (
              <Sheet
                open={shippingIsModalOpen}
                onOpenChange={shippingSetIsModalOpen}
              >
                <SheetContent
                  side="bottom"
                  className="flex max-h-[90vh] flex-col overflow-hidden rounded-t-2xl p-5"
                  onOpenAutoFocus={(event) => event.preventDefault()}
                >
                  <SheetHeader className="shrink-0">
                    <SheetTitle className="text-center text-base font-bold text-[#1a1a1a]">
                      {t("Delivery")}
                    </SheetTitle>
                  </SheetHeader>
                  <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
                    {shippingChannelListContent}
                  </div>
                </SheetContent>
              </Sheet>
            )}

            {/* PC端：Dialog弹窗 */}
            {!shippingIsMobile && (
              <Dialog
                open={shippingIsModalOpen}
                onOpenChange={shippingSetIsModalOpen}
              >
                <DialogContent
                  className="max-w-[min(90vw,640px)] rounded-2xl"
                  onOpenAutoFocus={(event) => event.preventDefault()}
                >
                  <DialogHeader>
                    <DialogTitle className="text-center text-base font-bold text-[#1a1a1a]">
                      {t("Delivery")}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="mt-4 max-h-[60vh] overflow-y-auto">
                    {shippingChannelListContent}
                  </div>
                  <div className="mt-6 flex justify-center">
                    <Button
                      className="min-w-[120px] bg-[#FF5B00] text-white hover:bg-[#FF5B00]/90"
                      onClick={shippingHandleConfirm}
                      disabled={!shippingTempSelectedChannel}
                    >
                      {t("Confirm")}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {/* 保险服务备注弹窗 */}
            <Dialog
              open={shippingShowInsuranceRemark}
              onOpenChange={shippingSetShowInsuranceRemark}
            >
              <DialogContent className="max-w-[min(90vw,500px)] rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="text-center text-base font-bold text-[#1a1a1a]">
                    {t("Insurance service")}
                  </DialogTitle>
                </DialogHeader>
                <div className="mt-4 max-h-[60vh] overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap text-gray-700">
                    {shippingGetInsuranceRemark() || t("No description")}
                  </p>
                </div>
                <div className="mt-6 flex justify-center">
                  <Button
                    className="min-w-[120px] bg-[#FF5B00] text-white hover:bg-[#FF5B00]/90"
                    onClick={() => shippingSetShowInsuranceRemark(false)}
                  >
                    {t("OK")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <ShippingChannelDetailModal
              open={shippingChannelDetailOpen}
              nested={shippingIsModalOpen}
              onOpenChange={(o) => {
                shippingSetChannelDetailOpen(o);
                if (!o) {
                  shippingSetChannelDetailFallback(null);
                }
              }}
              line={shippingChannelDetailFallback}
            />

            {/* 关税服务备注弹窗 */}
            <Dialog
              open={shippingShowTariffRemark}
              onOpenChange={shippingSetShowTariffRemark}
            >
              <DialogContent className="max-w-[min(90vw,500px)] rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="text-center text-base font-bold text-[#1a1a1a]">
                    {t("Tariff")}
                  </DialogTitle>
                </DialogHeader>
                <div className="mt-4 max-h-[60vh] overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap text-gray-700">
                    {shippingGetTariffRemark() || t("No description")}
                  </p>
                </div>
                <div className="mt-6 flex justify-center">
                  <Button
                    className="min-w-[120px] bg-[#FF5B00] text-white hover:bg-[#FF5B00]/90"
                    onClick={() => shippingSetShowTariffRemark(false)}
                  >
                    {t("OK")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        }
      </Section>
    );
  })();
  const submissionContent = (() => {
    // 避免 hydration mismatch
    if (!submissionMounted) {
      return (
        <Section className="px-0">
          {<div ref={submissionContainerRef} className="h-16" />}
        </Section>
      );
    }
    return (
      <Section className="px-0">
        {
          <div ref={submissionContainerRef} className="relative">
            {/* 占位空间，防止内容被底部栏遮挡 */}
            <div className="h-16" />

            {/* 固定底部栏 */}
            <div
              className="fixed bottom-0 z-50 border-t border-gray-200 bg-white px-4 py-3 shadow-lg"
              style={{
                width: submissionContainerWidth
                  ? `${submissionContainerWidth}px`
                  : "100%",
                left:
                  submissionContainerLeft !== null
                    ? `${submissionContainerLeft}px`
                    : 0,
              }}
            >
              <div className="flex items-center justify-end">
                <Button
                  onClick={submissionHandleSubmit}
                  disabled={
                    submissionSubmitting ||
                    shippingLoading ||
                    !selectedShippingChannel
                  }
                  className="px-6 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    backgroundColor: "#FF5B00",
                    color: "white",
                  }}
                >
                  {submissionSubmitting ? (
                    <span className="flex items-center">
                      <Spinner className="h-5 w-5" />
                    </span>
                  ) : (
                    t("Submit")
                  )}
                </Button>
              </div>
            </div>
          </div>
        }
      </Section>
    );
  })();
  return (
    <>
      <Section className="my-4 flex min-h-[300px] w-full flex-col items-start justify-start gap-0 px-0 max-md:items-stretch max-md:gap-4">
        <>
          {addressContent}
          {itemsContent}
          {SHOW_PACKING_SERVICES && packingContent}
          {shippingContent}
          {submissionContent}
        </>
      </Section>
    </>
  );
}
