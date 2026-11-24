"use client";

import { MemberEmptyState } from "@/components/features/account/member-empty-state";

import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import {
  AddressFormModal,
  type AddressSubmitParams,
} from "@/components/features/address/address-form-modal";
import { Section } from "@/components/layout/section";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAddressLines } from "@/lib/address-format";
import { getErrorMessage } from "@/lib/error-message";
import {
  deleteProcurementAddress,
  getProcurementAddresses,
  saveProcurementAddress,
} from "@/lib/procurement/client";
import type { ProcurementAddress } from "@/lib/procurement/types";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function addressFormInitial(address: ProcurementAddress) {
  return {
    firstName: address.firstName,
    lastName: address.lastName,
    receiver_name: address.name,
    phone: address.phone,
    timezone: address.phoneCode.replace(/^\+/, "00"),
    countryIsoCode: address.countryCode,
    province: address.state,
    city: address.city,
    street: address.addressLine1,
    addressLine2: address.addressLine2,
    postcode: address.postalCode,
    is_default: address.isDefault ? 1 : 0,
  };
}

export function ShippingAddressList() {
  const t = useTranslations();
  const [addresses, setAddresses] = useState<ProcurementAddress[]>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [form, setForm] = useState<{
    mode: "add" | "edit";
    address?: ProcurementAddress;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getProcurementAddresses().then(
      (list) => {
        if (active) setAddresses(list);
      },
      () => {
        if (active) setLoadFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function saveAddress(params: AddressSubmitParams) {
    const existing = form?.mode === "edit" ? form.address : undefined;
    try {
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
          isDefault:
            params.is_default === 1 || (!existing && addresses?.length === 0),
        },
        existing?.id,
      );
      setAddresses((current = []) => {
        const others = saved.isDefault
          ? current.map((address) => ({ ...address, isDefault: false }))
          : current;
        return existing
          ? others.map((address) =>
              address.id === existing.id ? saved : address,
            )
          : [...others, saved];
      });
      toast.success(
        t(
          existing
            ? "Address updated successfully"
            : "Address added successfully",
        ),
      );
    } catch (error) {
      toast.error(
        getErrorMessage(error) ||
          t("Failed to update address, please try again"),
      );
      throw error;
    }
  }

  async function deleteAddress(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await deleteProcurementAddress(id);
      setAddresses((current) =>
        current?.filter((address) => address.id !== id),
      );
      toast.success(t("Address deleted successfully"));
    } catch (error) {
      toast.error(
        getErrorMessage(error) ||
          t("Failed to delete address, please try again"),
      );
    } finally {
      setBusy(false);
    }
  }

  const addDisabled = busy || !addresses;

  return (
    <Section>
      <div className="flex-1">
        {loadFailed ? (
          <p role="alert" className="p-4 text-sm text-[#999999]">
            {t("The service is temporarily unavailable Please try again")}
          </p>
        ) : !addresses ? (
          <div
            className="grid grid-cols-1 gap-3 py-3 pb-20 md:grid-cols-2 md:bg-white md:px-0 md:pt-4 md:pb-3"
            aria-busy="true"
          >
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="rounded-lg bg-white p-4 md:shadow-[0_4px_20px_rgba(0,0,0,0.06)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-12 rounded-full" />
                </div>
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
                <div className="mt-4 flex items-center justify-end gap-2 border-t border-[#E2E4F0] pt-3">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-8 w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {addresses.length === 0 && (
              <MemberEmptyState
                variant="addresses"
                label={t("No saved addresses")}
              />
            )}
            <div className="grid grid-cols-1 gap-3 py-3 pb-20 md:grid-cols-2 md:bg-white md:px-0 md:pt-4 md:pb-3">
              {addresses.map((address) => {
                const phone = `${address.phoneCode} ${address.phone}`.trim();
                const lines = formatAddressLines(address);
                return (
                  <div
                    key={address.id}
                    className="flex h-full flex-col rounded-lg bg-white p-4 md:shadow-[0_4px_20px_rgba(0,0,0,0.06)] md:transition-shadow md:hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold break-words text-[#333333]">
                        {address.name}
                      </span>
                      <bdi
                        dir="ltr"
                        className="text-xs break-all text-[#999999]"
                      >
                        {phone}
                      </bdi>
                      {address.isDefault && (
                        <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-medium">
                          {t("Default")}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex-1 space-y-0.5">
                      {lines.map((line, index) => (
                        <p
                          key={`${line}-${index}`}
                          className="text-sm leading-5 break-words text-[#666666]"
                        >
                          {line}
                        </p>
                      ))}
                    </div>

                    <div className="mt-3 flex items-center justify-end gap-2 border-t border-[#E2E4F0] pt-3">
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#F1F5F9] px-3 text-xs font-medium text-[#334155] transition-colors outline-none hover:bg-[#334155] hover:text-white focus-visible:ring-2 focus-visible:ring-[#334155]/30 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => setForm({ mode: "edit", address })}
                      >
                        <Pencil className="size-3.5" />
                        {t("Edit")}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#FFF1F0] px-3 text-xs font-medium text-[#CF1322] transition-colors outline-none hover:bg-[#CF1322] hover:text-white focus-visible:ring-2 focus-visible:ring-[#CF1322]/30 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => setDeleteTarget(address.id)}
                      >
                        <Trash2 className="size-3.5" />
                        {t("Delete")}
                      </button>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                disabled={addDisabled}
                onClick={() => setForm({ mode: "add" })}
                className="hover:border-primary hover:text-primary hidden h-full min-h-[196px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#E2E4F0] bg-white p-4 text-sm font-bold text-[#999999] transition-colors disabled:opacity-50 md:flex"
              >
                <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-full">
                  <Plus className="size-5" />
                </span>
                <span>{t("Add shipping address")}</span>
              </button>
            </div>
          </>
        )}

        <div className="safe-area-pb fixed start-0 end-0 bottom-0 z-10 bg-[#f0f0f0] px-2 py-3 md:hidden">
          <button
            type="button"
            disabled={addDisabled}
            onClick={() => setForm({ mode: "add" })}
            className="bg-primary hover:bg-primary/90 flex h-11 w-full items-center justify-center gap-2 rounded-full px-6 text-sm font-bold text-white disabled:opacity-50"
          >
            <Plus className="size-5" />
            {t("Add shipping address")}
          </button>
        </div>

        <AddressFormModal
          open={form !== null}
          onOpenChange={(open) => {
            if (!open) setForm(null);
          }}
          mode={form?.mode ?? "add"}
          editingId={form?.mode === "edit" ? form.address?.id : null}
          initialData={
            form?.mode === "edit" && form.address
              ? addressFormInitial(form.address)
              : null
          }
          onSubmit={saveAddress}
        />
        <DeleteConfirmDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(undefined);
          }}
          onConfirm={() => {
            if (deleteTarget) void deleteAddress(deleteTarget);
          }}
          title={t("Are you sure you want to delete this address?")}
          description={t("This action cannot be undone")}
        />
      </div>
    </Section>
  );
}
