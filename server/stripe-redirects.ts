import { z } from "zod";
import { stripeRedirectUrlProblem } from "../src/domain/stripe-redirects";

const redirectUrl = z.string().trim().min(1).max(2000).superRefine((value, ctx) => {
  const message = stripeRedirectUrlProblem(value);
  if (message) ctx.addIssue({ code: "custom", message });
}).describe("Complete HTTPS frontend page URL; localhost HTTP allowed. No credentials, fragments or placeholders. Server appends payment context and session_id on success. Omit to keep the built-in page.");

export const stripeRedirectInput = z.object({ successUrl: redirectUrl.optional(), cancelUrl: redirectUrl.optional() }).strict();
export type StripeRedirectInput = z.infer<typeof stripeRedirectInput>;
