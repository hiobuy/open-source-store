import { z } from "zod";
import { serviceApplication, serviceSelection } from "../../src/domain/warehouse-service-application";
import { stripeRedirectInput } from "../stripe-redirects";

export const addressSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().trim().min(1, "First name is required").max(40),
  lastName: z.string().trim().min(1, "Last name is required").max(40),
  email: z.string().trim().email("Enter a valid email.").max(120).optional().or(z.literal("")),
  company: z.string().trim().max(80).optional().or(z.literal("")),
  phoneCode: z.string().trim().regex(/^\+\d{1,4}$/, "Choose a country calling code."),
  phone: z.string().trim().min(5, "Phone is required").max(20),
  countryCode: z.string().trim().length(2),
  regionCode: z.string().trim().min(1, "Choose a region.").max(64),
  state: z.string().trim().min(1, "State is required").max(80),
  city: z.string().trim().min(1, "City is required").max(80),
  district: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().min(3, "Postal code is required").max(16),
  addressLine1: z.string().trim().min(1, "Address is required").max(160),
  addressLine2: z.string().trim().max(160).optional(),
  isDefault: z.boolean().optional(),
});

export const prealertItem = z.object({
  courier: z.string().trim().min(1, "Courier is required").max(40),
  trackingNumber: z.string().trim().min(5, "Tracking number is required").max(40),
  productName: z.string().trim().max(120).optional(),
  quantity: z.number().int().positive().max(999).optional(),
  declaredValueFen: z.number().int().nonnegative().optional(),
  platform: z.enum(["1688", "Taobao", "JD", "Pinduoduo", "Other"]).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const invoiceProfileSchema = z.object({
  label: z.string().trim().min(1, "Add a label.").max(40),
  kind: z.enum(["individual", "business"]),
  name: z.string().trim().min(1, "Add the name to print.").max(120),
  taxId: z.string().trim().max(40).optional().default(""),
  email: z.string().trim().max(120).refine((value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Enter a valid email."),
  address: z.string().trim().max(240).optional().default(""),
  countryRegion: z.string().trim().max(80).optional().default(""),
  isDefault: z.boolean().optional(),
});

/** Shared runtime validation and OpenAPI request schemas. */
export const clientRequestSchemas = {
  "POST /api/packages/:id/service-requests": serviceApplication,
  "POST /api/shipments/:id/service-requests": serviceApplication,
"PATCH /api/me": z.object({
      name: z.string().trim().min(1).max(80),
      phone: z.string().trim().max(30).nullable(),
      country: z.string().trim().max(2).nullable(),
    }),
"PATCH /api/me/preferences": z.object({
      emailEnabled: z.boolean(),
      packageReceived: z.boolean(),
      actionRequired: z.boolean(),
      vasCompleted: z.boolean(),
      paymentDue: z.boolean(),
      shipmentShipped: z.boolean(),
      shipmentDelivered: z.boolean(),
    }),
"POST /api/me/email": z.object({ email: z.string().trim().email().max(200), password: z.string().max(200).optional().default(""), code: z.string().max(20).optional().default("") }),
"POST /api/me/google/unlink": z.object({ password: z.string().min(8).max(200) }),
"POST /api/account/email/confirm": z.object({ token: z.string().trim().min(20).max(200) }),
"POST /api/packages/prealert": z.object({
      items: z.array(prealertItem).min(1, "Enter at least one tracking number.").max(30, "You can pre-alert up to 30 tracking numbers at once."),
    }),
"POST /api/packages/:id/exceptions": z.object({ action: z.enum(["ACCEPT", "INSPECTION", "RETURN", "DISPOSAL", "SUPPORT"]) }),
"POST /api/shipping/quotes": z.object({ packageIds: z.array(z.string()).min(1), addressId: z.string().min(1) }),
"POST /api/shipments": z.object({
      services: serviceSelection.optional(),
      packageIds: z.array(z.string()).min(1),
      addressId: z.string().min(1),
      quoteId: z.string().min(1),
      routeCode: z.string().min(1),
      packingInstruction: z.enum([
        "Remove unnecessary seller packaging",
        "Keep original seller packaging",
        "Reinforce carton",
        "Other instructions",
      ]),
      packingNote: z.string().trim().max(300).optional(),
    }),
"POST /api/shipments/:id/documents": z.object({ kind: z.enum(["proforma", "shipping_invoice", "payment_receipt"]), profileId: z.string().min(1).nullable().optional() }),
"POST /api/checkout": z.object({ shipmentIds: z.array(z.string()).min(1) }),
"POST /api/checkout/:id/stripe": stripeRedirectInput,
"POST /api/wallet/top-up/stripe": stripeRedirectInput.extend({ amountFen: z.number().int().positive() }),
"POST /api/team/accept": z.object({
      token: z.string().trim().min(20).max(200),
      name: z.string().trim().max(80).optional(),
      password: z.string().max(200).optional(),
    })
};
export const calculatorBody = z.object({
  countryCode: z.string().trim().toUpperCase().length(2, "Choose a destination country."),
  weightKg: z.number().positive("Weight must be greater than 0 kg.").max(100000),
  lengthCm: z.number().positive().max(10000).optional(),
  widthCm: z.number().positive().max(10000).optional(),
  heightCm: z.number().positive().max(10000).optional(),
  attribute: z.string().trim().min(1, "Choose a cargo type.").max(64),
});
