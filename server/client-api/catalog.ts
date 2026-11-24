import { cancelPurchaseInput, purchaseStages } from "../purchase-customer-query";
import { shopSubscriptionInput, browsingHistoryInput } from "../../src/domain/shopping-activity";
import { manualCartVersion, manualCartUpdate } from "../../src/domain/manual-purchase";
import { manualPurchaseInput } from "../../src/domain/manual-purchase";
import { cartInput, cartUpdateInput, cartPreviewInput, cartCheckoutInput, favoriteInput, sellerSearchInput, imageSearchInput } from "../../src/domain/shopping";
import { z } from "zod";
import { purchaseStripeInput } from "../purchase-stripe";
import { addressSchema, invoiceProfileSchema, clientRequestSchemas, calculatorBody } from "./requests";
import { array, fields, int, object, ref, str, type Schema } from "./responses";
import { purchasePaymentInput, productDetailInput, productParseInput, productSearchInput, purchaseCreateInput, purchasePreviewInput } from "../../src/domain/purchase";

export type Endpoint = { method: string; path: string; id: string; tag: string; summary: string; response: Schema; unavailable?: boolean; public?: boolean; body?: z.ZodType | Schema; bodyOptional?: boolean; media?: string; binary?: string; query?: Record<string, Schema>; description?: string; idempotency?: boolean };
const paged = { page: { ...int, minimum: 1, default: 1 }, pageSize: { ...int, minimum: 1, maximum: 50, default: 20 }, status: str, q: str };
const pageOnly = { page: paged.page };
const announcement = object({ id: str, title: str, content: str, locale: str, pinned: { type: "boolean" }, publishedAt: int, updatedAt: int });
const shared = clientRequestSchemas as Record<string, z.ZodType>;
const endpoints: Endpoint[] = [];
function add(method: string, path: string, id: string, tag: string, summary: string, response: Schema | string, options: Partial<Endpoint> = {}) {
  endpoints.push({ method, path, id, tag, summary, response: typeof response === "string" ? ref(response) : response, ...(shared[`${method} ${path}`] ? { body: shared[`${method} ${path}`] } : {}), ...options });
}
add("GET", "/api/health", "health", "公共配置", "服务健康检查", "Ok", { public: true });
const warehouseServiceStage = { enum: ["INBOUND", "OUTBOUND"], type: "string" };
const optionalQuantity = { type: ["integer", "null"] };
const warehouseServiceCatalog = object({
  stage: warehouseServiceStage,
  items: array(object({
    code: str, stage: warehouseServiceStage, name: str, description: str, pricingType: str, unit: str,
    price: { type: "number", minimum: 0, description: "人民币元，目录参考价，例如 5 表示 ¥5.00" },
    currency: { const: "CNY" }, minQuantity: optionalQuantity, maxQuantity: optionalQuantity,
    requiresConfirmation: { type: "boolean" },
  })),
  requestListAvailable: { type: "boolean", description: "上游申请列表可读取，不代表支持创建申请" },
  applicationAvailable: { type: "boolean", description: "当前仓库可否受理新申请。为 false 时可取消服务勾选并直接合包。" },
  message: { type: ["string", "null"] },
});
const warehouseServiceOptions = {
  query: { language: { type: "string", enum: ["en", "zh", "zh-CN", "zh-TW"], default: "en" } },
  description: "登录后读取当前仓库已启用的服务。服务以 stage 和 code 共同识别。目录正常但申请列表不可用时仍返回 200，保留 items，requestListAvailable=false，message 为“仓库服务暂不可用”。目录本身不可用时返回 503。本接口只读。",
};
add("GET", "/api/packages/services/catalog", "getPackageServiceCatalog", "包裹", "包裹入库增值服务目录", warehouseServiceCatalog, warehouseServiceOptions);
add("GET", "/api/shipments/services/catalog", "getShipmentServiceCatalog", "运单", "运单出库增值服务目录", warehouseServiceCatalog, warehouseServiceOptions);
add("POST", "/api/packages/:id/service-requests", "applyPackageServices", "包裹", "申请包裹入库增值服务", {}, {
  unavailable: true, description: "仅本人已同步、已收货且可操作的包裹。services 为 INBOUND 目录的 code、quantity 数组。归属不符返回 404，状态不允许返回 409，选项无效返回 400。目前仓库未开放创建操作，返回 503 仓库服务暂不可用。",
});
add("POST", "/api/shipments/:id/service-requests", "applyShipmentServices", "运单", "申请运单出库增值服务", {}, {
  unavailable: true, description: "仅本人已同步且仍待打包的运单。services 为 OUTBOUND 目录的 code、quantity 数组。归属不符返回 404，状态不允许返回 409，选项无效返回 400。目前仓库未开放创建操作，返回 503 仓库服务暂不可用。",
});
add("GET", "/api/announcements", "listAnnouncements", "公告", "已发布公告列表", object({ items: array(announcement), total: int, page: int, pageSize: int }), { public: true, query: { page: { ...paged.page, maximum: 10000 }, pageSize: paged.pageSize, q: { ...str, maxLength: 100 }, locale: { ...str, maxLength: 35 } }, description: "无需登录，仅返回已发布公告，置顶优先。正文为纯文本。语言依次回退到站点默认语言、英语、已有翻译。时间为 Unix 毫秒。" });
add("GET", "/api/announcements/:id", "getAnnouncement", "公告", "已发布公告详情", announcement, { public: true, query: { locale: str }, description: "草稿、已下架或不存在的公告返回 404。" });
add("GET", "/api/exchange-rates", "getExchangeRates", "公共配置", "展示币种与统一汇率", object({ baseCurrency: {const:"CNY"}, scale: {const:10000}, unitsPerCnyScale:{const:100000000}, settlementCurrency:str, displayOnly:{const:true}, items:array(object({currency:str,cnyPerUnitE4:{...int,deprecated:true},unitsPerCnyE8:int,version:int,updatedAt:int})) }), {public:true,description:"仅返回启用币种。1 CNY = unitsPerCnyE8 / unitsPerCnyScale 单位目标币种；目标金额最小单位 = CNY 分 × unitsPerCnyE8 / 100000000，四舍五入（沿用本系统两位小数金额约定）。旧 cnyPerUnitE4 与 scale 保留原方向用于兼容，不能混用；倒数展示舍入可能与结算存在微小差异。仅供展示，不改变账单与支付币种。"});
add("GET", "/api/locale", "getLocale", "公共配置", "语言与客户结算币种", "Locale", { public: true });
add("GET", "/api/branding", "getBranding", "公共配置", "站点品牌与主题", "Branding", { public: true });
add("GET", "/api/branding/assets/:kind", "getBrandAsset", "公共配置", "品牌图片", {}, { public: true, binary: "image/*" });
add("GET", "/api/security/public", "getPublicSecurity", "公共配置", "登录方式、验证码与助手开关", "Security", { public: true });
add("GET", "/api/me", "getMe", "账号", "当前用户与安全设置", "Me");
add("PATCH", "/api/me", "updateMe", "账号", "修改个人资料", "Profile");
add("PATCH", "/api/me/preferences", "updatePreferences", "账号", "修改通知偏好", "Preferences");
add("POST", "/api/me/email/challenge", "sendEmailChallenge", "账号", "发送原邮箱验证码", "Ok");
add("POST", "/api/me/email", "requestEmailChange", "账号", "申请更换邮箱", "PendingEmail", { description: "密码账号使用 password，社交账号使用原邮箱 code。确认新邮箱后现有会话将失效，需重新登录。" });
add("POST", "/api/me/email/resend", "resendEmailChange", "账号", "重发换邮验证", "PendingEmail");
add("POST", "/api/me/email/cancel", "cancelEmailChange", "账号", "取消换邮申请", "Ok");
add("POST", "/api/me/google/unlink", "unlinkGoogle", "账号", "解绑 Google", "Ok");
add("POST", "/api/account/email/confirm", "confirmEmailChange", "账号", "确认新邮箱", "EmailConfirmed", { public: true });
add("GET", "/api/nav", "getNavigationCounts", "工作台", "导航待办数量", "Nav");
add("GET", "/api/dashboard", "getDashboard", "工作台", "客户工作台汇总", "Dashboard");
add("GET", "/api/warehouse", "getWarehouse", "工作台", "客户专属收货地址", "Warehouse", { description: "available=false 时不展示或推导仓库地址。" });
add("GET", "/api/notifications", "listNotifications", "通知", "最近 20 条通知", array(ref("Notification")));
add("POST", "/api/notifications/read", "readNotifications", "通知", "全部标记已读", "Ok");
add("GET", "/api/packages", "listPackages", "包裹", "搜索与筛选包裹", "PackagePage", { query: paged });
add("GET", "/api/packages/:id", "getPackage", "包裹", "包裹详情、照片及时间线", "Package");
add("DELETE", "/api/packages/:id", "deletePendingPackage", "包裹", "删除未收货预报", "DeletedPackage", { description: "仅符合现有删除规则的待收货包裹可删除；可能涉及远端预报取消。" });
add("POST", "/api/packages/prealert", "createPrealerts", "包裹", "批量预报包裹", "PrealertResult", { description: "最多 30 个。按快递单号去重，重复项返回 skipped。预报成功不等于已到货。" });
add("POST", "/api/packages/:id/exceptions", "resolvePackageException", "包裹", "提交异常处理决定", "ExceptionResult", { description: "仅提交后端返回允许的处理 action；SUPPORT 返回联系信息，其他动作返回包裹详情。" });
add("GET", "/api/claims", "listClaims", "认领", "待认领包裹", array(ref("Claim")));
add("POST", "/api/claims/:id/confirm", "confirmClaim", "认领", "确认认领", "Package");
add("POST", "/api/claims/:id/reject", "rejectClaim", "认领", "拒绝认领", "Ok");
add("GET", "/api/destinations", "listDestinations", "地址", "开放目的地", array(ref("Country")));
add("GET", "/api/addresses", "listAddresses", "地址", "收货地址列表", array(ref("Address")));
add("POST", "/api/addresses", "saveAddress", "地址", "保存收货地址", "Address", { body: addressSchema });
add("PATCH", "/api/addresses/:id", "updateAddress", "地址", "修改收货地址", "Address", { body: addressSchema });
add("DELETE", "/api/addresses/:id", "deleteAddress", "地址", "删除收货地址", "Ok");
add("POST", "/api/addresses/:id/default", "defaultAddress", "地址", "设为默认地址", "Ok");
add("GET", "/api/shipping/calculator/options", "calculatorOptions", "运费估算", "运费计算器选项", "CalculatorOptions", { public: true });
add("POST", "/api/shipping/calculator", "estimateShipping", "运费估算", "公开运费估算", "Estimate", { public: true, body: calculatorBody, description: "尺寸必须同时提供三项或全部省略。价格为估算，不是付款依据；限流为 Worker isolate 范围。" });
add("GET", "/api/shipping/calculator/channel", "getChannel", "运费估算", "渠道详情", "Channel", { public: true, query: { code: { ...str, minLength: 1 }, country: { ...str, minLength: 2, maxLength: 2 } } });
add("POST", "/api/shipping/quotes", "createShippingQuote", "运单", "为包裹与目的地生成报价", "QuoteResult", { description: "仅本用户符合资格的包裹与地址可报价。使用响应 quoteId、routeCode 创建运单；不接受客户端售价。" });
add("GET", "/api/shipments", "listShipments", "运单", "搜索与筛选运单", "ShipmentPage", { query: { ...paged, status: { ...str, description: "all / consolidating / to_pay / ready_to_ship / in_transit / completed；ready_to_ship 包含客户已付款、等待 HioBuy 付款的 payment_received 运单，以及 HioBuy 待发货运单。" } }, description: "待发货筛选及 total 包含 displayStatus.key 为 ready_to_ship 或 payment_received 的运单；payment_received 仍保留原显示状态，表示客户已付款，等待运营方向 HioBuy 支付。不改变客户账单或付款流程。" });
add("POST", "/api/shipments", "createShipment", "运单", "集包并新建运单", "Shipment", { idempotency: true, description: "可选 services 数组选择运单 OUTBOUND 增值服务，例如 [{\"code\":\"2\",\"quantity\":1}]。仓库服务暂不可用时带选项请求返回 503，保留包裹；客户可以取消勾选后再合包。不传 services 或传空数组按普通合包处理。" });
add("GET", "/api/shipments/:id", "getShipment", "运单", "运单详情", "ShipmentDetail", { description: "packages 按运单内的包裹返回。items 为该包裹的商品明细，itemSource 标明代购分配、仓库同步或预报来源；goodsItems 独立保留仓库同步的商品。代购商品的 quantity 是本包裹分配数量，receivedQuantity 是本包裹已收数量，unitPriceCents 使用客户账单币种的最小单位。" });
add("GET", "/api/shipments/:id/tracking", "getCarrierTracking", "运单", "承运商物流轨迹", "CarrierTracking");
add("POST", "/api/shipments/:id/cancel", "cancelShipment", "运单", "申请取消运单", "Shipment", { description: "仅符合当前状态规则的运单可取消；远端请求和本地状态可能需要后续同步。" });
add("POST", "/api/checkout", "createCheckout", "支付", "创建运费结算单", "Checkout");
add("GET", "/api/checkout/:id", "getCheckout", "支付", "查询结算单与钱包差额", "Checkout");
add("POST", "/api/checkout/:id/pay", "payCheckout", "支付", "使用客户钱包支付", "Checkout", { idempotency: true, description: "必须由客户明确确认。所有金额由服务端核验，不能用状态查询代替付款，不能因超时更换幂等键盲目重试。" });
add("POST", "/api/checkout/:id/stripe", "createStripeCheckout", "支付", "获取 Stripe 运费支付地址", "Redirect", { bodyOptional: true, description: "APP 用浏览器打开 url。请求可传 successUrl/cancelUrl 指定前端完成/取消跳转 URL，不传沿用内置页面；传入后携带 purpose=shipment、checkoutId、result，完成跳转携带 session_id。成功跳转不代表到账，应查询结算单或支付状态；通知地址保持不变。" });
add("GET", "/api/payments/options", "getPaymentOptions", "支付", "可用支付方式", "PaymentOptions");
add("GET", "/api/payments/stripe/session", "getStripeSession", "支付", "查询 Stripe 入账结果", "StripeSession", { query: { session_id: str } });
add("GET", "/api/wallet", "getWallet", "钱包", "客户钱包余额", "Wallet");
add("GET", "/api/wallet/transactions", "listWalletTransactions", "钱包", "钱包流水（每页 20 条）", "TransactionPage", { query: { ...pageOnly, type: str } });
add("POST", "/api/wallet/top-up/stripe", "createStripeTopup", "钱包", "获取 Stripe 充值地址", "Redirect", { description: "打开返回的 url。请求可传 successUrl/cancelUrl 指定前端完成/取消跳转 URL，传入后携带 purpose=topup、result，完成跳转携带 session_id。到账请通过 GET /api/payments/stripe/session 查询，跳转本身不会入账；不传沿用内置页面。" });
add("POST", "/api/wallet/bank-transfers", "createBankTransfer", "钱包", "提交银行转账与凭证", "TransferCreated", { media: "multipart/form-data", body: object({ amountFen: { ...int, minimum: 1 }, ...fields("reference transferDate proofNote bankAccountId"), proof: { type: "string", format: "binary" } }, ["amountFen", "bankAccountId"]), description: "由运营人员审核后入账；上传凭证不会立即增加余额。proof 支持 PNG/JPEG/PDF，限制以服务端为准。" });
add("GET", "/api/wallet/bank-transfers", "listBankTransfers", "钱包", "银行转账申请（每页 10 条）", "BankTransferPage", { query: { ...pageOnly, status: str } });
add("GET", "/api/wallet/bank-transfers/:id/proof", "getTransferProof", "文件", "下载本人的转账凭证", {}, { binary: "application/octet-stream" });
add("GET", "/api/photos/:id", "getPhoto", "文件", "读取有权限的包裹或运单照片", {}, { binary: "image/*" });
add("GET", "/api/shipments/:id/documents", "listShipmentDocuments", "单据", "单据列表与开具资格", "DocumentState");
add("POST", "/api/shipments/:id/documents", "issueShipmentDocument", "单据", "开具运单单据", "Document");
add("GET", "/api/documents/:id/pdf", "downloadDocument", "文件", "下载单据 PDF", {}, { binary: "application/pdf", query: { inline: { type: "string", enum: ["0", "1"] } } });
add("GET", "/api/wallet/transactions/:id/receipt", "downloadWalletReceipt", "文件", "下载流水收据 PDF", {}, { binary: "application/pdf", query: { profileId: str } });
add("GET", "/api/invoice-profiles", "listInvoiceProfiles", "单据", "发票抬头列表", array(ref("InvoiceProfile")));
add("POST", "/api/invoice-profiles", "createInvoiceProfile", "单据", "创建发票抬头", "InvoiceProfile", { body: invoiceProfileSchema });
add("PATCH", "/api/invoice-profiles/:id", "updateInvoiceProfile", "单据", "修改发票抬头", "InvoiceProfile", { body: invoiceProfileSchema });
add("DELETE", "/api/invoice-profiles/:id", "deleteInvoiceProfile", "单据", "删除发票抬头", "Ok");
add("POST", "/api/invoice-profiles/:id/default", "defaultInvoiceProfile", "单据", "设置默认发票抬头", array(ref("InvoiceProfile")));
add("GET", "/api/client/capabilities", "getClientCapabilities", "公共配置", "APP 接入能力与协议入口", object({ apiVersion: str, openapi: str, docs: str, auth: object({ signIn: str, session: str, signOut: str, requestPasswordReset: str, resetPassword: str, tokenHeader: str }), assistant: object({ pathTemplate: str, protocol: str }), currencySource: str, features: array(str) }), { public: true });
export const clientEndpoints = endpoints;

