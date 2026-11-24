/** Browser-only payment destinations. These never change the server Webhook URL. */
export function stripeRedirectUrlProblem(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (value.length > 2000 || /[\s\\{}]/.test(value) || url.username || url.password || url.hash ||
      !(url.protocol === "https:" || (url.protocol === "http:" && local))) throw new Error();
    return null;
  } catch {
    return "Use an absolute HTTPS redirect URL without credentials, fragments or placeholders. HTTP is allowed only for localhost.";
  }
}

type RedirectSettings = { successUrl?: string | null; cancelUrl?: string | null };
type Context = { purpose: "purchase" | "shipment" | "topup"; orderId?: string; billId?: string; paymentId?: string; checkoutId?: string };

export function stripeRedirects(settings: RedirectSettings, fallback: { success_url: string; cancel_url: string }, context: Context) {
  function build(value: string | null | undefined, success: boolean, legacy: string) {
    if (!value) return legacy;
    const problem = stripeRedirectUrlProblem(value);
    if (problem) throw new Error(problem);
    const url = new URL(value);
    for (const key of ["purpose", "orderId", "billId", "paymentId", "checkoutId", "session_id", "result"]) url.searchParams.delete(key);
    for (const [key, item] of Object.entries(context)) if (item) url.searchParams.set(key, item);
    url.searchParams.set("result", success ? "success" : "cancel");
    if (success) url.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
    return url.toString().replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}");
  }
  return {
    success_url: build(settings.successUrl, true, fallback.success_url),
    cancel_url: build(settings.cancelUrl, false, fallback.cancel_url),
  };
}
