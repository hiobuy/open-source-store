import { localizedText } from "./localized-text";
import type {
  ProcurementCheckout,
  ProcurementClaim,
  ProcurementDocument,
  ProcurementDocumentKind,
  ProcurementDocuments,
  ProcurementExceptionAction,
  ProcurementListQuery,
  ProcurementNotification,
  ProcurementPage,
  ProcurementParcel,
  ProcurementPrealert,
  ProcurementPrealertResult,
  ProcurementShipment,
  ProcurementShipmentDetail,
  ProcurementShipmentInput,
  ProcurementShippingQuotes,
  ProcurementTracking,
  ProcurementWarehouse,
} from "./logistics-types";
import type {
  ProductSearchPage,
  ProcurementAddress,
  ProcurementAddressInput,
  ProcurementAnnouncement,
  ProcurementUploadedImage,
  ProcurementAuthResponse,
  ProcurementBrowsingRecord,
  ProcurementCalculatorOptions,
  ProcurementCartCheckout,
  ProcurementCartItem,
  ProcurementCartList,
  ProcurementCartManualItem,
  ProcurementCartSelection,
  ProcurementDestination,
  ProcurementExchangeRates,
  ProcurementFavorite,
  ProcurementFavoritesPage,
  ProcurementManualCartItem,
  ProcurementManualOrderForm,
  ProcurementMe,
  ProcurementPaymentOptions,
  ProcurementPurchaseStripePayment,
  ProcurementProfile,
  ProcurementProduct,
  ProcurementProductCategory,
  ProcurementProductCategoryList,
  ProcurementProductChannel,
  ProcurementProductSearchRequest,
  ProcurementProductSearchResult,
  ProcurementPurchaseOrder,
  ProcurementPurchaseOrderPage,
  ProcurementPurchaseLine,
  ProcurementPurchaseQuote,
  ProcurementSecurity,
  ProcurementShippingChannel,
  ProcurementShippingEstimate,
  ProcurementShippingEstimateRequest,
  ProcurementSignInResponse,
  ProcurementShopSubscription,
  ProcurementTransactionPage,
  ProcurementTwoFactorResponse,
  ProcurementWallet,
} from "./types";

const apiBase = "/api/";
export const procurementClaimsChanged = "procurement:claims-changed";

const PUBLIC_LIST_TTL_MS = 5 * 60_000;
type PublicListCacheEntry = { data: unknown; expiresAt: number };
const publicListCache = new Map<string, PublicListCacheEntry>();
const publicListRequests = new Map<string, Promise<unknown>>();

function getCachedPublicList<T>(
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const pending = publicListRequests.get(key);
  if (pending) return pending as Promise<T>;

  const storageKey = `procurement:list:${key}`;
  let cached = publicListCache.get(key);
  if (!cached) {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) cached = JSON.parse(stored) as PublicListCacheEntry;
    } catch {}
  }
  if (cached && cached.expiresAt > Date.now()) {
    publicListCache.set(key, cached);
    return Promise.resolve(cached.data as T);
  }

  const request = load()
    .then((data) => {
      const entry = { data, expiresAt: Date.now() + PUBLIC_LIST_TTL_MS };
      publicListCache.set(key, entry);
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(entry));
      } catch {}
      return data;
    })
    .finally(() => publicListRequests.delete(key));
  publicListRequests.set(key, request);
  return request;
}

export class ProcurementApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ProcurementApiError";
    this.status = status;
    this.code = code;
  }
}

type ErrorPayload = {
  message?: unknown;
  code?: unknown;
  error?: { code?: unknown; message?: unknown };
};

function readErrorCode(error: ErrorPayload) {
  if (typeof error.code === "string") return error.code;
  if (typeof error.error?.code === "string") return error.error.code;
  return undefined;
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  return response.json().catch(() => null);
}