const translatedText = { type: "object", additionalProperties: { type: "string" } };
const product = object({ id:str,channel:str,title:translatedText,sourceUrl:{type:["string","null"]},images:array(str),variants:array(object({skuId:str,stock:{type:["number","null"]},image:{type:["string","null"]},attributes:array(translatedText)})),pricing:{type:"string",enum:["preview_required"]} });
const displayProductPrice = object({currency:{const:"CNY"},displayOnly:{const:true},unitPriceCents:{type:["integer","null"]},promotionPriceCents:{type:["integer","null"]}});
const searchProduct = object({ ...(product.properties as Record<string,Schema>), price: displayProductPrice });
const productDescription = object({original:{type:["string","null"]},translated:{type:["string","null"]},language:{type:["string","null"]}});
const productAttribute = object({attribute_id:{type:["string","null"]},name:{type:["string","null"]},value:{type:["string","null"]},original_name:{type:["string","null"]},original_value:{type:["string","null"]}});
const detailProduct = object({attributes:array(productAttribute),description:productDescription,shop:object({id:{type:["string","null"]},name:{type:["string","null"]},url:{type:["string","null"]}}),videos:object({main:{type:["string","null"]},detail:{type:["string","null"]}}),...(product.properties as Record<string,Schema>),price:displayProductPrice,minOrderQuantity:{type:["integer","null"]},orderQuantityMultiple:{type:["integer","null"],minimum:1,description:"上游 order_quantity_multiple 批次数量（下单数量倍数），缺失或非有效正整数时为 null。"},priceTiers:array(object({minQuantity:int,unitPriceCents:{type:["integer","null"]},promotionPriceCents:{type:["integer","null"]}})),variants:array(object({skuId:str,stock:{type:["number","null"]},image:{type:["string","null"]},attributes:array(translatedText),price:displayProductPrice}))});

