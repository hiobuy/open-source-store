export type PurchaseAttachment = {id:string;filename:string;url:string;contentType:string;size:number;createdAt:number};
export type ProcurementItem = {remark?:string;attachments?:PurchaseAttachment[];imageUrl?:string|null;sourceUrl?:string|null;productId?:string|null;variantLabel?:string|null;sellingLineCents?:number|null;sellingCurrency?:string|null; id: string; name: string; sku: string; quantity: number; unitPriceCents: number };
export type ProcurementOrder = {
  id: string; number: string; customerId: string; customer: string; member: string;
  orderType?: "standard" | "manual"; country?:string|null; platform: string; status: "draft" | "cancelled"; currency: string;
  goodsCents: number; shippingCents: number; totalCents: number; version: number; createdAt: number;
  items: ProcurementItem[];
  overview?: {paidCostCnyCents?:number|null;estimatedCostCnyCents?:number|null;procurementPayment?:string|null;profitCnyCents?:number|null;amountMetadata?:ReturnType<typeof import("../domain/purchase-amounts").purchaseAmountMetadata>;billGoodsCents?:number|null;billShippingCents?:number|null;billServiceCents?:number|null;billDiscountCents?:number|null;stage:string;ordered:number;received:number;openCases:number;payment:string;billId:string|null;billCurrency:string|null;billTotalCents:number|null;billPaidCents?:number|null;remoteId:string|null;remoteStatus:string|null;packages:{id:string;publicId:string;tracking:string;status:string}[]};
  remote?: {state:string;paymentStatus:string}|null;
};
export type ProcurementBill = {paidCents?:number;dueCents?:number;overpaidCents?:number;estimated?:boolean; paidAt?:number|null;exchangeRate?:number|null; id: string; status: "issued" | "void" | "paid"; currency: string; goodsCents: number; serviceCents: number; shippingCents: number; discountCents: number; totalCents: number; createdAt: number; version: number; voidReason: string | null; policyVersion: number; lines: { name: string; sku: string; quantity: number; goodsCents: number; serviceCents: number }[] };
export type ProcurementDetail = ProcurementOrder & { remark?:string; attachments?:{id:string;filename:string;url:string;contentType:string;size:number;createdAt:number}[]; coupon?:{code:string;currency:string;discountCents:number;state:"reserved"|"redeemed"|"released"}|null; receiving: { items: ({ itemId: string } & ReturnType<typeof import("../domain/procurement-tracking").receivingProgress>)[]; openCases: number }; bills: ProcurementBill[]; activity: { id: string; action: string; at: number; author: string }[]; notes: { id: string; text: string; kind: "internal" | "resolution"; createdAt: number; author: string }[] };
export type ProcurementPackageLink = { id: string; itemId: string; packageId: string; publicId: string; tracking: string; packageStatus: string; allocatedQuantity: number; receivedQuantity: number; active: boolean; createdAt: number };
export type ProcurementAftersale = { id: string; itemId: string; linkId: string | null; publicId: string | null; kind: typeof import("../domain/procurement-tracking").AFTERSALE_KINDS[number]; quantity: number; status: import("../domain/procurement-tracking").AftersaleStatus; reason: string; resolution: string | null; createdAt: number };
export type ProcurementTrackingEvent = { publicId: string | null; id: string; itemId: string; linkId: string | null; caseId: string | null; action: string; note: string; beforeQuantity: number | null; afterQuantity: number | null; fromStatus: string | null; toStatus: string | null; createdAt: number; author: string | null };
export type ProcurementTrackingPage<T> = { items: T[]; page: number; pageSize: number; total: number };
export type MarketingRecord = {
  id: string; group: "coupons" | "campaigns"; name: string; code: string; enabled: boolean;
  from: string; to: string; version: number; currency: string;
  kind: "percent" | "fixed"; amount: number; minimum: number; limit: number; channel: string;
  status: "Enabled" | "Disabled" | "Scheduled" | "Expired";
};
export type OperationsList<T> = { items: T[]; total: number; page: number; pageSize: number; counts: Record<string, number> };
export type ProcurementCustomer = { id: string; name: string; memberCode: string };
export type DomesticTrace = {
  trackingNumber: string | null;
  carrier: string | null;
  statusLabel: string | null;
  events: Record<string, unknown>[];
  trackingStatus: "available" | "empty";
};
export type DomesticTracking = {
  channel: string | null;
  trackingStatus: "available" | "empty" | "unavailable" | "not_ready";
  packages: DomesticTrace[];
};