function errorFromPayload(response: Response, payload: unknown) {
  const error = (payload || {}) as ErrorPayload;
  const message =
    (typeof error.message === "string" && error.message) ||
    (typeof error.error?.message === "string" && error.error.message) ||
    `HTTP ${response.status}`;
  return new ProcurementApiError(
    message,
    response.status,
    readErrorCode(error),
  );
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    signal: init.signal || AbortSignal.timeout(30_000),
  });
  const payload = await readPayload(response);
  if (!response.ok) throw errorFromPayload(response, payload);
  return payload as T;
}

function post<T>(
  path: string,
  body: Record<string, unknown>,
  headers?: HeadersInit,
) {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function readData<T>(path: string) {
  const { data } = await request<{ data: T }>(path);
  return data;
}

async function postData<T>(
  path: string,
  body: Record<string, unknown> = {},
  idempotencyKey?: string,
) {
  const { data } = await post<{ data: T }>(
    path,
    body,
    idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  );
  return data;
}

function listQuery({ page, pageSize, status, q }: ProcurementListQuery) {
  return new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    status,
    q,
  });
}

export function getProcurementWarehouse() {
  return readData<ProcurementWarehouse>("warehouse");
}

export function getProcurementSettlementCurrency() {
  return getCachedPublicList("settlement-currency", async () => {
    const { currency } = await readData<{ currency: string }>("locale");
    return currency;
  });
}

export function getProcurementParcels(query: ProcurementListQuery) {
  return readData<ProcurementPage<ProcurementParcel>>(
    `packages?${listQuery(query)}`,
  );
}

export function getProcurementParcel(id: string) {
  return readData<ProcurementParcel>(`packages/${encodeURIComponent(id)}`);
}

export function submitProcurementPrealerts(items: ProcurementPrealert[]) {
  return postData<ProcurementPrealertResult>("packages/prealert", { items });
}