const purchasePaymentRecord = object({id:str,method:{type:"string",enum:["wallet","stripe"]},amountCents:int,currency:str,status:str,paidAt:{type:["integer","null"]}});
const bill = object({paymentMethod:{type:["string","null"],enum:["wallet","stripe","mixed",null]},paymentMethods:array(str),paymentHistory:array(purchasePaymentRecord),paidCents:int,dueCents:int,overpaidCents:int,estimated:{type:"boolean"},version:int,id:str,status:str,currency:str,goodsCents:int,serviceCents:int,shippingCents:int,discountCents:int,totalCents:int,paidAt:{type:["integer","null"]}});
const orderAttachment=object({id:str,filename:str,contentType:str,size:int,createdAt:int,url:str});
const orderCoupon=object({code:str,currency:str,discountCents:int,state:{type:"string",enum:["reserved","redeemed","released"]}});
const domesticTrackingFields = {statusLabel:{type:["string","null"]},events:array({type:"object",additionalProperties:true,description:"HioBuy 标准 packages[].steps 原始节点对象；官方未定义内部字段，不假定与国际轨迹 at/title/location 相同。"}),trackingStatus:{type:"string",enum:["not_loaded","available","empty","unavailable","not_ready"]}};
const domesticTracking = object({channel:{type:["string","null"]},trackingStatus:{type:"string",enum:["available","empty","unavailable","not_ready"]},packages:array(object({...domesticTrackingFields,trackingNumber:{type:["string","null"]},carrier:{type:["string","null"]}}))});
add("GET","/api/purchase-orders/:id/logistics","getPurchaseDomesticTracking","代购订单","查询国内包裹快递轨迹",domesticTracking,{query:{trackingNumber:{...str,maxLength:200}},description:"仅查询本人订单。服务端从已保存的采购订单读取 channel/order_id；可选 trackingNumber 必须属于该订单，不能用于任意快递查询。支持 1688、淘宝、微店和手工单；微店按已关联单号逐票查询。events 保留 HioBuy steps 节点字段，仓库节点不混入。available 有轨迹；empty 查询成功但无轨迹；not_ready 尚无远端订单或微店单号；unavailable 表示配置、权限或上游暂不可用，可稍后重试。部分包裹失败时保留已查询成功的 packages。"});
const purchaseLogistics = object({domesticParcels:array(object({...domesticTrackingFields,packageId:{type:["string","null"]},publicId:{type:["string","null"]},trackingNumber:str,carrier:{type:["string","null"]},status:{type:["string","null"]},items:array(object({itemId:str,quantity:int,receivedQuantity:int})),warehouseEvents:array(object({at:str,title:str,detail:str}))})),internationalShipments:array(object({shipmentId:str,publicId:str,packageIds:array(str),status:str,trackingNumber:{type:["string","null"]},carrier:{type:["string","null"]},trackingStatus:{type:"string",enum:["not_loaded","available","unavailable"]},events:array(object({at:str,title:str,location:str}))}))});
const purchase = object({logistics:purchaseLogistics,remark:str,attachments:array(orderAttachment),coupon:{anyOf:[orderCoupon,{type:"null"}]},id:str,number:str,platform:str,orderType:{type:"string",enum:["standard","manual"]},status:str,stage:{type:"string",enum:[...purchaseStages]},canCancel:{type:"boolean"},createdAt:int,items:array(object({currency:{type:["string","null"]},unitPriceCents:{type:["integer","null"]},subtotalCents:{type:["integer","null"]},referencePrice:object({currency:{const:"CNY"},unitPriceCents:{type:["integer","null"]},subtotalCents:{type:["integer","null"]}}),remark:str,attachments:array(orderAttachment),id:str,name:str,sku:str,quantity:int,productId:{type:["string","null"]},imageUrl:{type:["string","null"]},sourceUrl:{type:["string","null"]},variantLabel:{type:["string","null"]}})),bills:array(bill),fulfillment:{anyOf:[object({state:{type:"string",description:"采购同步状态：ready/creating/created/paying/cancel_pending/cancelled/unknown/review_required。review_required 表示远端金额缺失或与已确认报价不一致，等待运营核对。客户付款状态见 bills.status。"},status:{type:["string","null"]},updatedAt:int}),{type:"null"}]}});
const purchaseStripe = object({ paymentId:str,orderId:str,sessionId:{type:["string","null"]},url:{type:["string","null"]},status:{type:"string",enum:["pending","paid","expired","review"]},amountCents:int,currency:str });
add("GET","/api/purchase-orders/:id/stripe","latestPurchaseStripe","代购订单","查询订单最近一次 Stripe 支付",{anyOf:[purchaseStripe,{type:"null"}]},{description:"用于 APP 重启后恢复支付。尚未创建支付时返回 null。仅允许查询本人的订单。"});
add("POST","/api/purchase-orders/:id/stripe","createPurchaseStripe","代购订单","创建或恢复代购账单 Stripe 支付",purchaseStripe,{body:purchaseStripeInput,description:"支持标准单、手工单首次付款和补款。id 为客户端生成的 UUID 幂等键，重试应复用；billVersion 与 amountCents 必须等于当前账单版本和 dueCents。若新 id 与已有待付款记录的账单、客户、订单、版本、币种和未付金额匹配，恢复原支付；客户端须保存响应中的 paymentId，查询和取消均使用该 ID。结果未知时仍沿用原 Stripe 幂等键恢复，不重复创建支付。待人工核对返回 409 PAYMENT_REVIEW，error.details 含 paymentId/status；结果未知返回 503 PAYMENT_PENDING，details.paymentId 为原支付 ID。服务端冻结金额、币种并锁定账单；支付期间不能钱包付款、取消订单或作废账单。用系统浏览器打开 url。请求可传 successUrl/cancelUrl 指定前端完成/取消跳转 URL（不传沿用内置页面），传入后携带 purpose=purchase、orderId、billId、paymentId、result，完成跳转携带 session_id。跳转地址以首次创建为准，恢复支付即使传入不同 URL 也沿用首次地址；成功跳转不代表到账，轮询支付状态及订单详情。仅收取客户款项，不扣客户钱包、不支付 HioBuy。金额为账单结算币种最小单位。"});
add("GET","/api/purchase-orders/:id/stripe/:paymentId","getPurchaseStripe","代购订单","查询本人代购银行卡支付",purchaseStripe,{description:"pending 等待支付或确认；paid 已计入账单；expired 已失效，可重新付款；review 已收款但需人工核对，请勿再次付款。"});
add("POST","/api/purchase-orders/:id/stripe/:paymentId/cancel","cancelPurchaseStripe","代购订单","关闭代购 Stripe 收银台",purchaseStripe,{body:z.object({confirm:z.literal(true)}).strict(),description:"服务端向 Stripe 确认会话失效后才解除账单锁。若已支付，先对账返回 paid；处理中返回 409。创建超时且 sessionId 为空时，先用原 id 重试创建恢复会话。浏览器取消跳转本身不会解锁。"});
const purchaseQuote = object({discountCents:int,couponCode:{type:["string","null"]},referencePrice:object({discountCents:int,currency:{const:"CNY"},displayOnly:{const:true},goodsCents:int,serviceCents:int,shippingCents:int,totalCents:int}),id:str,expiresAt:int,currency:str,goodsCents:int,serviceCents:int,shippingCents:int,totalCents:int,lines:array(object({name:str,sku:str,quantity:int,goodsCents:int,serviceCents:int}))});
add("POST","/api/products/search","searchPurchaseProducts","代购商品","搜索代购商品",object({items:array(searchProduct),page:int,pageSize:int,total:{type:["number","null"]}}),{public:true,body:productSearchInput,description:"支持 HioBuy sort/sort_field/sort_order、价格区间（人民币元）、发货时效，以及 1688 标签、体验评分、类目、商品池和销量区间筛选；平台支持范围见请求字段说明。保持 standard 响应，不开放上游原始数据。无需登录查询真实商品。按 Cloudflare 客户端 IP 限制每分钟 20 次（Worker isolate 范围，并非全局限流）；浏览器跨域仍需配置客户端白名单。items[].price 返回商品参考售价，unitPriceCents 和 promotionPriceCents 单位为人民币分，缺失或未配置定价时为 null。采购成本不公开，最终金额以订单预览为准。查询受 HioBuy 配额约束。相同完整条件复用服务端搜索缓存，默认 5 分钟，后台可配置或关闭；缓存命中仍受本站限流，商品价格以订单预览为准。"});
add("POST","/api/products/detail","getPurchaseProduct","代购商品","查询商品、SKU 与阶梯展示价格",object({product:detailProduct}),{body:productDetailInput,description:"attributes 返回商品级展示属性（attribute_id、name、value、original_name、original_value），无属性时为 []，缺失字段为 null；与 variants[].attributes 的 SKU 选项不同，不用于下单选 SKU。description.original/translated 原样返回上游描述（可能包含 HTML），不做 HTML 过滤、文本提取或截断；language 表示上游描述语言。shop 返回上游 seller 的 id/name/url；videos.main/detail 为视频 URL，无数据为 null。不自动翻译、补造店铺链接或代理媒体。price、variants[].price 和 priceTiers 返回应用当前商品加价后的展示金额，均为 CNY 分，不含服务费/运费/优惠券。priceTiers 按 minQuantity 升序，为上游商品级阶梯条件，不保证可用于所有 SKU 或可跨 SKU 累计。无阶梯价返回 []；缺价、非 CNY 或未配置有效定价时金额为 null。promotionPriceCents 为上游提供的促销参考价，不保证下单可用。minOrderQuantity 为上游最小起订件数，未知为 null。orderQuantityMultiple 为上游 order_quantity_multiple 批次数量（下单数量倍数），缺失或无效时为 null，不默认填 1。pricing 仍为 preview_required，实际成交价以订单预览为准。"});
add("POST","/api/products/parse","parsePurchaseProduct","代购商品","解析商品链接",object({product:detailProduct}),{body:productParseInput,description:"返回与商品详情相同的 attributes 商品级属性、description（上游原始 HTML）、shop、videos 以及 CNY 展示单价、SKU 价格及阶梯价；所有金额单位为分且应用本站商品加价。缺价返回 null，实际结算以预览为准。"});
add("POST","/api/purchase-orders/preview","previewPurchaseOrder","代购订单","预览代购订单与客户售价",purchaseQuote,{body:purchasePreviewInput,description:"每次仅支持同平台同卖家；SKU 使用商品详情返回的 skuId，作为 spec_id 传入。仓库收货地址由服务端读取，价格来自 HioBuy 校验后的预览及本站定价。可选 couponCode 使用本站已启用优惠券，按客户结算币种的商品+服务费+国内运费总额检查门槛及折扣；百分比表示减免比例，不是折后支付比例。返回 discountCents 和优惠后 totalCents，referencePrice 同步提供 CNY 参考优惠金额。预览不占名额，创建时重新校验。报价有效 8 分钟，不创建远端订单或扣款。"});
add("POST","/api/purchase-orders/manual","createManualPurchaseOrder","代购订单","提交手工代购申请",object({id:str}),{body:manualPurchaseInput,description:"支持 jd、pinduoduo、poizon，同平台同卖家，每单最多 20 行，每行最多 999 件。金额为 CNY 分，商品与图片链接为 HTTPS。客户申报价和国内运费按系统加价、服务费及汇率生成预收账单（estimated=true），下单后为待支付。运营在客户预付后提交 HioBuy，使用原账单定价与汇率按确认金额结算；差额通过 dueCents 补付，多付为 overpaidCents 待人工处理，不自动退款。本接口不创建远端单、不扣款。运营审核提交人工采购后，根据仓库确认金额和本站定价生成账单。重试复用 id 和完全相同的内容；内容变化返回 409。"});
add("POST","/api/purchase-orders","createPurchaseOrder","代购订单","创建本地代购申请与账单",purchase,{body:purchaseCreateInput,description:"提交预览 quoteId 和本次操作 UUID id；可选 items：每项通过 productId + skuId 匹配报价中的商品，包含 remark（最多 1000 字）、attachmentUploadIds（每 SKU 最多 5 张本人上传的 PNG/JPEG，每张最多 3 MiB）；每单合计最多 20 张。重复 SKU 或不属于报价的 SKU 返回 400。未填写的 SKU 备注为空、附图为 []。返回 items[].remark/attachments。根级 remark/attachmentUploadIds 仅保留旧调用兼容，历史订单级数据不自动分配给 SKU。couponCode 仍为订单级。支持有效临时上传，校验归属后复制成私有订单附图，原图删除/到期不影响订单。优惠代码可沿用预览或在创建时指定；若预览已使用代码，不能改成其他代码。创建时原子占用优惠名额，付款核销，未付取消或作废账单释放；每单一券。重试必须复用相同 id、quoteId、items（含顺序）、备注、附图及优惠代码，内容变化返回 409。一个报价只能创建一单，不立即在 HioBuy 下单。备注和附图供本站运营查看，不自动传给 HioBuy。"});
const purchaseCounts = object(Object.fromEntries(["all", ...purchaseStages, "awaiting_receipt"].map(key => [key, int])));
const purchaseListQuery = {page:{...paged.page,maximum:100000},pageSize:{...int,minimum:1,maximum:100,default:20},q:{...str,maxLength:120,description:"按订单号、内部 ID、商品名称或规格做字面子串搜索。"},status:{type:"string",enum:["",...purchaseStages,"awaiting_receipt"],description:"筛选业务进度 stage；不等同于响应中的本地 status。awaiting_receipt 合并 transit/partial。"}};
add("GET","/api/purchase-orders","listPurchaseOrders","代购订单","按关键词和进度查询本人代购订单",object({items:array(purchase),total:int,page:int,pageSize:int,counts:purchaseCounts}),{query:purchaseListQuery,description:"按创建时间和 ID 倒序分页。counts 为当前客户匹配 q 的全部订单计数，忽略 status 和分页，包含零计数。status 保留原本地 draft/cancelled，stage 为后台一致的业务进度；canCancel 为当前可取消提示，实际写入再次校验。"});
add("GET","/api/purchase-orders/counts","countPurchaseOrders","代购订单","查询本人代购订单各进度计数",purchaseCounts,{query:{q:purchaseListQuery.q},description:"仅统计当前客户，按关键词筛选。all 为总数；awaiting_receipt=transit+partial，不要重复累加。"});
add("POST","/api/purchase-orders/:id/cancel","cancelCustomerPurchase","代购订单","客户取消未付款代购订单",purchase,{body:cancelPurchaseInput,description:"仅允许未付款、未推送采购、没有有效包裹关联或进行中售后的本地订单。原子取消订单、作废未付账单并记录原因；重复取消返回同一订单，不重复记日志。不调用 HioBuy，不扣款或退款。已付款或已进入采购返回 409，需联系运营处理；其他客户订单返回 404。"});
add("GET","/api/purchase-orders/:id/attachments/:attachmentId","readOrderAttachment","代购订单","读取本人订单附图",{}, {binary:"image/*",description:"仅订单所属客户可访问，需携带登录会话或 Bearer token，不是公网图片链接。原上传被删除或到期后，订单副本仍保留。"});
const purchaseDetail = { allOf: [purchase, object({ logistics: object({ domesticParcels: array(object({ photos: array(ref("WarehousePackagePhoto")) })) }) })] };
add("GET","/api/purchase-orders/:id","getPurchaseOrder","代购订单","查询本人的代购详情与账单",purchaseDetail,{description:"items 返回账单快照中的售价 currency/unitPriceCents/subtotalCents，referencePrice 为 CNY 售价参考；单价按行小计除以数量取整，行小计为准，不含服务费及运费。历史快照缺失时价格为 null，不返回采购成本。bills 返回 paymentMethod（wallet/stripe/mixed/null）、paymentMethods 与已收款 paymentHistory。logistics 区分国内包裹 domesticParcels（单号、商品关联、warehouseEvents 仓库节点）和 internationalShipments（单号、carrier、events 承运商轨迹）。国内快递 events 来自 HioBuy /v1/orders/logistics/trace，仓库节点仍单独返回 warehouseEvents；国际轨迹不可用时 events=[] 且 trackingStatus=unavailable。列表不拉取实时国内或国际轨迹，trackingStatus=not_loaded。"});
add("POST","/api/purchase-orders/:id/pay","payPurchaseBill","代购订单","确认使用客户钱包支付账单",purchase,{body:purchasePaymentInput,description:"只扣 bills[].dueCents（剩余应付），累计已付为 paidCents。首次付款可仅提交 confirm:true；补款必须同时提交当前 billVersion 和 amountCents=dueCents，过期版本/金额或未确认补款返回 409。按账单付款阶段幂等，原子更新客户余额、账单和流水。仅扣客户钱包；不会代替后台向 HioBuy 付款。付款后由运营人员审核并正式下单。"});

