"use client";

import { extractLanguageFromPath } from "@/lib/utils/language";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const HIDDEN_FOOTER_PATH = "/member-center/shipments/new";

export function SiteFooterGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const actualPath = extractLanguageFromPath(pathname).actualPath;
  const normalized = actualPath.replace(/\/+$/, "") || "/";
  if (normalized === HIDDEN_FOOTER_PATH) return null;
  return children;
}
