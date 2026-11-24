/** Deployment shape for the public site. Independent of DEMO_MODE. */

export const SITE_MODES = ["integrated", "app-only"] as const;
export type SiteMode = (typeof SITE_MODES)[number];

export function resolveSiteMode(value: string | undefined | null): SiteMode {
  return value === "app-only" ? "app-only" : "integrated";
}

export function deploymentProfile(env: { DEMO_MODE?: string; PUBLIC_SITE_MODE?: string; PUBLIC_WEBSITE_URL?: string }) {
  return {
    demo: env.DEMO_MODE === "true",
    siteMode: resolveSiteMode(env.PUBLIC_SITE_MODE),
    websiteUrl: externalWebsiteUrl(env.PUBLIC_WEBSITE_URL ?? ""),
  };
}

/** http(s) website only. Empty and unsafe values stay empty so no product domain is invented. */
export function externalWebsiteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 400) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function homeDecision(mode: SiteMode, signedIn: boolean): { kind: "public-site" } | { kind: "redirect"; to: "/member-center" | "/login" } {
  if (mode === "integrated") return { kind: "public-site" };
  return { kind: "redirect", to: signedIn ? "/member-center" : "/login" };
}

/** Built-in marketing page is the `/` entry only in integrated mode. */
export function exposesPublicMarketing(mode: SiteMode) {
  return mode === "integrated";
}

/** Page paths on the app origin. Notification hrefs are persisted API data and are not listed here. */
export const sharedAppRoutes = {
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/auth/reset-password",
  confirmEmail: "/auth/confirm-email",
  invite: "/admin/invite",
  dashboard: "/member-center",
  customerCalculator: "/freight-estimation",
  admin: "/admin",
  adminDemo: "/admin/demo",
} as const;

const customerPaths = {
  wallet: "/member-center/wallet",
  walletTopUp: "/member-center/wallet/top-up",
  shipments: "/member-center/shipments",
  shipmentCheckout: (checkoutId: string) => `/member-center/shipments/checkout/${checkoutId}`,
  purchaseOrder: (orderId: string) => `/member-center/purchase-orders/${encodeURIComponent(orderId)}`,
};

export function brandHomeHref(input: { mode: SiteMode; publicUrl: string; signedIn: boolean }): string {
  const website = externalWebsiteUrl(input.publicUrl);
  if (website) return website;
  if (input.mode === "app-only") return input.signedIn ? sharedAppRoutes.dashboard : sharedAppRoutes.login;
  return "/";
}

function trimOrigin(appOrigin: string) {
  return appOrigin.replace(/\/$/, "");
}

/** Mail actions stay on the app origin. The public website is a footer link, not these targets. */
export function authActionUrls(appOrigin: string) {
  const origin = trimOrigin(appOrigin);
  return {
    login: `${origin}${sharedAppRoutes.login}`,
    register: `${origin}${sharedAppRoutes.register}`,
    resetPassword: `${origin}${sharedAppRoutes.resetPassword}`,
    welcome: `${origin}${sharedAppRoutes.dashboard}`,
    confirmEmail: `${origin}${sharedAppRoutes.confirmEmail}`,
  };
}

/** Staff invite link. The token is URL-encoded here. */
export function staffInviteUrl(appOrigin: string, token: string) {
  return `${trimOrigin(appOrigin)}${sharedAppRoutes.invite}?token=${encodeURIComponent(token)}`;
}

/** Stripe default return paths, used only when the caller passes no successUrl/cancelUrl. Same in both site modes, never the external marketing host. */
export function paymentReturnUrls(appOrigin: string, checkoutId: string) {
  const origin = trimOrigin(appOrigin);
  return {
    freightSuccess: `${origin}${customerPaths.shipments}`,
    freightCancel: `${origin}${customerPaths.shipmentCheckout(checkoutId)}`,
    topupSuccess: `${origin}${customerPaths.wallet}?topup=pending`,
    topupCancel: `${origin}${customerPaths.walletTopUp}`,
  };
}

/** Purchase order Stripe defaults. Keeps Stripe's {CHECKOUT_SESSION_ID} placeholder literal. */
export function purchaseReturnUrls(appOrigin: string, orderId: string) {
  const page = `${trimOrigin(appOrigin)}${customerPaths.purchaseOrder(orderId)}`;
  return { success: `${page}?session_id={CHECKOUT_SESSION_ID}`, cancel: page };
}