const manualCartEntry = object({type:{const:"manual"},id:str,form:z.toJSONSchema(manualPurchaseInput) as Schema,version:int,state:{type:"string",enum:["draft","submitting","submitted","removed"]},createdAt:int,updatedAt:int});
add("POST","/api/cart/manual-items","addManualCart","购物车","将手工填单加入购物车",manualCartEntry,{body:manualPurchaseInput,description:"复用原 id 和内容重试，不覆盖已编辑数量或复活已删除记录。不创建代购单，不调用 HioBuy，不扣款。"});
add("PUT","/api/cart/manual-items/:id","updateManualCart","购物车","编辑手工单暂存信息",manualCartEntry,{body:manualCartUpdate,description:"提交 version 和完整 form；form.id 必须与路径一致。版本冲突或已开始提交返回 409。"});
add("DELETE","/api/cart/manual-items/:id","removeManualCart","购物车","移除手工单暂存信息","Ok",{body:manualCartVersion});
add("POST","/api/cart/manual-items/:id/checkout","checkoutManualCart","购物车","从购物车提交手工代购单",object({id:str}),{body:manualCartVersion,description:"固定当前版本后创建一笔本地手工单，成功后从购物车隐藏。重试返回同一订单 ID，失败可继续原提交；不直接向 HioBuy 采购或付款。"});

