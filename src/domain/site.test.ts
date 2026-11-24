import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBusiness, type StoredBusiness } from "./business";
import { renderTemplate } from "./email";
import {
  authActionUrls,
  brandHomeHref,
  deploymentProfile,
  exposesPublicMarketing,
  externalWebsiteUrl,
  homeDecision,
  paymentReturnUrls,
  purchaseReturnUrls,
  sharedAppRoutes,
  staffInviteUrl,
} from "./site";

const modes = ["integrated", "app-only"] as const;
const appOrigin = "https://app.operator.example";
const website = "https://example.com/forwarding";

const stored: StoredBusiness = {
  name: "",
  legalName: "",
  email: "",
  supportEmail: "",
  phone: "",
  whatsapp: "",
  country: "",
  address: "",
  description: "",
  primaryColor: "#4F46E5",
  accentColor: "",
  publicUrl: "",
  appUrl: "",
  appUrlTrusted: false,
  supportUrl: "",
  privacyUrl: "",
  termsUrl: "",
  browserTitle: "",
  metaDescription: "",
  logos: { primary: false, square: false, favicon: false },
  updatedAt: 0,
};

describe("public site mode", () => {
  it("defaults to integrated and keeps demo mode independent", () => {
    expect(deploymentProfile({}).siteMode).toBe("integrated");
    expect(deploymentProfile({ PUBLIC_SITE_MODE: "integrated" }).siteMode).toBe("integrated");
    expect(deploymentProfile({ PUBLIC_SITE_MODE: "other" }).siteMode).toBe("integrated");
    expect(deploymentProfile({ DEMO_MODE: "true", PUBLIC_SITE_MODE: "app-only" })).toEqual({
      demo: true,
      siteMode: "app-only",
      websiteUrl: "",
    });
    expect(deploymentProfile({ DEMO_MODE: "false", PUBLIC_SITE_MODE: "integrated", PUBLIC_WEBSITE_URL: website })).toMatchObject({
      demo: false,
      siteMode: "integrated",
      websiteUrl: website,
    });
  });

  it("routes home without dropping login, register, or admin", () => {
    expect(homeDecision("integrated", false)).toEqual({ kind: "public-site" });
    expect(homeDecision("integrated", true)).toEqual({ kind: "public-site" });
    expect(homeDecision("app-only", false)).toEqual({ kind: "redirect", to: "/login" });
    expect(homeDecision("app-only", true)).toEqual({ kind: "redirect", to: "/member-center" });
    for (const mode of modes) {
      expect(sharedAppRoutes.login).toBe("/login");
      expect(sharedAppRoutes.register).toBe("/register");
      expect(sharedAppRoutes.forgotPassword).toBe("/forgot-password");
      expect(sharedAppRoutes.invite).toBe("/admin/invite");
      expect(sharedAppRoutes.customerCalculator).toBe("/freight-estimation");
      expect(sharedAppRoutes.dashboard).toBe("/member-center");
      expect(sharedAppRoutes.admin).toBe("/admin");
      expect(exposesPublicMarketing(mode)).toBe(mode === "integrated");
    }
  });

  it("uses the configured website for the logo and does not invent a product domain", () => {
    expect(externalWebsiteUrl("")).toBe("");
    expect(externalWebsiteUrl("javascript:alert(1)")).toBe("");
    expect(externalWebsiteUrl("https://user:secret@example.com")).toBe("");
    expect(brandHomeHref({ mode: "integrated", publicUrl: "", signedIn: false })).toBe("/");
    expect(brandHomeHref({ mode: "app-only", publicUrl: "", signedIn: false })).toBe("/login");
    expect(brandHomeHref({ mode: "app-only", publicUrl: "", signedIn: true })).toBe("/member-center");
    expect(brandHomeHref({ mode: "app-only", publicUrl: website, signedIn: false })).toBe(website);
    expect(brandHomeHref({ mode: "app-only", publicUrl: website, signedIn: true })).not.toBe("/");
    expect(resolveBusiness(stored, { PUBLIC_WEBSITE_URL: website }).website.publicUrl).toBe(website);
    expect(resolveBusiness(stored).website.publicUrl).toBe("");
  });

  it("keeps email actions and payment returns on the app in both modes", () => {
    const actions = authActionUrls(appOrigin);
    const returns = paymentReturnUrls(appOrigin, "chk_1");
    expect(actions).toEqual({
      login: `${appOrigin}/login`,
      register: `${appOrigin}/register`,
      resetPassword: `${appOrigin}/auth/reset-password`,
      welcome: `${appOrigin}/member-center`,
      confirmEmail: `${appOrigin}/auth/confirm-email`,
    });
    expect(returns).toEqual({
      freightSuccess: `${appOrigin}/member-center/shipments`,
      freightCancel: `${appOrigin}/member-center/shipments/checkout/chk_1`,
      topupSuccess: `${appOrigin}/member-center/wallet?topup=pending`,
      topupCancel: `${appOrigin}/member-center/wallet/top-up`,
    });
    expect(purchaseReturnUrls(`${appOrigin}/`, "po 1")).toEqual({
      success: `${appOrigin}/member-center/purchase-orders/po%201?session_id={CHECKOUT_SESSION_ID}`,
      cancel: `${appOrigin}/member-center/purchase-orders/po%201`,
    });
    expect(staffInviteUrl(`${appOrigin}/`, "a b")).toBe(`${appOrigin}/admin/invite?token=a%20b`);
    for (const mode of modes) {
      expect(homeDecision(mode, false).kind === "public-site" || homeDecision(mode, false).kind === "redirect").toBe(true);
      const rendered = renderTemplate({
        subject: "Verify",
        body: "Open {{actionUrl}}",
        vars: { actionUrl: actions.confirmEmail },
        platformName: "Northwind",
        logoUrl: null,
        appUrl: actions.welcome,
        websiteUrl: website,
      });
      expect(rendered.html).toContain(actions.confirmEmail);
      expect(rendered.html).toContain("example.com");
      expect(rendered.html).not.toContain("package-consolidat");
      expect(rendered.html).not.toContain(mode);
      for (const url of [...Object.values(actions), ...Object.values(returns), ...Object.values(purchaseReturnUrls(appOrigin, "po_1")), staffInviteUrl(appOrigin, "t")]) {
        expect(url.startsWith(appOrigin)).toBe(true);
        expect(url).not.toContain("example.com");
      }
    }
    const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
    const payments = read("server/payments.ts");
    const purchase = read("server/purchase-stripe.ts");
    const auth = read("server/auth.ts");
    const staff = read("server/staff.ts");
    expect(payments).toContain("paymentReturnUrls(");
    expect(purchase).toContain("purchaseReturnUrls(");
    expect(staff).toContain("staffInviteUrl(");
    for (const source of [payments, purchase, staff]) {
      // Notification hrefs (`/app/...`) are API data and stay; only redirect and invite targets are checked.
      for (const line of source.split("\n").filter((row) => /(success|cancel)_url|inviteUrl =/.test(row))) {
        expect(line).not.toMatch(/\/(app|auth)\/|\/member-center/);
      }
      expect(source).not.toContain("PUBLIC_WEBSITE_URL");
      expect(source).not.toContain("PUBLIC_SITE_MODE");
    }
    const createAuth = auth.slice(auth.indexOf("export async function createAuth"));
    expect(createAuth).toContain("authActionUrls(origin).resetPassword");
    expect(createAuth).toContain("authActionUrls(origin).welcome");
    expect(createAuth).not.toContain("PUBLIC_SITE_MODE");
    expect(createAuth).not.toContain("PUBLIC_WEBSITE_URL");
  });
});
