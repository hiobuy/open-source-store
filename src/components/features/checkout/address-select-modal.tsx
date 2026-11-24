"use client";
import { useState } from "react";
import { Circle, CircleDot, SquarePen } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProcurementAddress } from "@/lib/procurement/types";
import { formatAddressLines } from "@/lib/address-format";
/** 地址选择项；新地址可通过 source 传入原始结构。 */
export interface AddressItem<Id extends string | number = number> {
  id: Id;
  receiver_name?: string;
  phone?: string;
  country_name?: string;
  area?: {
    name?: string;
  };
  sub_area?: {
    name?: string;
  };
  province?: string;
  state?: string;
  city?: string;
  district?: string;
  street?: string;
  address?: string;
  door_no?: string;
  postcode?: string;
  is_default?: number;
  timezone?: string;
  /** New procurement address shape, when the caller already has it. */
  source?: ProcurementAddress;
}

function formatAddressItem(addr: AddressItem<string | number>): string {
  const input: Parameters<typeof formatAddressLines>[0] = addr.source ?? {
    countryCode: "",
    countryName: addr.country_name ?? "",
    state: addr.state ?? addr.province ?? "",
    city: addr.city ?? "",
    district: addr.district ?? "",
    postalCode: addr.postcode ?? "",
    addressLine1: addr.street ?? addr.address ?? "",
    addressLine2: addr.door_no ?? "",
  };
  return formatAddressLines(input).join(", ");
}
function maskPhone(timezone?: string, phone?: string): string {
  if (!phone) return "";
  const s = String(phone);
  const tz = timezone ? timezone.replace(/^0{1,3}/, "") : "";
  return `${tz} ${s}`;
}
interface AddressSelectModalProps<Id extends string | number = number> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId?: Id | null;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  emptyListText?: string;
  defaultAddressText?: string;
  /** 请求失败且没有 message 时的兜底文案 */
  loadErrorFallbackText?: string;
  onConfirm: (address: AddressItem<Id>) => void;
  onEdit?: (address: AddressItem<Id>) => void;
}
export function AddressSelectDialog<Id extends string | number>({
  open,
  onOpenChange,
  selectedId,
  title = "Select Address",
  confirmText = "Confirm",
  cancelText = "Cancel",
  defaultAddressText,
  emptyListText = "No addresses",
  loadErrorFallbackText = "Failed to load addresses",
  onConfirm,
  onEdit,
  addresses,
  loading,
  error,
}: AddressSelectModalProps<Id> & {
  addresses: AddressItem<Id>[];
  loading: boolean;
  error: unknown;
}) {
  const isMobile = useIsMobile();
  const [choice, setChoice] = useState<Id | null>(null);
  const [previousOpen, setPreviousOpen] = useState(open);
  const [previousSelectedId, setPreviousSelectedId] = useState(selectedId);
  if (previousOpen !== open || previousSelectedId !== selectedId) {
    setPreviousOpen(open);
    setPreviousSelectedId(selectedId);
    setChoice(null);
  }
  const selected =
    choice ??
    selectedId ??
    addresses.find((address) => address.is_default === 1)?.id ??
    addresses[0]?.id ??
    null;
  const errorMessage =
    error instanceof Error ? error.message : loadErrorFallbackText;
  const handleConfirm = () => {
    const addr = addresses.find((a) => a.id === selected);
    if (addr) {
      onConfirm(addr);
      onOpenChange(false);
    }
  };
  const renderAddressRow = (addr: AddressItem<Id>) => {
    const isSelected = selected === addr.id;
    return (
      <div
        key={addr.id}
        role="button"
        tabIndex={0}
        onClick={() => setChoice(addr.id)}
        onKeyDown={(event) => {
          if (
            event.target === event.currentTarget &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            setChoice(addr.id);
          }
        }}
        className={[
          "group flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-4 transition-all",
          isSelected
            ? "border-primary bg-primary/5"
            : "hover:border-primary hover:bg-primary/5 border-transparent",
        ].join(" ")}
      >
        <div className="shrink-0 pt-1">
          {isSelected ? (
            <CircleDot className="text-primary size-5" />
          ) : (
            <Circle className="size-5 text-[#D9DEE8]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate font-semibold text-[#1F2937]">
              {addr.receiver_name || "-"}
            </span>
            {addr.phone && (
              <bdi dir="ltr" className="shrink-0 text-xs text-[#94A3B8]">
                +{maskPhone(addr.timezone, String(addr.phone))}
              </bdi>
            )}
            {!!addr.is_default && defaultAddressText && (
              <span className="bg-primary shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-normal text-white uppercase">
                {defaultAddressText}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[#667085]">
            {formatAddressItem(addr)}
          </p>
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(addr);
            }}
            className="hover:border-primary/40 hover:text-primary shrink-0 rounded-xl border border-[#D9DEE8] p-2 text-[#94A3B8] transition-colors"
          >
            <SquarePen className="size-4" />
          </button>
        )}
      </div>
    );
  };
  const listContent = (
    <>
      {loading && (
        <div className="space-y-3 px-1 py-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="rounded-2xl border border-[#EEF2F6] px-4 py-4"
            >
              <div className="flex items-start gap-3">
                <Skeleton className="mt-1 size-5 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-4 w-full" />
                </div>
                <Skeleton className="size-8 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      )}
      {Boolean(error) && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-8 text-center text-sm text-red-500">
          {errorMessage}
        </div>
      )}
      {!loading && !error && addresses.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#D9DEE8] px-4 py-8 text-center text-sm text-gray-500">
          {emptyListText}
        </div>
      )}
      {!loading && !error && addresses.length > 0 && (
        <div className="space-y-3">{addresses.map(renderAddressRow)}</div>
      )}
    </>
  );
  const confirmButton = (
    <div className="flex items-center justify-end gap-3">
      {!isMobile && (
        <Button
          type="button"
          variant="outline"
          className="h-12 min-w-[112px] rounded-xl border-[#D9DEE8] text-sm font-bold text-[#475467]"
          onClick={() => onOpenChange(false)}
        >
          {cancelText}
        </Button>
      )}
      <Button
        type="button"
        className="bg-primary hover:bg-primary/90 h-12 min-w-[116px] rounded-xl border-0 text-sm font-bold text-white"
        onClick={handleConfirm}
        disabled={
          loading ||
          Boolean(error) ||
          !addresses.some(({ id }) => id === selected)
        }
      >
        {confirmText}
      </Button>
    </div>
  );
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="flex max-h-[82vh] flex-col overflow-hidden rounded-t-[28px] p-0"
        >
          <SheetHeader className="shrink-0 border-b border-[#EEF2F6] px-5 py-5">
            <SheetTitle className="text-start text-lg leading-none font-bold text-[#1F2937]">
              {title}
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {listContent}
          </div>
          <div className="shrink-0 border-t border-[#EEF2F6] px-5 py-4">
            {confirmButton}
          </div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(92vw,640px)] gap-0 overflow-hidden rounded-[28px] border-0 bg-white p-0 shadow-[0_24px_64px_rgba(16,24,40,0.18)]">
        <DialogHeader className="border-b border-[#EEF2F6] px-6 py-6">
          <DialogTitle className="text-start text-2xl leading-none font-bold text-[#1F2937]">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {listContent}
        </div>
        <div className="border-t border-[#EEF2F6] px-6 py-5">
          {confirmButton}
        </div>
      </DialogContent>
    </Dialog>
  );
}