const shoppingFields = { id:str, channel:str, productId:str, product, createdAt:int, updatedAt:int };
const cartShop = object({id:{type:["string","null"]},name:{type:["string","null"]},url:{type:["string","null"]}});
const cartAmount = {currency:{const:"CNY"},displayOnly:{const:true},unitPriceCents:{type:["integer","null"]},subtotalCents:{type:["integer","null"]},priceComplete:{type:"boolean"},snapshotAt:{type:["integer","null"]}};
const cartItem = object({ type:{const:"standard"}, ...shoppingFields, skuId:str, quantity:int, version:int, shop:cartShop, ...cartAmount });
const cartGroup = object({type:{const:"standard"},key:str,channel:str,shop:cartShop,items:array(cartItem),totalQuantity:int,subtotalCents:{type:["integer","null"]},priceComplete:{type:"boolean"}});
const manualCartGroup = object({type:{const:"manual"},key:str,channel:str,shop:cartShop,items:array(object({...(manualCartEntry.properties as Record<string,Schema>),quantity:int,unitPriceCents:{type:"null"},subtotalCents:{type:"null"},priceComplete:{const:false}})),totalQuantity:int,subtotalCents:{type:"null"},priceComplete:{const:false}});
const favorite = object(shoppingFields);
const shoppingQuery = { page:paged.page, pageSize:paged.pageSize };
add("GET","/api/cart/count","countCart","购物车","查询购物车商品数量",object({total:int,totalQuantity:int}),{description:"需要登录，统计当前客户两类购物车。total 为普通 SKU 条目数加手工填单记录数；totalQuantity 为全部商品件数。仅计 draft/submitting，排除已提交和移除记录。不调用 HioBuy、不读取商品快照或计算价格。适用于购物车角标。"});
add("GET","/api/cart","getCart","购物车","统一获取普通与手工购物车",object({standardTotal:int,manualTotal:int,standardSubtotalCents:{type:["integer","null"]},currency:{const:"CNY"},displayOnly:{const:true},groups:array({oneOf:[cartGroup,manualCartGroup]}),total:int,totalQuantity:int,subtotalCents:{type:["integer","null"]},priceComplete:{type:"boolean"}}),{description:"不分页，旧 page/pageSize 参数忽略。groups 统一返回全部店铺分组，不再返回 manualItems。type=standard/manual 用于区分条目身份；两类可一起提交统一预览和下单。普通组按平台+shop.id 聚合；手工填单只有店名，不能当作可靠店铺 ID，每份填单独立成组，shop.id=null、shop.name 为填单店名，items 保留完整 form 和版本。两类数据均来自 cart_items。total=standardTotal+manualTotal，totalQuantity 包含全部手工件数。standardSubtotalCents 为普通商品合计；有手工填单时整车 subtotalCents=null、priceComplete=false，手工金额以下单账单为准。按平台+店铺 ID 分组，店铺未知时每条单独分组，不按店名合并。普通条目按 SKU 计数，手工条目按完整填单计数；件数汇总全部商品。商品展示单价取 SKU 原始 CNY 价格并应用当前商品加价，单位为 CNY 分；小计=单价×数量，不含服务费、国内或国际运费，不采用促销及阶梯价。旧快照会尝试从 HioBuy 补齐（最多 4 个商品并发，每用户每分钟最多补齐 20 个商品，限流为 Worker isolate 范围）；失败或价格/定价缺失时金额返回 null，priceComplete=false，相应店铺及整车小计也为 null。快照非实时库存，snapshotAt 为价格采集时间。只返回加价后展示金额，不泄露成本或定价规则；实际结算必须使用 POST /api/cart/preview。分组和组内按最新条目更新时间顺序。"});
add("POST","/api/cart/items","addCartItem","购物车","加入购物车",cartItem,{body:cartInput,description:"服务端查询真实商品并验证 SKU 与库存。同客户、平台、商品、SKU 唯一；重复加入返回已有项，不累加或覆盖数量。修改数量使用 PATCH。"});
add("PATCH","/api/cart/items/:id","updateCartItem","购物车","修改数量并刷新商品信息",cartItem,{body:cartUpdateInput,description:"传入绝对 quantity 和当前 version；并发修改或重试过期版本返回 409，重新查询后确认数量。"});
add("DELETE","/api/cart/items/:id","removeCartItem","购物车","移除购物车商品","Ok");
const cartQuotePrice = object(Object.fromEntries(Object.entries(purchaseQuote.properties as Record<string,Schema>).filter(([key]) => !["id", "expiresAt"].includes(key))));
const cartTotals = { currency:str, goodsCents:int, serviceCents:int, shippingCents:int, discountCents:int, totalCents:int, referencePrice:(purchaseQuote.properties as Record<string,Schema>).referencePrice };
const cartSelection = object({id:str,type:{type:"string",enum:["standard","manual"]},version:int});
const cartPreview = object({id:str,expiresAt:int,orderCount:int,...cartTotals,groups:array(object({key:str,type:{type:"string",enum:["standard","manual"]},platform:str,shop:cartShop,items:array(cartSelection),estimated:{type:"boolean"},quote:cartQuotePrice}))});
const cartCheckoutResult = object({id:str,previewId:str,currency:str,totalCents:int,orders:array(object({id:str,key:str,type:{type:"string",enum:["standard","manual"]},platform:str}))});
add("POST","/api/cart/preview","previewCart","购物车","混合购物车拆单报价",cartPreview,{body:cartPreviewInput,description:"一次选择 1–50 条，items 使用 id/type/version；type 可为 standard/manual，省略按 standard 兼容。普通商品按最新平台+店铺 ID 拆组，店铺未知时仅同商品合并；手工每份完整填单独立成组，不按同名店铺误合并。普通子单同店最多 50 SKU；手工每份填单仍最多 20 行商品。各子单分别计算国内运费、服务费、折扣，返回 groups[].quote 和汇总金额；currency 为结算币种，referencePrice 为 CNY 参考，手工 estimated=true。couponCode 对每笔普通子单分别校验门槛和计算折扣，每单占用一次；手工不使用优惠券，纯手工传优惠码报错。预览不占券、不锁车、不下单；任一子组失败不返回可提交预览。报价有效 8 分钟。注意顶层 id 现在是统一 previewId，必须传给 POST /api/cart/checkout，不再作为 POST /api/purchase-orders 的 quoteId。"});
add("POST","/api/cart/checkout","checkoutCart","购物车","统一提交购物车拆分订单",cartCheckoutResult,{body:cartCheckoutInput,description:"提交客户端生成的 UUID id、统一 previewId 和 confirm=true。服务端使用已保存报价，不接收客户端金额；复核全部条目的归属、类型、版本、状态、报价期限及优惠券。所有子单、待支付账单、优惠券占用、购物车清理在同一 D1 事务提交；失败全部回滚。成功移除本次普通条目、隐藏已提交的手工填单，未选商品保留。相同 id+previewId 重试返回同一结果，已成功时不受报价到期影响；一个 previewId 只允许提交一次。orders[].id 用于订单详情、钱包或 Stripe 支付，支付仍逐订单进行，不自动扣款或推送 HioBuy。手工备注和商品信息沿用填单快照；手工账单采用预览价，仓库确认后走既有补款流程。"});
add("GET","/api/cart/checkouts/:id","getCartCheckout","购物车","查询购物车下单结果",cartCheckoutResult,{description:"仅查询本人的统一购物车下单结果。断线后可用提交时的 UUID id 查询；成功返回所有子订单 ID，未提交成功返回 404，重试 POST 时复用原 id 和 previewId。"});
add("GET","/api/favorites","listFavorites","商品收藏","分页查看商品收藏",object({items:array(favorite),total:int,page:int,pageSize:int}),{query:shoppingQuery});
add("POST","/api/favorites","addFavorite","商品收藏","收藏商品",favorite,{body:favoriteInput,description:"同客户、平台、商品唯一；重复请求返回已有收藏。保存真实商品展示快照，不保存或接受客户端售价。"});
add("DELETE","/api/favorites/:id","removeFavorite","商品收藏","取消收藏","Ok");
add("POST","/api/products/seller/search","searchSellerProducts","代购商品","查询店铺商品",object({items:array(searchProduct),page:int,pageSize:int,total:{type:["number","null"]}}),{body:sellerSearchInput,description:"1688 必传 seller_open_id，微店必传 shop_id；淘宝暂不支持。店铺标识来自平台，不可用商品 ID 替代。items[].price 与关键词搜索相同，返回人民币分的商品参考售价，最终金额以订单预览为准。"});
add("POST","/api/products/search-by-image","searchProductsByImage","代购商品","以图搜物",object({items:array(searchProduct),page:int,pageSize:int,total:{type:["number","null"]}}),{body:imageSearchInput,description:"uploadId、image_id、image_url、image_base64 四选一。uploadId 使用 POST /api/uploads/images 返回的 id，支持 1688/淘宝/微店；服务端校验当前用户归属、文件大小和格式后读取 R2：1688/淘宝转为 Base64，微店生成最多 5 分钟的只读签名 URL（不超过图片到期时间）调用 HioBuy，不向上游传递 uploadId、存储路径或私有 URL。图片不存在、已删除或不属于当前用户返回 404。微店支持 uploadId 或公网 HTTPS image_url；1688/淘宝也支持 base64（可带 JPEG/PNG/GIF data URL 前缀，最多 3 MB）。分页最多 50 条。items[].price 与关键词搜索相同，返回人民币分的商品参考售价，最终金额以订单预览为准。图片传给 HioBuy 检索，不在本站保存；受上游额度和 Worker isolate 范围限流约束。"});

