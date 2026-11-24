/** Public response DTOs only. Never reference database or admin models here. */
export type Schema = Record<string, unknown>;
export const str: Schema = { type: "string" }, bool: Schema = { type: "boolean" }, int: Schema = { type: "integer" }, date: Schema = { type: "string", format: "date-time" };
export const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
export const array = (items: Schema): Schema => ({ type: "array", items });
export const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: "null" }] });
export const object = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({ type: "object", properties, required });
export const fields = (names: string, schema: Schema = str) => Object.fromEntries(names.split(" ").map(name => [name, schema]));
export const page = (items: Schema): Schema => object({ items: array(items), page: int, pageSize: int, total: int });
const timeline = array(object({ at: date, title: str, detail: str }));
const dimensions = fields("weightGrams lengthMm widthMm heightMm volumetricWeightGrams", nullable(int));
const preferences = object(fields("emailEnabled packageReceived actionRequired vasCompleted paymentDue shipmentShipped shipmentDelivered", bool));
const packageProps = {
  ...fields("id publicId domesticTrackingNumber courier packageStatus"), ...dimensions,
  ...fields("productName sellerPlatform notes", nullable(str)), quantity: nullable(int), declaredValueFen: nullable(int), declaredCurrency: str, goodsItems: array(object({ name: str, quantity: int, imageUrl: nullable(str) })),
  conditionStatus: { type: "string", enum: ["NORMAL", "EXCEPTION"] }, displayStatus: ref("DisplayStatus"), receivedAt: nullable(date), createdAt: date,
  cargoAttributes: array(str), eligible: bool, ineligibleReason: nullable(str), photoCount: int, photos: array(ref("Photo")),
  freeStorageDays: int, freeStorageRemainingDays: nullable(int), storageWarning: bool, storageFeeFen: int, binLocation: nullable(str),
  exception: nullable(object({ ...fields("id type description message"), actions: array(object(fields("code label"))) })),
  vasRequests: array(object({ ...fields("id name code status paymentState"), estimatedFen: int, finalFen: nullable(int), note: nullable(str), createdAt: date, completedAt: nullable(date) }, ["id", "name", "code", "status", "paymentState", "estimatedFen", "finalFen"])), timeline,
};
export const responseSchemas: Record<string, Schema> = {
  Ok: object({ ok: bool }),
  Error: object({ error: object({ code: str, message: str, details: {} }, ["code", "message"]), requestId: str }),
  DisplayStatus: object({ ...fields("key label"), tone: { type: "string", enum: ["success", "warning", "danger", "info", "neutral"] } }),
  Photo: object({ ...fields("id type label"), url: nullable(str), createdAt: date }, ["id", "type", "label", "createdAt"]),
  WarehousePackagePhoto: object({ ...fields("id type label url"), createdAt: date }),
  Package: object(packageProps, Object.keys(packageProps).filter(k => !["binLocation", "timeline"].includes(k))),
  RecentPackage: object(packageProps, Object.keys(packageProps).filter(k => !["binLocation", "timeline", "photos"].includes(k))),
  PackagePage: page(ref("Package")),
  PrealertResult: object({ created: array(ref("Package")), skipped: array(object(fields("trackingNumber message"))) }),
  DeletedPackage: object(fields("id publicId")),
  ExceptionResult: { anyOf: [ref("Package"), object(fields("supportEmail context"))] },
  Claim: object({ ...fields("id domesticTrackingNumber courier"), receivedAt: date, ...fields("weightGrams lengthMm widthMm heightMm", int), photos: array(ref("Photo")) }),
  Address: object({ ...fields("id name firstName lastName phoneCode phone countryCode state city postalCode addressLine1"), countryName: { type: "string", readOnly: true, description: "国家英文显示名称，由 countryCode 解析；无法解析时返回原编码。", examples: ["United States"] }, ...fields("email company regionCode district addressLine2", nullable(str)), isDefault: bool }),
  Country: object(fields("code name")),
  RouteQuote: object({ referencePrice: object({currency:{const:"CNY"},amountCents:int,displayOnly:{const:true}}), ...fields("routeCode routeName description currency taxNote restrictions"), ...fields("estimatedMinFen estimatedMaxFen daysMin daysMax", int), supportsTracking: bool, doorToDoor: bool, cargoCapabilities: array(str) }, ["routeCode", "routeName", "currency", "estimatedMinFen", "estimatedMaxFen"]),
  QuoteResult: object({ quoteId: str, expiresAt: date, estimatedWeightGrams: int, estimated: bool, routes: array(ref("RouteQuote")), failure: nullable(object({ ...fields("message detail"), packages: array(object({ publicId: str, cargo: array(str) })) })), address: ref("Address") }, ["routes", "failure"]),
  Shipment: object({
    ...fields("id publicId status"), displayStatus: ref("DisplayStatus"), createdAt: date, trackingNumber: nullable(str), canCancel: bool,
    packingInstruction: nullable(str), packingNote: nullable(str), packageCount: int,
    packages: array(object({ ...fields("id publicId"), ...fields("domesticTrackingNumber courier", nullable(str)), ...dimensions, cargoAttributes: array(str) }, ["id", "publicId", "domesticTrackingNumber", "courier", "weightGrams", "lengthMm", "widthMm", "heightMm", "cargoAttributes"])),
    destination: nullable(object({ ...fields("name phone countryCode state city postalCode addressLine1"), countryName: { type: "string", readOnly: true, description: "国家英文显示名称，由运单地址快照的 countryCode 解析；无法解析时返回原编码。", examples: ["United States"] }, addressLine2: nullable(str) }, ["name", "phone", "countryCode", "countryName", "state", "city", "postalCode", "addressLine1"])),
    shippingMethod: nullable(object({ ...fields("routeCode routeName currency description"), ...fields("estimatedDaysMin estimatedDaysMax estimatedMinFen estimatedMaxFen", int) })),
    ...fields("finalWeightGrams finalLengthMm finalWidthMm finalHeightMm finalVolumetricWeightGrams", nullable(int)),
    charges: array(object({ ...fields("id type name currency status"), amountFen: int })), amountFen: int, photos: array(ref("Photo")), timeline,
    cartons: array(object({ ...fields("id code status"), ...dimensions, trackingNumber: nullable(str), packages: array(object({ ...fields("id publicId"), trackingNumber: nullable(str) })) }, ["id", "code", "status", "weightGrams", "lengthMm", "widthMm", "heightMm", "trackingNumber", "packages"])),
  }, ["id", "publicId", "status", "displayStatus", "createdAt", "canCancel", "packageCount", "packages", "amountFen", "photos", "cartons"]),
  ShipmentPage: page(ref("Shipment")),
  ShipmentDetail: { allOf: [ref("Shipment"), object({ packages: array(object({
    packageStatus: str, receivedAt: nullable(date), goodsItems: packageProps.goodsItems,
    photos: array(ref("WarehousePackagePhoto")),
    itemSource: { enum: ["purchase", "fulfillment", "prealert", null] },
    items: array(object({
      ...fields("itemId orderId orderNumber sku variantLabel imageUrl currency", nullable(str)),
      name: str, quantity: nullable(int), receivedQuantity: nullable(int), unitPriceCents: nullable(int),
    })),
  })) })] },
  Checkout: object({ ...fields("id status currency"), ...fields("totalFen walletBalanceFen amountNeededFen", int), createdAt: date, expiresAt: date, paidAt: nullable(date), items: array(object({ ...fields("id label"), amountFen: int })) }),
  Wallet: object({ balanceFen: int, currency: str, lowBalance: bool }),
  WalletTransaction: object({ ...fields("id type currency description"), ...fields("amountFen balanceBefore balanceAfter", int), ...fields("referenceType referenceId", nullable(str)), createdAt: date }),
  TransactionPage: page(ref("WalletTransaction")),
  Warehouse: object({ available: bool, ...fields("name phone province city district street postalCode country hours recipient memberCode fullAddress"), freeStorageDays: int, receivingRules: array(str), prohibitedItems: array(str), inboundNotes: array(str) }),
  Dashboard: object({ warehouse: ref("Warehouse"), wallet: ref("Wallet"), counts: object(fields("toClaim actionRequired ready toPay inTransit totalPackages", int)), attention: array(object(fields("tone title body href"))), recentPackages: array(ref("RecentPackage")), recentShipments: array(ref("Shipment")), recentTransactions: array(ref("WalletTransaction")), unreadNotifications: int }),
  Preferences: nullable(preferences),
  Me: object({ ...fields("id name email memberCode"), phone: nullable(str), country: nullable(str), isAdmin: bool, demoMode: bool, preferences: ref("Preferences"), emailDeliveryConfigured: bool, googleSignIn: bool, hasPassword: bool, googleLinked: bool, pendingEmail: nullable(object({ email: str, expiresAt: date })) }, ["id", "name", "email", "memberCode", "phone", "country", "isAdmin", "demoMode", "preferences", "emailDeliveryConfigured", "googleSignIn"]),
  Profile: object({ ...fields("id name email memberCode"), phone: nullable(str), country: nullable(str) }),
  PendingEmail: object({ pendingEmail: str }), EmailConfirmed: object({ email: str }),
  Nav: object({ claims: int, unpaidShipments: int }),
  Notification: object({ ...fields("id type title body href"), read: bool, createdAt: date }),
  InvoiceProfile: object({ ...fields("id label kind name taxId email address countryRegion"), isDefault: bool }),
  Redirect: object({ url: nullable(str) }),
  StripeSession: object({ status: str, purpose: nullable(str) }),
  BankAccount: object(fields("id label bankName accountHolder accountNumber swift country currency instructions")),
  PaymentOptions: object({ currency: str, stripe: bool, publishableKey: nullable(str), cardTopup: bool, bank: bool, bankAccounts: array(ref("BankAccount")), bankDetails: nullable(ref("BankAccount")), minTopupFen: int, maxTopupFen: int }),
  TransferCreated: object(fields("id publicId status")),
  BankTransfer: object({ ...fields("id publicId status currency reference transferDate proofNote"), amountFen: int, hasProof: bool, bankAccountLabel: nullable(str), userId: str, reviewedBy: nullable(str), createdAt: date, reviewedAt: nullable(date), reviewNote: nullable(str) }, ["id", "publicId", "status", "amountFen"]),
  BankTransferPage: { allOf: [page(ref("BankTransfer")), object({ counts: object(fields("pending approved rejected", int)) })] },
  Locale: object({ defaultLocale: str, currency: str, languages: array(object(fields("code nativeName englishName"))) }),
  Security: object({ google: object({ enabled: bool }), turnstile: object({ enabled: bool, siteKey: str, login: bool, register: bool, reset: bool }), customerAi: bool }, ["google", "turnstile"]),
  Branding: object({ ...fields("name legalName email supportEmail phone whatsappUrl country address description primaryColor accentColor siteMode"), githubUrl: nullable(str), logos: object(fields("primary square favicon", bool)), updatedAt: int, website: object(fields("publicUrl appUrl supportUrl privacyUrl termsUrl")), seo: object(fields("browserTitle metaDescription")) }),
  CalculatorOptions: object({ connected: bool, countries: array(ref("Country")), attributes: array(object(fields("code name"))), message: nullable(str), demo: bool }, ["connected", "countries", "attributes", "message"]),
  Estimate: object({ quotes: array(object({ ...fields("code name"), ...fields("description eta note", nullable(str)), partial: bool, priceUsdFen: int, referencePrice: object({ currency: {const:"CNY"}, amountCents: int, displayOnly: {const:true} }) })), disclaimer: str }),
  Channel: object({ ...fields("code name"), ...fields("description range volumetric", nullable(str)), delivery: array(str), regions: array(object({ code: str, name: str, eta: nullable(str) })), restrictions: array(str), services: array(object({ ...fields("name mode"), ...fields("description price", nullable(str)) })), rates: nullable(array(object({ region: str, rows: array(object({ ...fields("label range amount type"), amountCents:int, currency:{const:"CNY"}, minimum:nullable({type:"number"}), maximum:nullable({type:"number"}), unit:nullable(str) })) }))), ratePricing:object({ priceType:{const:"selling"},currency:{const:"CNY"},fixedChargePerShipmentCents:int,referenceOnly:{const:true},note:str }) }),
  DocumentState: object({ documents: array(ref("Document")), capabilities: object(fields("proforma shippingInvoice receipt", bool)), sellerReady: bool, profiles: array(ref("InvoiceProfile")) }),
  Document: object({ ...fields("id number kind title status paymentStatus relationStatus currency filename billToName"), totalFen: int, issuedAt: date, voidReason: nullable(str), relatedNumber: nullable(str) }),
  CarrierTracking: object({ available: bool, trackingNumber: nullable(str), carrier: nullable(str), events: array(object({ at: str, title: str, location: str })) }),
};
