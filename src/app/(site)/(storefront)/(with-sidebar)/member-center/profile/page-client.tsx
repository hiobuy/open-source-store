"use client";
import { ChangeEmail } from "./components/change-email";
import { ChangePassword } from "./components/change-password";
import { ProfileHeaderCard } from "./components/profile-header-card";
import { ShippingAddressList } from "./components/shipping-address-list";
import { UserProfileForm } from "./components/user-profile-form";
import { Section } from "@/components/layout/section";
import { Spinner } from "@/components/ui/spinner";
import { loadProcurementProfile } from "@/lib/procurement/profile";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
import type { ProcurementMe } from "@/lib/procurement/types";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
export default function AccountTabs() {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState(0);
  const tabs = ["Personal profile", "Shipping Address", "Security"] as const;
  const profile = useProcurementSessionStore((state) => state.profile);
  const patchProfile = useProcurementSessionStore(
    (state) => state.patchProfile,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (profile) return;
    let active = true;
    void loadProcurementProfile().catch((error: unknown) => {
      if (!active) return;
      console.error("Failed to fetch account profile:", error);
      setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [profile]);

  useEffect(() => {
    if (activeTab !== 2) return;
    void loadProcurementProfile({ force: true }).catch(() => {});
  }, [activeTab]);

  const loading = !profile && !failed;
  const pendingEmail = profile?.pendingEmail?.email ?? null;
  const handlePendingChange = (email: string | null) => {
    if (!email) {
      patchProfile({ pendingEmail: null });
      return;
    }
    void loadProcurementProfile({ force: true }).catch(() => {});
  };
  return (
    <div className="px-0">
      <div className="mx-auto h-full w-full max-w-[1280px]">
        <div className="mt-0 h-full overflow-hidden rounded-none p-0 md:overflow-visible md:rounded-[12px] md:bg-white md:p-4">
          <div className="relative flex w-full items-center bg-white">
            <div className="scrollbar-hide flex w-full overflow-x-auto overscroll-x-contain md:w-auto md:gap-4 md:overflow-visible">
              {tabs.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={activeTab === index}
                  onClick={() => setActiveTab(index)}
                  className={`relative flex min-h-11 shrink-0 cursor-pointer items-center justify-center px-4 py-3 text-center md:block md:min-h-0 md:px-0 md:pt-0 md:pb-2 md:text-start ${activeTab === index ? "text-primary font-bold" : "text-[#333333]"}`}
                >
                  <span className="text-sm leading-5 font-normal whitespace-nowrap md:text-xs md:leading-4">
                    {t(label)}
                  </span>
                  {activeTab === index && (
                    <span
                      aria-hidden="true"
                      className="bg-primary absolute start-0 end-0 bottom-0 h-[3px] rounded-[2px]"
                    />
                  )}
                </button>
              ))}
            </div>
            <div className="absolute start-0 end-0 bottom-0 hidden h-[1px] rounded-[2px] bg-[#E2E4F0] md:block" />
          </div>
          <div className="h-full">
            {activeTab === 1 ? (
              <ShippingAddressList />
            ) : loading ? (
              <div className="flex justify-center p-6">
                <Spinner />
              </div>
            ) : profile ? (
              activeTab === 0 ? (
                <UserProfileForm key={profile.id} profile={profile} />
              ) : (
                <SecurityPanel
                  profile={profile}
                  pendingEmail={pendingEmail}
                  onPendingChange={handlePendingChange}
                />
              )
            ) : (
              <Section>
                <p className="p-4 text-sm text-[#999999]">
                  {t("No profile data available")}
                </p>
              </Section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
function SecurityPanel({
  profile,
  pendingEmail,
  onPendingChange,
}: {
  profile: ProcurementMe;
  pendingEmail: string | null;
  onPendingChange: (email: string | null) => void;
}) {
  return (
    <>
      <Section>
        <div className="mt-3 mb-3 md:mt-0 md:pt-4">
          <ProfileHeaderCard profile={profile} />
        </div>
      </Section>
      {profile.hasPassword !== false && <ChangePassword />}
      {profile.emailDeliveryConfigured && (
        <ChangeEmail
          email={profile.email}
          hasPassword={profile.hasPassword !== false}
          pendingEmail={pendingEmail}
          onPendingChange={onPendingChange}
        />
      )}
    </>
  );
}