add("GET", "/api/products/categories", "listProductCategories", "代购商品", "商品分类（多语言及图标）", object({ items: array(object({ id:str, parentId:{type:["string","null"]}, name:str, locale:str, icon:{anyOf:[object({type:{type:"string",enum:["name","url"]},value:str}),{type:"null"}]},  keyword:str, sortOrder:int })), total:int }), { public: true, query:{ parentId:{...str,description:"root 查询顶级分类，UUID 查询直接子分类；省略时一次返回所有可见层级，不分页。"},locale:{...str,description:"支持 en、zh-Hans、zh-Hant、ru 及 zh-CN/zh-TW 等别名；未提供使用站点默认语言。"}}, description:"不分页，旧 page/pageSize 参数会被忽略。无需登录即可读取本站配置的已启用且所有祖先均启用的分类，含 parentId，按 sortOrder、id 升序。名称按请求语言、站点默认语言、英文回退，locale 为实际返回名称的语言。icon 为名称或 HTTPS 图片地址，空值由 APP 自行决定展示。分类跨平台通用；keyword 可用于现有商品搜索，channel 由客户端选择；分类 ID 是本站 UUID，不是 HioBuy 类目 ID。"});

add("POST","/api/uploads/images","uploadClientImage","图片上传","上传客户端图片",object({id:str,filename:str,url:str,contentType:str,size:int,width:int,height:int,createdAt:int,temporary:{type:"boolean"},expiresAt:{type:["integer","null"]}}),{media:"multipart/form-data",body:object({file:{type:"string",format:"binary"},temporary:{type:"string",enum:["true","false"],default:"false"}},["file"]),description:"需登录，temporary 可选字符串 true/false，默认 false。true 为 24 小时临时图片，返回 expiresAt（Unix 毫秒）；到期读取和搜索均返回 404，由每分钟任务分批物理删除。仅接受一个 file 文件：PNG/JPEG，最大 3 MiB，最大 20 百万像素、单边 10000。文件名为 UTC 时间（含毫秒）加随机 UUID。校验 MIME、文件头和尺寸，不是病毒扫描或完整解码。每用户每分钟 10 次（Worker isolate 范围）。url 为需当前用户授权的相对路径，不是公共图片链接。"});
add("GET","/api/uploads/images/:id","readClientImage","图片上传","读取本人上传图片",{}, {binary:"image/*",description:"需上传者登录，Bearer 客户端应带 Authorization 请求二进制；其他用户返回 404，不支持直接作为 HioBuy image_url。"});
add("DELETE","/api/uploads/images/:id","deleteClientImage","图片上传","删除本人上传图片","Ok",{description:"需登录，仅删除当前用户命名空间的图片；重复删除成功。"});

