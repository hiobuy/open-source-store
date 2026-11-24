import type { ProcurementAddress } from "./types";

export type ProcurementPage<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export type ProcurementListQuery = {
  page: number;
  pageSize: number;
  status: string;
  q: string;
};

export type ProcurementWarehouse = {
  available: boolean;
  name: string;
  phone: string;
  recipient: string;
  memberCode: string;
  fullAddress: string;
  postalCode: string;
  province?: string;
  city?: string;
  district?: string;
  street?: string;
  country?: string;
  hours: string;
  freeStorageDays: number;
  receivingRules: string[];
  prohibitedItems: string[];
  inboundNotes: string[];
};

export type ProcurementDisplayStatus = {
  key: string;
  label: string;
  tone: "success" | "warning" | "danger" | "info" | "neutral";
};

export type ProcurementPhoto = {
  id: string;
  label: string;
  url?: string | null;
};

export type ProcurementTimelineEvent = {
  at: string;
  title: string;
  detail: string;
};

export type ProcurementExceptionAction =
  "ACCEPT" | "INSPECTION" | "RETURN" | "DISPOSAL" | "SUPPORT";

export type ProcurementParcel = {
  id: string;
  publicId: string;
  domesticTrackingNumber: string;
  courier: string;
  packageStatus: string;
  displayStatus: ProcurementDisplayStatus;
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  volumetricWeightGrams: number | null;
  productName: string | null;
  goodsItems: { name: string; quantity: number; imageUrl: string | null }[];
  sellerPlatform: string | null;
  quantity: number | null;
  declaredValueFen: number | null;
  notes: string | null;
  receivedAt: string | null;
  createdAt: string;
  eligible: boolean;
  ineligibleReason: string | null;
  cargoAttributes: string[];
  photos: ProcurementPhoto[];
  freeStorageRemainingDays: number | null;
  storageWarning: boolean;
  storageFeeFen: number;
  binLocation?: string | null;
  exception: {
    id: string;
    type: string;
    description: string;
    message: string;
    actions: { code: ProcurementExceptionAction; label: string }[];
  } | null;
  vasRequests: {
    id: string;
    name: string;
    status: string;
    note?: string | null;
  }[];
  timeline?: ProcurementTimelineEvent[];
};

export type ProcurementClaim = {
  id: string;
  domesticTrackingNumber: string;
  courier: string;
  receivedAt: string;
  weightGrams: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  photos: ProcurementPhoto[];
};

export type ProcurementPrealert = {
  courier: string;
  trackingNumber: string;
  productName?: string;
  quantity?: number;
  declaredValueFen?: number;
  platform?: "1688" | "Taobao" | "JD" | "Pinduoduo" | "Other";
  notes?: string;
};

export type ProcurementPrealertResult = {
  created: ProcurementParcel[];
  skipped: { trackingNumber: string; message: string }[];
};

export type ProcurementShippingQuote = {
  routeCode: string;
  routeName: string;
  currency: string;
  estimatedMinFen: number;
  estimatedMaxFen: number;
  description?: string;
  daysMin?: number;
  daysMax?: number;
  taxNote?: string;
  restrictions?: string;
  supportsTracking?: boolean;
  doorToDoor?: boolean;
};

export type ProcurementShippingQuotes = {
  quoteId?: string;
  expiresAt?: string;
  estimatedWeightGrams?: number;
  routes: ProcurementShippingQuote[];
  failure: {
    message: string;
    detail: string;
    packages: { publicId: string; cargo: string[] }[];
  } | null;
};

export const packingInstructions = [
  "Remove unnecessary seller packaging",
  "Keep original seller packaging",
  "Reinforce carton",
  "Other instructions",
] as const;

export type ProcurementShipmentInput = {
  packageIds: string[];
  addressId: string;
  quoteId: string;
  routeCode: string;
  packingInstruction: (typeof packingInstructions)[number];
  packingNote?: string;
};

export type ProcurementShipment = {
  id: string;
  publicId: string;
  status: string;
  displayStatus: ProcurementDisplayStatus;
  createdAt: string;
  trackingNumber?: string | null;
  canCancel: boolean;
  packingInstruction?: string | null;
  packingNote?: string | null;
  packageCount: number;
  packages: {
    id: string;
    publicId: string;
    domesticTrackingNumber: string | null;
    courier: string | null;
    weightGrams: number | null;
    lengthMm: number | null;
    widthMm: number | null;
    heightMm: number | null;
    volumetricWeightGrams?: number | null;
    cargoAttributes: string[];
  }[];
  destination?: Pick<
    ProcurementAddress,
    | "name"
    | "phone"
    | "countryCode"
    | "countryName"
    | "state"
    | "city"
    | "postalCode"
    | "addressLine1"
    | "addressLine2"
  > | null;
  shippingMethod?: { routeName: string; currency: string } | null;
  finalWeightGrams?: number | null;
  finalLengthMm?: number | null;
  finalWidthMm?: number | null;
  finalHeightMm?: number | null;
  charges?: {
    id: string;
    name: string;
    currency: string;
    status: string;
    amountFen: number;
  }[];
  amountFen: number;
  photos: ProcurementPhoto[];
  timeline?: ProcurementTimelineEvent[];
  cartons: {
    id: string;
    code: string;
    status: string;
    weightGrams: number | null;
    lengthMm: number | null;
    widthMm: number | null;
    heightMm: number | null;
    trackingNumber: string | null;
    packages: { id: string; publicId: string }[];
  }[];
};

export type WarehousePackagePhoto = {
  id: string;
  type: string;
  label: string;
  url: string;
  createdAt: string;
};

export type ProcurementShipmentDetail = Omit<
  ProcurementShipment,
  "packages"
> & {
  packages: Array<
    ProcurementShipment["packages"][number] & {
      packageStatus: string;
      receivedAt: string | null;
      photos: WarehousePackagePhoto[];
      itemSource: "purchase" | "fulfillment" | "prealert" | null;
      items: {
        itemId: string | null;
        orderId: string | null;
        orderNumber: string | null;
        sku: string | null;
        variantLabel: string | null;
        imageUrl: string | null;
        currency: string | null;
        name: string;
        quantity: number | null;
        receivedQuantity: number | null;
        unitPriceCents: number | null;
      }[];
      goodsItems: {
        name: string;
        quantity: number;
        imageUrl: string | null;
      }[];
    }
  >;
};

export type ProcurementTracking = {
  available: boolean;
  trackingNumber: string | null;
  carrier: string | null;
  events: { at: string; title: string; location: string }[];
};

export type ProcurementCheckout = {
  id: string;
  status: string;
  currency: string;
  totalFen: number;
  walletBalanceFen: number;
  amountNeededFen: number;
  expiresAt: string;
  paidAt: string | null;
  items: { id: string; label: string; amountFen: number }[];
};

export type ProcurementDocumentKind =
  "proforma" | "shipping_invoice" | "payment_receipt";

export type ProcurementDocument = {
  id: string;
  number: string;
  kind: string;
  title: string;
  status: string;
  paymentStatus: string;
  currency: string;
  totalFen: number;
  issuedAt: string;
};

export type ProcurementDocuments = {
  documents: ProcurementDocument[];
  capabilities: {
    proforma: boolean;
    shippingInvoice: boolean;
    receipt: boolean;
  };
  sellerReady: boolean;
  profiles: { id: string; label: string; isDefault: boolean }[];
};

export type ProcurementNotification = {
  id: string;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
};
