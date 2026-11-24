export interface ProcurementSignedInUser {
  email: string;
  name?: string | null;
}

export interface ProcurementAuthResponse {
  sessionEstablished: boolean;
  status?: boolean;
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    image?: string | null;
    memberCode?: string | null;
  };
}

export interface ProcurementProfile {
  id: string;
  name: string;
  email: string;
  memberCode: string;
  phone: string | null;
  country: string | null;
}

export interface ProcurementPreferences {
  emailEnabled: boolean;
  packageReceived: boolean;
  actionRequired: boolean;
  vasCompleted: boolean;
  paymentDue: boolean;
  shipmentShipped: boolean;
  shipmentDelivered: boolean;
}

export interface ProcurementMe extends ProcurementProfile {
  isAdmin: boolean;
  demoMode: boolean;
  preferences: ProcurementPreferences | null;
  emailDeliveryConfigured: boolean;
  googleSignIn: boolean;
  hasPassword?: boolean;
  googleLinked?: boolean;
  pendingEmail?: { email: string; expiresAt: string } | null;
}

export interface ProcurementAddress {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string | null;
  company: string | null;
  phoneCode: string;
  phone: string;
  countryCode: string;
  countryName: string;
  regionCode: string | null;
  state: string;
  city: string;
  district: string | null;
  postalCode: string;
  addressLine1: string;
  addressLine2: string | null;
  isDefault: boolean;
}

export type ProcurementAddressInput = Omit<
  ProcurementAddress,
  | "id"
  | "name"
  | "countryName"
  | "email"
  | "company"
  | "regionCode"
  | "district"
  | "addressLine2"
> & {
  regionCode: string;
  email?: string;
  company?: string;
  district?: string;
  addressLine2?: string;
};

export interface ProcurementDestination {
  code: string;
  name: string;
  dial?: string;
  regions?: { code: string; name?: string }[];
}

export interface ProcurementWallet {
  balanceFen: number;
  currency: string;
  lowBalance: boolean;
}

export const MAX_BANK_TRANSFER_PROOF_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Upstream accepts one PNG or JPEG up to 3 MiB. */
export const MAX_CLIENT_IMAGE_BYTES = 3 * 1024 * 1024;

export interface ProcurementAnnouncement {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  publishedAt: number | null;
}

export interface ProcurementUploadedImage {
  id: string;
  url: string;
}

export interface ProcurementBankAccount {
  id: string;
  label: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  swift: string;
  country: string;
  currency: string;
  instructions: string;
}

export interface ProcurementPaymentOptions {
  currency: string;
  stripe: boolean;
  cardTopup: boolean;
  bank: boolean;
  bankAccounts: ProcurementBankAccount[];
  minTopupFen: number;
  maxTopupFen: number;
}

