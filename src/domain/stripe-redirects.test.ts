import { describe, expect, it } from "vitest";
import { stripeRedirects, stripeRedirectUrlProblem } from "./stripe-redirects";

const fallback = { success_url: "https://api.example/app/return?session_id={CHECKOUT_SESSION_ID}", cancel_url: "https://api.example/app/cancel" };
describe("Stripe browser redirects", () => {
  it.each(["", "https://app.example/payment?lang=zh", "http://localhost:5173/paid", "http://127.0.0.1:3000/paid"])("allows %s", value => {
    expect(stripeRedirectUrlProblem(value)).toBeNull();
  });
  it.each(["/relative", "//evil.example", "javascript:alert(1)", "http://app.example/pay", "https://user:pass@app.example/pay", "https://app.example/#/paid", "https://app.example/{orderId}", "https://app.example/\npaid", "https://app.example/\\evil"])("rejects %s", value => {
    expect(stripeRedirectUrlProblem(value)).toBeTruthy();
  });
  it("preserves legacy destinations when blank", () => {
    expect(stripeRedirects({}, fallback, { purpose: "purchase" })).toEqual(fallback);
  });
  it.each(["purchase", "shipment", "topup"] as const)("attaches authoritative context for %s and preserves custom query", purpose => {
    const result = stripeRedirects({ successUrl: "https://app.example/paid?lang=zh&purpose=bad&session_id=bad", cancelUrl: "https://app.example/cancel?session_id=bad" }, fallback, { purpose, ...(purpose === "purchase" ? { orderId: "id /?", paymentId: "payment", billId: "bill" } : purpose === "shipment" ? { checkoutId: "checkout" } : {}) });
    const success = new URL(result.success_url), cancel = new URL(result.cancel_url);
    expect(success.searchParams.get("purpose")).toBe(purpose);
    expect(success.searchParams.get("lang")).toBe("zh");
    expect(result.success_url).toContain("session_id={CHECKOUT_SESSION_ID}");
    expect(cancel.searchParams.get("session_id")).toBeNull();
    expect(cancel.searchParams.get("result")).toBe("cancel");
    if (purpose === "purchase") expect(success.searchParams.get("orderId")).toBe("id /?");
    if (purpose === "shipment") expect(success.searchParams.get("checkoutId")).toBe("checkout");
  });
  it("supports overriding success without changing cancel", () => {
    expect(stripeRedirects({ successUrl: "https://app.example/paid" }, fallback, { purpose: "topup" }).cancel_url).toBe(fallback.cancel_url);
  });
});