add("GET","/api/uploads/image-access/:token","readSignedSearchImage","图片上传","读取搜图专用签名图片",{}, {public:true,binary:"image/*",description:"仅供 HioBuy 拉图。无需登录，但必须提供服务端生成的有效签名 token；只读单张图片，最多有效 5 分钟且不超过图片到期时间。缺失、篡改、过期或图片已删除均返回 404。响应禁止缓存。客户端无需自行构造或调用此链接。"});

const activityQuery={page:paged.page,pageSize:paged.pageSize,channel:{type:"string",enum:["1688","taobao","weidian"]}};
const identityQuery={channel:{type:"string",enum:["1688","taobao","weidian"]},productId:str};
const subscription=object({id:str,channel:str,shopId:str,name:{type:["string","null"]},url:{type:["string","null"]},imageUrl:{type:["string","null"]},createdAt:int});
const historyItem=object({id:str,channel:str,productId:str,product,createdAt:int,lastViewedAt:int});
add("GET","/api/favorites/status","getProductFavoriteStatus","商品收藏","查询单件商品收藏状态",object({channel:str,productId:str,isFavorited:{type:"boolean"},favoriteId:{type:["string","null"]},createdAt:{type:["integer","null"]}}),{query:identityQuery,description:"channel、productId 必填，仅查询当前客户，无需调用 HioBuy。未收藏返回 false/null；favoriteId 可用于已有取消收藏接口。"});
add("POST","/api/shop-subscriptions","subscribeShop","店铺订阅","订阅店铺",subscription,{body:shopSubscriptionInput,description:"channel、shopId 必填。1688 的 shopId 使用 seller_open_id，微店使用 shop_id，淘宝使用客户端掌握的店铺 ID。同客户、平台、店铺唯一，重复提交不覆盖原始展示资料。name/url/imageUrl 为可选客户端展示信息，不代表上游已验证；服务端不抓取这些 URL。仅保存关注，不自动推送通知。"});
add("GET","/api/shop-subscriptions","listShopSubscriptions","店铺订阅","查询店铺订阅",object({items:array(subscription),total:int,page:int,pageSize:int}),{query:activityQuery,description:"按创建时间、ID 倒序，默认 20 条，最多 50 条；可按平台筛选。"});
add("GET","/api/shop-subscriptions/status","getShopSubscriptionStatus","店铺订阅","查询店铺订阅状态",object({channel:str,shopId:str,isSubscribed:{type:"boolean"},subscriptionId:{type:["string","null"]},createdAt:{type:["integer","null"]}}),{query:{channel:identityQuery.channel,shopId:str},description:"channel、shopId 必填，仅查询当前客户。"});
add("DELETE","/api/shop-subscriptions/:id","unsubscribeShop","店铺订阅","取消店铺订阅","Ok",{description:"id 为订阅记录 UUID，仅删除本人记录，重复删除成功。"});
add("POST","/api/browsing-history","recordBrowsingHistory","浏览历史","记录商品浏览",historyItem,{body:browsingHistoryInput,description:"客户端显式上报 channel、productId。服务端查询并校验 HioBuy 商品详情后保存安全展示快照，不接受客户端价格。相同平台和商品合并并刷新最近浏览时间；每客户全平台合计保留最近 200 条。不记录浏览次数；重复上报仅刷新时间。"});
add("GET","/api/browsing-history","listBrowsingHistory","浏览历史","查询最近浏览",object({items:array(historyItem),total:int,page:int,pageSize:int}),{query:activityQuery,description:"按 lastViewedAt、ID 倒序，默认 20 条，最多 50 条；可按平台筛选。列表为历史快照，不代表当前价格或库存。"});
add("DELETE","/api/browsing-history/:id","deleteBrowsingHistory","浏览历史","删除一条浏览记录","Ok",{description:"id 为记录 UUID，仅删除本人记录，重复删除成功。"});
add("DELETE","/api/browsing-history","clearBrowsingHistory","浏览历史","清空本人浏览历史","Ok",{description:"删除当前用户全部平台的浏览历史，不影响收藏、订阅、购物车或其他客户。"});
