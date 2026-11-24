"use client";

import { AccountAvatar } from "@/components/account-avatar";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
import type { ProcurementMe } from "@/lib/procurement/types";
import { useTranslations } from "next-intl";

export function ProfileHeaderCard({ profile }: { profile: ProcurementMe }) {
  const t = useTranslations();
  const user = useProcurementSessionStore((state) => state.user);
  const userId = profile.memberCode || profile.id;

  return (
    <div className="from-primary/10 to-primary/5 flex items-center gap-4 rounded-lg bg-gradient-to-r p-4 md:p-5">
      <AccountAvatar
        className="bg-primary/10 text-primary size-16 border-2 border-white text-2xl shadow-sm"
        name={profile.name}
        email={profile.email}
        src={user?.id === profile.id ? user.avatar : undefined}
      />
      <div className="min-w-0 flex-1 text-start">
        <h3 className="truncate text-base font-bold text-[#1A1A1A]">
          {profile.name}
        </h3>
        <p className="truncate text-sm text-[#666666]" title={profile.email}>
          <bdi>{profile.email}</bdi>
        </p>
        <span className="mt-2 inline-flex max-w-full items-center rounded-full bg-white/80 px-2.5 py-0.5 text-xs text-[#666666]">
          <span className="shrink-0">{t("User ID:")}</span>
          <bdi dir="ltr" className="ms-1 truncate">
            {userId}
          </bdi>
        </span>
      </div>
    </div>
  );
}