export function deleteProcurementParcel(id: string) {
  return request(`packages/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function respondToProcurementException(
  id: string,
  action: ProcurementExceptionAction,
) {
  return postData<
    ProcurementParcel | { supportEmail: string; context: string }
  >(`packages/${encodeURIComponent(id)}/exceptions`, { action });
}

export function getProcurementClaims() {
  return readData<ProcurementClaim[]>("claims");
}

export function confirmProcurementClaim(id: string) {
  return postData<ProcurementParcel>(
    `claims/${encodeURIComponent(id)}/confirm`,
  );
}

export function rejectProcurementClaim(id: string) {
  return postData<{ ok: boolean }>(`claims/${encodeURIComponent(id)}/reject`);
}

export function quoteProcurementShipment(
  packageIds: string[],
  addressId: string,
) {
  return postData<ProcurementShippingQuotes>("shipping/quotes", {
    packageIds,
    addressId,
  });
}

export function getProcurementShipments(query: ProcurementListQuery) {
  return readData<ProcurementPage<ProcurementShipment>>(
    `shipments?${listQuery(query)}`,
  );
}

export function getProcurementShipment(id: string) {
  return readData<ProcurementShipmentDetail>(
    `shipments/${encodeURIComponent(id)}`,
  );
}

export function createProcurementShipment(
  input: ProcurementShipmentInput,
  idempotencyKey: string,
) {
  return postData<ProcurementShipment>("shipments", input, idempotencyKey);
}

export function getProcurementTracking(id: string) {
  return readData<ProcurementTracking>(
    `shipments/${encodeURIComponent(id)}/tracking`,
  );
}

export function cancelProcurementShipment(id: string) {
  return postData<ProcurementShipment>(
    `shipments/${encodeURIComponent(id)}/cancel`,
  );
}

export function createProcurementCheckout(shipmentIds: string[]) {
  return postData<ProcurementCheckout>("checkout", { shipmentIds });
}

export function getProcurementCheckout(id: string) {
  return readData<ProcurementCheckout>(`checkout/${encodeURIComponent(id)}`);
}

export function payProcurementCheckout(id: string, idempotencyKey: string) {
  return postData<ProcurementCheckout>(
    `checkout/${encodeURIComponent(id)}/pay`,
    {},
    idempotencyKey,
  );
}

export function startProcurementShipmentStripe(
  id: string,
  urls: { successUrl: string; cancelUrl: string },
) {
  return postData<{ url: string | null }>(
    `checkout/${encodeURIComponent(id)}/stripe`,
    urls,
  );
}

export function getProcurementStripeSession(sessionId: string) {
  return readData<{ status: string; purpose: string | null }>(
    `payments/stripe/session?${new URLSearchParams({ session_id: sessionId })}`,
  );
}

export function getProcurementDocuments(id: string) {
  return readData<ProcurementDocuments>(
    `shipments/${encodeURIComponent(id)}/documents`,
  );
}

export function issueProcurementDocument(
  id: string,
  kind: ProcurementDocumentKind,
  profileId: string | null,
) {
  return postData<ProcurementDocument>(
    `shipments/${encodeURIComponent(id)}/documents`,
    { kind, profileId },
  );
}

export function getProcurementDocumentUrl(id: string) {
  return `${apiBase}documents/${encodeURIComponent(id)}/pdf`;
}

export function getProcurementTransactionReceiptUrl(id: string) {
  return `${apiBase}wallet/transactions/${encodeURIComponent(id)}/receipt`;
}

export function getProcurementNotifications() {
  return readData<ProcurementNotification[]>("notifications");
}

export function markProcurementNotificationsRead() {
  return postData<{ ok: boolean }>("notifications/read");
}

export async function getPublicSecurity(): Promise<ProcurementSecurity> {
  const payload = await request<{ data: ProcurementSecurity }>(
    "security/public",
  );
  return payload.data;
}

export async function getProcurementMe(): Promise<ProcurementMe> {
  const payload = await request<{ data: ProcurementMe }>("me");
  return payload.data;
}

export async function updateProcurementProfile(
  profile: Pick<ProcurementProfile, "name" | "phone" | "country">,
): Promise<ProcurementProfile> {
  const { data } = await request<{ data: ProcurementProfile }>("me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  return data;
}

export function changeProcurementPassword(
  currentPassword: string,
  newPassword: string,
) {
  return post("auth/change-password", { currentPassword, newPassword });
}

export function sendProcurementEmailChallenge() {
  return post("me/email/challenge", {});
}

export async function requestProcurementEmailChange(input: {
  email: string;
  password?: string;
  code?: string;
}) {
  const { data } = await post<{ data: { pendingEmail: string } }>(
    "me/email",
    input,
  );
  return data.pendingEmail;
}

export function resendProcurementEmailChange() {
  return post("me/email/resend", {});
}

export function cancelProcurementEmailChange() {
  return post("me/email/cancel", {});
}

export function confirmProcurementEmailChange(token: string) {
  return post<{ data: { email: string } }>("account/email/confirm", { token });
}

export async function getProcurementNav() {
  const { data } = await request<{
    data: { claims: number; unpaidShipments: number };
  }>("nav");
  return data;
}

export async function getProcurementWallet() {
  const { data } = await request<{ data: ProcurementWallet }>("wallet");
  return data;
}

export async function getProcurementPaymentOptions() {
  const { data } = await request<{ data: ProcurementPaymentOptions }>(
    "payments/options",
  );
  return data;
}

export async function startProcurementStripeTopUp(
  amountFen: number,
  urls: { successUrl: string; cancelUrl: string },
) {
  const { data } = await post<{ data: { url: string | null } }>(
    "wallet/top-up/stripe",
    { amountFen, ...urls },
  );
  return data.url;
}

export function submitProcurementBankTransfer(body: FormData) {
  return request<{ data: { id: string; publicId: string; status: string } }>(
    "wallet/bank-transfers",
    { method: "POST", body },
  );
}

export async function getProcurementWalletTransactions(
  page: number,
  type: string,
) {
  const query = new URLSearchParams({ page: String(page) });
  if (type) query.set("type", type);
  const { data } = await request<{ data: ProcurementTransactionPage }>(
    `wallet/transactions?${query}`,
  );
  return data;
}

export async function getProcurementFavorites(page: number, pageSize: number) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  const { data } = await request<{ data: ProcurementFavoritesPage }>(
    `favorites?${query}`,
  );
  return data;
}

export function deleteProcurementFavorite(id: string) {
  return request(`favorites/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getProcurementFavoriteId(
  channel: ProcurementProductChannel,
  productId: string,
) {
  const { favoriteId } = await readData<{ favoriteId: string | null }>(
    `favorites/status?${new URLSearchParams({ channel, productId })}`,
  );
  return favoriteId;
}

export function getProcurementShopSubscriptions(query: {
  page: number;
  pageSize: number;
}) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  return readData<ProcurementPage<ProcurementShopSubscription>>(
    `shop-subscriptions?${params}`,
  );
}

export async function getProcurementShopSubscriptionId(
  channel: ProcurementProductChannel,
  shopId: string,
) {
  const { subscriptionId } = await readData<{ subscriptionId: string | null }>(
    `shop-subscriptions/status?${new URLSearchParams({ channel, shopId })}`,
  );
  return subscriptionId;
}

export function subscribeToProcurementShop(
  channel: ProcurementProductChannel,
  shopId: string,
  name?: string,
  url?: string,
) {
  return postData<ProcurementShopSubscription>("shop-subscriptions", {
    channel,
    shopId,
    name,
    url,
  });
}

export function unsubscribeFromProcurementShop(id: string) {
  return request(`shop-subscriptions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function recordProcurementProductView(
  channel: ProcurementProductChannel,
  productId: string,
) {
  return postData<ProcurementBrowsingRecord>("browsing-history", {
    channel,
    productId,
  });
}

export function getProcurementBrowsingHistory(query: {
  page: number;
  pageSize: number;
}) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  return readData<ProcurementPage<ProcurementBrowsingRecord>>(
    `browsing-history?${params}`,
  );
}

export function deleteProcurementBrowsingRecord(id: string) {
  return request(`browsing-history/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function clearProcurementBrowsingHistory() {
  return request("browsing-history", { method: "DELETE" });
}

export async function addProcurementFavorite(
  channel: ProcurementProductChannel,
  productId: string,
) {
  const { data } = await post<{ data: ProcurementFavorite }>("favorites", {
    channel,
    productId,
  });
  return data;
}

export async function getProcurementPurchaseOrders(
  page: number,
  pageSize: number,
  status?: string,
  keyword?: string,
) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (status) query.set("status", status);
  if (keyword) query.set("q", keyword);
  const { data } = await request<{ data: ProcurementPurchaseOrderPage }>(
    `purchase-orders?${query}`,
  );
  return data;
}

export async function parseProcurementProduct(url: string, language: string) {
  const { product } = await postData<{ product: ProcurementProduct }>(
    "products/parse",
    { url, language },
  );
  return product;
}

export function getProcurementCartCount() {
  return readData<{ total: number; totalQuantity: number }>("cart/count");
}

export function getProcurementCart() {
  return readData<ProcurementCartList>("cart");
}

export function addProcurementManualCartItem(form: ProcurementManualOrderForm) {
  return postData<ProcurementManualCartItem>("cart/manual-items", { ...form });
}

export async function updateProcurementManualCartItem(
  id: string,
  version: number,
  form: ProcurementManualOrderForm,
) {
  const { data } = await request<{ data: ProcurementCartManualItem }>(
    `cart/manual-items/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version, form }),
    },
  );
  return data;
}

export function deleteProcurementManualCartItem(id: string, version: number) {
  return request<{ data: { ok: boolean } }>(
    `cart/manual-items/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    },
  );
}

export function createProcurementManualOrder(form: ProcurementManualOrderForm) {
  return postData<{ id: string }>("purchase-orders/manual", { ...form });
}

export function addProcurementCartItem(input: {
  channel: ProcurementProductChannel;
  productId: string;
  skuId: string;
  quantity: number;
}) {
  return postData<ProcurementCartItem>("cart/items", input);
}

export async function updateProcurementCartItem(
  item: ProcurementCartSelection,
  quantity: number,
) {
  const { data } = await request<{ data: ProcurementCartItem }>(
    `cart/items/${encodeURIComponent(item.id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity, version: item.version }),
    },
  );
  return data;
}

export function deleteProcurementCartItem(id: string) {
  return request<{ data: { ok: boolean } }>(
    `cart/items/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export function previewProcurementCart(items: ProcurementCartSelection[]) {
  return postData<ProcurementPurchaseQuote>("cart/preview", { items });
}

export function checkoutProcurementCart(id: string, previewId: string) {
  return postData<ProcurementCartCheckout>("cart/checkout", {
    id,
    previewId,
    confirm: true,
  });
}

export function previewProcurementPurchase(
  channel: ProcurementProductChannel,
  lines: ProcurementPurchaseLine[],
) {
  return postData<ProcurementPurchaseQuote>("purchase-orders/preview", {
    channel,
    lines,
  });
}

export function createProcurementPurchaseOrder(
  id: string,
  quoteId: string,
  items: {
    productId: string;
    skuId: string;
    remark: string;
    attachmentUploadIds: string[];
  }[] = [],
) {
  return postData<ProcurementPurchaseOrder>("purchase-orders", {
    id,
    quoteId,
    ...(items.length ? { items } : {}),
  });
}

export async function getProcurementPurchaseOrder(id: string) {
  const { data } = await request<{ data: ProcurementPurchaseOrder }>(
    `purchase-orders/${encodeURIComponent(id)}`,
  );
  return data;
}

export function getProcurementPurchaseOrderAttachmentUrl(
  orderId: string,
  attachmentId: string,
) {
  return `${apiBase}purchase-orders/${encodeURIComponent(orderId)}/attachments/${encodeURIComponent(attachmentId)}`;
}

export async function payProcurementPurchaseOrder(id: string) {
  const { data } = await post<{ data: ProcurementPurchaseOrder }>(
    `purchase-orders/${encodeURIComponent(id)}/pay`,
    { confirm: true },
  );
  return data;
}

export function getProcurementPurchaseStripe(orderId: string) {
  return readData<ProcurementPurchaseStripePayment | null>(
    `purchase-orders/${encodeURIComponent(orderId)}/stripe`,
  );
}

export function startProcurementPurchaseStripe(
  orderId: string,
  input: {
    id: string;
    billVersion: number;
    amountCents: number;
    successUrl: string;
    cancelUrl: string;
  },
) {
  return postData<ProcurementPurchaseStripePayment>(
    `purchase-orders/${encodeURIComponent(orderId)}/stripe`,
    { ...input, confirm: true },
  );
}

export async function getProcurementDestinations() {
  const { data } = await request<{
    data: ProcurementDestination[] | { countries: ProcurementDestination[] };
  }>("destinations");
  return Array.isArray(data) ? data : data.countries;
}

export async function getProcurementAddresses() {
  const { data } = await request<{ data: ProcurementAddress[] }>("addresses");
  return data;
}

export async function saveProcurementAddress(
  address: ProcurementAddressInput,
  id?: string,
) {
  const { data } = id
    ? await request<{ data: ProcurementAddress }>(
        `addresses/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(address),
        },
      )
    : await post<{ data: ProcurementAddress }>("addresses", address);
  return data;
}

export function deleteProcurementAddress(id: string) {
  return request(`addresses/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function setDefaultProcurementAddress(id: string) {
  return post(`addresses/${encodeURIComponent(id)}/default`, {});
}

export function getExchangeRates(): Promise<ProcurementExchangeRates> {
  return getCachedPublicList("rates", async () => {
    const { data } = await request<{ data: ProcurementExchangeRates }>(
      "exchange-rates",
    );
    return data;
  });
}

export function getProductCategories(
  locale: string,
): Promise<ProcurementProductCategory[]> {
  return getCachedPublicList(`products/categories:${locale}`, async () => {
    const query = new URLSearchParams({ locale });
    const { data } = await request<{ data: ProcurementProductCategoryList }>(
      `products/categories?${query}`,
    );
    return data.items;
  });
}

function toProductSearchPage(
  data: ProcurementProductSearchResult,
  language: string,
): ProductSearchPage {
  return {
    items: data.items.map(
      ({ id, channel, title, sourceUrl, images, price }) => {
        const unitPriceCents = price?.unitPriceCents;
        return {
          id,
          channel,
          title: localizedText(title, language),
          sourceUrl: sourceUrl ?? undefined,
          imageUrl: images[0],
          ...(unitPriceCents == null ? {} : { price: unitPriceCents }),
        };
      },
    ),
    total: data.total ?? 0,
    hasMore:
      data.page < 400 &&
      data.items.length > 0 &&
      (data.total === null
        ? data.items.length >= data.pageSize
        : data.page * data.pageSize < data.total),
  };
}

export async function searchProducts(
  input: ProcurementProductSearchRequest,
): Promise<ProductSearchPage> {
  const { data } = await post<{ data: ProcurementProductSearchResult }>(
    "products/search",
    { ...input },
  );
  return toProductSearchPage(data, input.language);
}

export async function searchShopProducts(input: {
  channel: "1688" | "weidian";
  shopId: string;
  keyword?: string;
  page: number;
  page_size: number;
  language: string;
}): Promise<ProductSearchPage> {
  const { data } = await post<{ data: ProcurementProductSearchResult }>(
    "products/seller/search",
    {
      channel: input.channel,
      // 1688 identifies shops by seller_open_id, Weidian by shop_id.
      [input.channel === "1688" ? "seller_open_id" : "shop_id"]: input.shopId,
      ...(input.keyword ? { keyword: input.keyword } : {}),
      page: input.page,
      page_size: input.page_size,
      language: input.language,
    },
  );
  return toProductSearchPage(data, input.language);
}

export async function searchProductsByImage(input: {
  channel: ProcurementProductChannel;
  uploadId?: string;
  imageUrl?: string;
  page: number;
  page_size: number;
  language: string;
}): Promise<ProductSearchPage> {
  const { data } = await post<{ data: ProcurementProductSearchResult }>(
    "products/search-by-image",
    {
      channel: input.channel,
      uploadId: input.uploadId,
      image_url: input.imageUrl,
      page: input.page,
      page_size: input.page_size,
      language: input.language,
    },
  );
  return toProductSearchPage(data, input.language);
}

export async function getShippingCalculatorOptions(): Promise<ProcurementCalculatorOptions> {
  const payload = await request<{ data: ProcurementCalculatorOptions }>(
    "shipping/calculator/options",
  );
  return payload.data;
}

export async function estimateShipping(
  input: ProcurementShippingEstimateRequest,
): Promise<ProcurementShippingEstimate> {
  const payload = await post<{ data: ProcurementShippingEstimate }>(
    "shipping/calculator",
    { ...input },
  );
  return payload.data;
}

export async function getShippingChannel(
  code: string,
  country: string,
): Promise<ProcurementShippingChannel> {
  const query = new URLSearchParams({ code, country });
  const payload = await request<{ data: ProcurementShippingChannel }>(
    `shipping/calculator/channel?${query.toString()}`,
  );
  return payload.data;
}

const verifiedCallbackURL = "/login?verified=1";

function turnstileHeaders(turnstileToken?: string | null): HeadersInit {
  return turnstileToken ? { "X-Turnstile-Token": turnstileToken } : {};
}

/**
 * Better Auth returns the session token in the body and `set-auth-token`; the
 * session itself lives in the cookie. Pages only need to know whether one was
 * established, so the token is reduced to a flag and dropped.
 */
async function postAuth<T extends ProcurementAuthResponse>(
  path: string,
  body: Record<string, unknown>,
  headers?: HeadersInit,
): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await readPayload(response);
  if (!response.ok) throw errorFromPayload(response, payload);
  const result = (
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : {}
  ) as Record<string, unknown>;
  const token = result.token;
  delete result.token;
  result.sessionEstablished = Boolean(
    response.headers.get("set-auth-token") ||
    (typeof token === "string" && token),
  );
  return result as T;
}

export function signUpWithEmail(
  input: { name: string; email: string; password: string },
  turnstileToken?: string | null,
) {
  return postAuth<ProcurementAuthResponse>(
    "auth/sign-up/email",
    { ...input, callbackURL: verifiedCallbackURL },
    turnstileHeaders(turnstileToken),
  );
}

export function signInWithEmail(
  input: { email: string; password: string },
  turnstileToken?: string | null,
) {
  return postAuth<ProcurementSignInResponse>(
    "auth/sign-in/email",
    input,
    turnstileHeaders(turnstileToken),
  );
}

/** `returnPath` is a storefront path; Better Auth resolves it against this origin. */
export function signInWithGoogle(returnPath: string) {
  const errorCallbackURL = new URLSearchParams({
    social_error: "google",
    redirect: returnPath,
  });
  return post<{ url?: string; redirect?: boolean }>("auth/sign-in/social", {
    provider: "google",
    disableRedirect: true,
    callbackURL: returnPath,
    newUserCallbackURL: returnPath,
    errorCallbackURL: `/login?${errorCallbackURL}`,
  });
}

export function sendVerificationEmail(input: { email: string }) {
  return post<{ status?: boolean }>("auth/send-verification-email", {
    ...input,
    callbackURL: verifiedCallbackURL,
  });
}

export function requestPasswordReset(
  input: { email: string; redirectTo: string },
  turnstileToken?: string | null,
) {
  return post<{ status?: boolean; message?: string }>(
    "auth/request-password-reset",
    input,
    turnstileHeaders(turnstileToken),
  );
}

export function resetPassword(input: { token: string; newPassword: string }) {
  return post<{ status?: boolean }>("auth/reset-password", input);
}

export function signOutOfProcurement() {
  return post<{ success?: boolean }>("auth/sign-out", {});
}

export function verifyTwoFactorTotp(code: string) {
  return postAuth<ProcurementTwoFactorResponse>("auth/two-factor/verify-totp", {
    code,
    trustDevice: false,
  });
}

export function sendTwoFactorOtp() {
  return post<{ status?: boolean }>("auth/two-factor/send-otp", {
    trustDevice: false,
  });
}

export function verifyTwoFactorOtp(code: string) {
  return postAuth<ProcurementTwoFactorResponse>("auth/two-factor/verify-otp", {
    code,
    trustDevice: false,
  });
}

export function procurementUploadedImageSrc(id: string) {
  return `${apiBase}uploads/images/${encodeURIComponent(id)}`;
}

export async function uploadProcurementImage(
  file: Blob,
  temporary = false,
): Promise<ProcurementUploadedImage> {
  const body = new FormData();
  body.append("file", file);
  if (temporary) body.append("temporary", "true");
  const { data } = await request<{ data?: { id?: unknown } }>(
    "uploads/images",
    {
      method: "POST",
      body,
    },
  );
  if (!data || typeof data.id !== "string" || !data.id) {
    throw new ProcurementApiError("Upload failed", 502);
  }
  return { id: data.id, url: procurementUploadedImageSrc(data.id) };
}

function readAnnouncement(value: unknown): ProcurementAnnouncement | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || !item.id) return null;
  if (typeof item.title !== "string" || typeof item.content !== "string") {
    return null;
  }
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    pinned: item.pinned === true,
    publishedAt: typeof item.publishedAt === "number" ? item.publishedAt : null,
  };
}

export async function getProcurementAnnouncements(
  page: number,
  pageSize: number,
  locale?: string,
) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(Math.min(50, Math.max(1, pageSize))),
  });
  if (locale) query.set("locale", locale);
  const { data } = await request<{
    data?: { items?: unknown };
  }>(`announcements?${query}`);
  const rows = Array.isArray(data?.items) ? data.items : [];
  return rows.flatMap((row) => {
    const announcement = readAnnouncement(row);
    return announcement ? [announcement] : [];
  });
}

export async function getProcurementAnnouncement(id: string, locale?: string) {
  const query = locale ? `?${new URLSearchParams({ locale })}` : "";
  const { data } = await request<{ data?: unknown }>(
    `announcements/${encodeURIComponent(id)}${query}`,
  );
  const announcement = readAnnouncement(data);
  if (!announcement) {
    throw new ProcurementApiError("Announcement not found", 404);
  }
  return announcement;
}
