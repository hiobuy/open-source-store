"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

/** Shared illustration and form frame selected by this template. */
export default function AuthRouteLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const t = useTranslations();
  return (
    <main className="min-w-0 flex-1">
      <div className="flex min-h-screen">
        <div className="relative isolate hidden overflow-hidden bg-[url('/assets/images/login/auth-shopping.webp')] bg-cover bg-center bg-no-repeat lg:flex lg:w-1/2 lg:min-w-0 lg:shrink-0">
          <button
            type="button"
            onClick={() => router.back()}
            className="absolute start-[48px] top-[80px] z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/30 backdrop-blur-sm transition-colors hover:bg-white/40"
          >
            <img
              src="/assets/images/login/back.png"
              alt={t.raw("Back")}
              className="h-12 w-12"
            />
          </button>
        </div>
        <div className="relative z-10 flex w-full items-center justify-center bg-white p-2 md:p-12 lg:w-1/2 lg:min-w-0 lg:shrink-0">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </main>
  );
}
