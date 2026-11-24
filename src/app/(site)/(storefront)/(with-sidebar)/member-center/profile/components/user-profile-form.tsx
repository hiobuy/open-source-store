"use client";

import { ProfileHeaderCard } from "./profile-header-card";
import { Section } from "@/components/layout/section";
import { getErrorMessage } from "@/lib/error-message";
import { updateProcurementProfile } from "@/lib/procurement/client";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
import type { ProcurementMe } from "@/lib/procurement/types";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

export function UserProfileForm({ profile }: { profile: ProcurementMe }) {
  const t = useTranslations();
  const [nicknameState, setNicknameState] = useState({
    value: profile.name,
    base: profile.name,
  });
  if (nicknameState.base !== profile.name) {
    setNicknameState({
      value:
        nicknameState.value === nicknameState.base
          ? profile.name
          : nicknameState.value,
      base: profile.name,
    });
  }
  const nickname = nicknameState.value;
  const setNickname = (value: string) =>
    setNicknameState((current) => ({ ...current, value }));
  const [saving, setSaving] = useState(false);
  const isDirty = nickname.trim() !== profile.name;

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = nickname.trim();
    if (!name || name === profile.name || saving) return;

    setSaving(true);
    try {
      const updated = await updateProcurementProfile({
        name,
        phone: profile.phone,
        country: profile.country,
      });
      useProcurementSessionStore.getState().patchProfile(updated);
      setNickname(updated.name);
      toast.success(t("Saved successfully"));
    } catch (error) {
      toast.error(
        getErrorMessage(error) || t("Failed to save Please try again"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section>
      <form onSubmit={handleSave} className="py-3 md:pt-4">
        <ProfileHeaderCard profile={profile} />

        <div className="mt-3 rounded-lg bg-white md:shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
          <div className="divide-y divide-[#F1F5F9]">
            <div className="px-4 py-3 md:grid md:grid-cols-[140px_1fr] md:items-center md:gap-4">
              <label
                htmlFor="profile-nickname"
                className="mb-1 block text-sm text-[#999999] md:mb-0"
              >
                {t("Nickname")}
              </label>
              <div className="flex items-center gap-2 md:max-w-[480px]">
                <input
                  id="profile-nickname"
                  type="text"
                  required
                  maxLength={80}
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder={t("Enter your nickname")}
                  className="focus:border-primary focus:ring-primary/20 h-10 min-w-0 flex-1 rounded-md border border-[#E2E4F0] bg-white px-3 text-sm text-[#333333] focus:ring-2 focus:outline-none"
                />
                {isDirty && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setNickname(profile.name)}
                    className="h-10 shrink-0 rounded-md bg-[#F1F5F9] px-4 text-sm font-bold text-[#334155] transition-colors hover:bg-[#E2E8F0] disabled:opacity-50"
                  >
                    {t("Cancel")}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving || !nickname.trim() || !isDirty}
                  className="bg-primary hover:bg-primary/90 h-10 shrink-0 rounded-md px-5 text-sm font-bold text-white transition-colors disabled:opacity-50"
                >
                  {saving ? t("Saving") : t("Save")}
                </button>
              </div>
            </div>

            {profile.phone && (
              <div className="px-4 py-3 md:grid md:grid-cols-[140px_1fr] md:items-center md:gap-4">
                <span className="mb-1 block text-sm text-[#999999] md:mb-0">
                  {t("Phone")}
                </span>
                <bdi
                  dir="ltr"
                  className="block truncate text-sm text-[#333333]"
                >
                  {profile.phone}
                </bdi>
              </div>
            )}

            {profile.country && (
              <div className="px-4 py-3 md:grid md:grid-cols-[140px_1fr] md:items-center md:gap-4">
                <span className="mb-1 block text-sm text-[#999999] md:mb-0">
                  {t("Country")}
                </span>
                <span className="block truncate text-sm text-[#333333]">
                  {profile.country}
                </span>
              </div>
            )}
          </div>
        </div>
      </form>
    </Section>
  );
}