export interface ProcurementWalletTransaction {
  id: string;
  type: string;
  currency: string;
  description: string;
  amountFen: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

export interface ProcurementTransactionPage {
  items: ProcurementWalletTransaction[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ProcurementFavorite {
  id: string;
  channel: string;
  productId: string;
  product: {
    id: string;
    title: Record<string, string>;
    sourceUrl: string | null;
    images: string[];
    pricing: "preview_required";
  };
}

export interface ProcurementFavoritesPage {
  items: ProcurementFavorite[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProcurementBrowsingRecord extends ProcurementFavorite {
  lastViewedAt: number;
}

export interface ProcurementShopSubscription {
  id: string;
  channel: ProcurementProductChannel;
  shopId: string;
  name: string | null;
  url: string | null;
  imageUrl: string | null;
  createdAt: number;
}

export interface ProcurementPurchaseOrderAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: number;
  url: string;
}

export interface ProcurementPurchaseOrderItem {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  productId: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  variantLabel: string | null;
  currency?: string | null;
  unitPriceCents?: number | null;
  subtotalCents?: number | null;
  referencePrice?: {
    currency: "CNY";
    unitPriceCents: number | null;
    subtotalCents: number | null;
  };
  remark?: string;
  attachments?: ProcurementPurchaseOrderAttachment[];
}

export interface ProcurementPurchaseBill {
  id: string;
  status: string;
  currency: string;
  goodsCents: number;
  serviceCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  dueCents?: number;
  version?: number;
  paidAt: number | null;
  /** Settled payment method; "mixed" = wallet + Stripe. */
  paymentMethod?: "wallet" | "stripe" | "mixed" | null;
}

export interface ProcurementPurchaseStripePayment {
  paymentId: string;
  orderId: string;
  sessionId: string | null;
  url: string | null;
  status: "pending" | "paid" | "expired" | "review";
  amountCents: number;
  currency: string;
}

export interface ProcurementPurchaseOrder {
  id: string;
  number: string;
  platform: string;
  orderType?: "standard" | "manual";
  status: string;
  stage: string;
  createdAt: number;
  items: ProcurementPurchaseOrderItem[];
  bills: ProcurementPurchaseBill[];
  fulfillment: {
    state: string;
    status: string | null;
    updatedAt: number;
  } | null;
  logistics?: ProcurementPurchaseLogistics;
}

/** Only the fields this site displays; see GET /api/purchase-orders/{id}. */
export interface ProcurementPurchaseLogistics {
  domesticParcels: Array<{
    packageId: string | null;
    trackingNumber: string;
    carrier: string | null;
  }>;
  internationalShipments: Array<{
    shipmentId: string;
    publicId: string;
    status: string;
    trackingNumber: string | null;
    carrier: string | null;
    trackingStatus: "not_loaded" | "available" | "unavailable";
    events: Array<{ at: string; title: string; location: string }>;
  }>;
}

export interface ProcurementPurchaseOrderPage {
  items: ProcurementPurchaseOrder[];
  total: number;
  page: number;
  pageSize: number;
  counts?: Record<string, number>;
}

export interface ProcurementSecurity {
  google: { enabled: boolean };
  turnstile: {
    enabled: boolean;
    siteKey: string;
    login: boolean;
    register: boolean;
    reset: boolean;
  };
  customerAi?: boolean;
}

export interface ProcurementExchangeRates {
  baseCurrency: "CNY";
  scale: 10000;
  unitsPerCnyScale: 100000000;
  settlementCurrency: string;
  displayOnly: true;
  items: {
    currency: string;
    /** @deprecated Use unitsPerCnyE8; this uses the inverse direction. */
    cnyPerUnitE4: number;
    unitsPerCnyE8: number;
    version: number;
    updatedAt: number;
  }[];
}

export interface ProcurementProductCategory {
  id: string;
  parentId: string | null;
  name: string;
  locale: string;
  icon: { type: "name" | "url"; value: string } | null;
  keyword: string;
  sortOrder: number;
}

export interface ProcurementProductCategoryList {
  items: ProcurementProductCategory[];
  total: number;
}

export type ProcurementProductChannel = "1688" | "taobao" | "weidian";

export interface ProcurementDisplayPrice {
  currency: "CNY";
  displayOnly: true;
  unitPriceCents: number | null;
  promotionPriceCents: number | null;
}

export interface ProcurementPriceTier {
  minQuantity: number;
  unitPriceCents: number | null;
  promotionPriceCents: number | null;
}

export interface ProcurementProductShop {
  id: string | null;
  name: string | null;
  url: string | null;
}

export interface ProcurementProductVariant {
  skuId: string;
  stock: number | null;
  image: string | null;
  attributes: Record<string, string>[];
  price?: ProcurementDisplayPrice;
}

export interface ProcurementProductDescription {
  original: string | null;
  translated: string | null;
  language: string | null;
}

export interface ProcurementProductAttribute {
  attribute_id: string | null;
  name: string | null;
  value: string | null;
  original_name: string | null;
  original_value: string | null;
}

export interface ProcurementProduct {
  id: string;
  channel: ProcurementProductChannel;
  title: Record<string, string>;
  sourceUrl: string | null;
  images: string[];
  variants: ProcurementProductVariant[];
  pricing: "preview_required";
  price?: ProcurementDisplayPrice;
  priceTiers?: ProcurementPriceTier[];
  shop?: ProcurementProductShop;
  description?: ProcurementProductDescription | null;
  attributes?: ProcurementProductAttribute[] | null;
  minOrderQuantity?: number | null;
  orderQuantityMultiple?: number | null;
}

export type ProcurementManualPlatform = "jd" | "pinduoduo" | "poizon";

export interface ProcurementManualOrderForm {
  id: string;
  sourcePlatform: ProcurementManualPlatform;
  sellerName: string;
  domesticShippingCents: number;
  remark: string;
  items: {
    productUrl: string;
    name: string;
    specification: string;
    unitPriceCents: number;
    quantity: number;
    imageUrl: string | null;
    remark: string;
  }[];
}

export interface ProcurementManualCartItem {
  id: string;
  form: ProcurementManualOrderForm;
  version: number;
  state: "draft" | "submitting" | "submitted" | "removed";
}

export interface ProcurementCartSelection {
  id: string;
  type?: "standard" | "manual";
  version: number;
}

export interface ProcurementCartShop {
  id: string | null;
  name: string | null;
  url: string | null;
}

export interface ProcurementCartItem extends ProcurementCartSelection {
  type?: "standard";
  channel: ProcurementProductChannel;
  productId: string;
  product: ProcurementProduct;
  skuId: string;
  quantity: number;
  createdAt?: number;
  updatedAt?: number;
  shop?: ProcurementCartShop;
  currency?: "CNY";
  displayOnly?: true;
  unitPriceCents?: number | null;
  subtotalCents?: number | null;
  priceComplete?: boolean;
  snapshotAt?: number | null;
}

export interface ProcurementCartManualItem {
  type: "manual";
  id: string;
  form: ProcurementManualOrderForm;
  version: number;
  state: "draft" | "submitting" | "submitted" | "removed";
  createdAt?: number;
  updatedAt?: number;
  quantity: number;
  unitPriceCents: null;
  subtotalCents: null;
  priceComplete: false;
}

export interface ProcurementCartStandardGroup {
  type?: "standard";
  key: string;
  channel: string;
  shop: ProcurementCartShop;
  items: ProcurementCartItem[];
  totalQuantity: number;
  subtotalCents: number | null;
  priceComplete: boolean;
}

export interface ProcurementCartManualGroup {
  type: "manual";
  key: string;
  channel: string;
  shop: ProcurementCartShop;
  items: ProcurementCartManualItem[];
  totalQuantity: number;
  subtotalCents: null;
  priceComplete: false;
}

export type ProcurementCartGroup =
  ProcurementCartStandardGroup | ProcurementCartManualGroup;

export interface ProcurementCartList {
  standardTotal?: number;
  manualTotal?: number;
  standardSubtotalCents?: number | null;
  currency: "CNY";
  displayOnly: true;
  groups: ProcurementCartGroup[];
  total: number;
  totalQuantity: number;
  subtotalCents: number | null;
  priceComplete: boolean;
}

export interface ProcurementPurchaseLine {
  id: string;
  spec_id: string;
  quantity: number;
}

interface ProcurementQuoteAmounts {
  currency: string;
  goodsCents: number;
  serviceCents: number;
  shippingCents: number;
  totalCents: number;
}

export interface ProcurementQuoteLine {
  name: string;
  sku: string;
  quantity: number;
  goodsCents: number;
  serviceCents: number;
}

export interface ProcurementCartPreviewGroup {
  key: string;
  type: "standard" | "manual";
  platform: string;
  shop: ProcurementCartShop;
  estimated?: boolean;
  quote: ProcurementQuoteAmounts & {
    discountCents?: number;
    lines?: ProcurementQuoteLine[];
  };
}

export interface ProcurementCartCheckoutOrder {
  id: string;
  key: string;
  type: "standard" | "manual";
  platform: string;
}

export interface ProcurementCartCheckout {
  id: string;
  previewId: string;
  currency: string;
  totalCents: number;
  orders: ProcurementCartCheckoutOrder[];
}

export interface ProcurementPurchaseQuote extends ProcurementQuoteAmounts {
  id: string;
  expiresAt: number;
  referencePrice?: ProcurementQuoteAmounts;
  lines?: ProcurementQuoteLine[];
  groups?: ProcurementCartPreviewGroup[];
  discountCents?: number;
  orderCount?: number;
}

export interface ProcurementProductSearchRequest {
  channel: ProcurementProductChannel;
  keyword: string;
  page: number;
  page_size: number;
  language: string;
}

export interface ProcurementProductSearchResult {
  items: {
    id: string;
    channel: ProcurementProductChannel;
    title: Record<string, string>;
    sourceUrl: string | null;
    images: string[];
    price?: ProcurementDisplayPrice;
  }[];
  page: number;
  pageSize: number;
  total: number | null;
}

export interface ProductSearchItem {
  id: string | number;
  channel?: ProcurementProductChannel;
  title: string;
  imageUrl?: string;
  sourceUrl?: string;
  /** 单价，单位：CNY 分 */
  price?: number;
}

export interface ProductSearchPage {
  items: ProductSearchItem[];
  total: number;
  hasMore: boolean;
}

export interface ProcurementSignInResponse extends ProcurementAuthResponse {
  twoFactorRedirect?: boolean;
  twoFactorMethods?: string[];
}

export type ProcurementTwoFactorResponse = ProcurementAuthResponse;

export interface ProcurementCalculatorCountry {
  code: string;
  name: string;
}

export interface ProcurementCalculatorAttribute {
  code: string;
  name: string;
}

export interface ProcurementCalculatorOptions {
  connected: boolean;
  countries: ProcurementCalculatorCountry[];
  attributes: ProcurementCalculatorAttribute[];
  message: string | null;
  demo?: boolean;
}

export interface ProcurementShippingQuote {
  code: string;
  name: string;
  description: string | null;
  eta: string | null;
  note: string | null;
  partial: boolean;
  priceUsdFen: number;
}

export interface ProcurementShippingEstimate {
  quotes: ProcurementShippingQuote[];
  disclaimer: string;
}

export interface ProcurementShippingChannelService {
  name: string;
  mode: string;
  description: string | null;
  price: string | null;
}

export interface ProcurementShippingChannelRegion {
  name: string;
  eta: string | null;
}

export interface ProcurementShippingChannel {
  code: string;
  name: string;
  description: string | null;
  range: string | null;
  volumetric: string | null;
  delivery: string[];
  regions: ProcurementShippingChannelRegion[];
  restrictions: string[];
  services: ProcurementShippingChannelService[];
  rates: null;
}

export interface ProcurementShippingEstimateRequest {
  countryCode: string;
  weightKg: number;
  attribute: string;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
}
