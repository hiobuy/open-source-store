import { cookies } from "next/headers";
import { Suspense } from "react";

import { ProductNavigationLoading } from "@/components/product-navigation-loading";
import { RouteProgressBar } from "@/components/route-progress-bar";
import { StorefrontBootstrap } from "@/components/storefront-bootstrap";
import "../globals.css";

const procurementSessionCookie =
  /^(?:__Secure-|__Host-)?better-auth\.session_token(?:\.\d+)?$/;

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hasProcurementSession = (await cookies())
    .getAll()
    .some((cookie) => procurementSessionCookie.test(cookie.name));

  return (
    <>
      <Suspense fallback={null}>
        <RouteProgressBar />
        <ProductNavigationLoading />
      </Suspense>
      <StorefrontBootstrap hasProcurementSession={hasProcurementSession}>
        {children}
      </StorefrontBootstrap>
    </>
  );
}
