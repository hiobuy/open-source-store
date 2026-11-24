interface TrackProductItem {
  item_id: string;
  item_name?: string;
  item_variant?: string;
  price?: number;
  quantity?: number;
}
export default class Analytics {
  // ga4 事件上报
  static trackGAEvent(eventName: string, params?: Record<string, unknown>) {
    if (typeof window === "undefined" || !window.__ga4Enabled) return;
    window.gtag?.("event", eventName, params);
  }
  // meta pixel 事件上报
  static trackMetaPixelEvent({
    eventName,
    params,
    eventType = "track",
  }: {
    eventName: string;
    params?: Record<string, unknown>;
    eventType?: "track" | "trackCustom";
  }) {
    if (typeof window === "undefined" || !window.__facebookPixelEnabled) return;
    window.fbq?.(eventType, eventName, params);
  }
  // 登录
  static trackLogin(data?: { method: string }) {
    this.trackGAEvent("login", data);
  }
  // 注册
  static trackRegister() {
    this.trackGAEvent("sign_up");
    this.trackMetaPixelEvent({ eventName: "CompleteRegistration" });
  }
  // 商品搜索
  static trackProductSearch(content: string) {
    this.trackGAEvent("search", { search_term: content });
    this.trackMetaPixelEvent({
      eventName: "Search",
      params: {
        search_string: content,
      },
    });
  }
  // 浏览商品列表
  static trackViewProductList({
    currency,
    items,
  }: {
    currency: string;
    items: TrackProductItem[];
  }) {
    this.trackGAEvent("view_item_list", {
      currency,
      items,
    });
  }
  // 点击某个商品
  static trackSelectItem({ items }: { items: TrackProductItem[] }) {
    this.trackGAEvent("select_item", { items });
  }
  // 查看商品信息
  static trackViewItem({
    currency,
    value,
    items,
  }: {
    currency: string;
    value: number;
    items: TrackProductItem[];
  }) {
    this.trackGAEvent("view_item", {
      currency,
      value,
      items,
    });
    this.trackMetaPixelEvent({
      eventName: "ViewContent",
      params: {
        currency,
        value,
        content_type: "product",
        content_ids: items.map((item) => item.item_id),
        content_name: items.map((item) => item.item_name || "").join(","),
      },
    });
  }
  // 添加购物车
  static trackAddToCart({
    currency,
    value,
    items,
  }: {
    currency: string;
    value: number;
    items: TrackProductItem[];
  }) {
    this.trackGAEvent("add_to_cart", {
      currency,
      value,
      items,
    });
    this.trackMetaPixelEvent({
      eventName: "AddToCart",
      params: {
        content_type: "product",
        currency,
        value,
        content_ids: items.map((item) => item.item_id),
        content_name: items.length === 1 ? items[0].item_name : undefined,
        contents: items.map((item) => ({
          id: item.item_id,
          quantity: item.quantity ?? 1,
          item_price: item.price,
        })),
      },
    });
  }
  // 查看购物车
  static trackViewCart({
    currency,
    value,
    items,
  }: {
    currency: string;
    value: number;
    items: TrackProductItem[];
  }) {
    this.trackGAEvent("view_cart", {
      currency,
      value,
      items,
    });
  }
  // 商品从购物车移除
  static trackRemoveFromCart({
    currency,
    value,
    items,
  }: {
    currency: string;
    value: number;
    product_id: string;
    items: TrackProductItem[];
  }) {
    this.trackGAEvent("remove_from_cart", {
      currency,
      value,
      items,
    });
  }
  // 开始结算
  static trackBeginCheckout({
    currency,
    value,
    items,
  }: {
    currency: string;
    value: number;
    items: TrackProductItem[];
  }) {
    this.trackGAEvent("begin_checkout", {
      currency,
      value,
      items,
    });
    this.trackMetaPixelEvent({
      eventName: "InitiateCheckout",
      params: {
        content_ids: items.map((item) => item.item_id),
        contents: items.map((item) => ({
          id: item.item_id,
          quantity: item.quantity ?? 1,
          item_price: item.price,
        })),

        num_items: items.reduce((sum, item) => sum + (item.quantity ?? 1), 0),
        currency,
        value,
      },
    });
  }
  // 购买
  static trackPurchase({
    currency,
    value,
    items,

    transaction_id,
    shipping,
  }: {
    currency: string;
    value: number;
    items: TrackProductItem[];

    transaction_id: string;
    shipping?: number;
  }) {
    this.trackGAEvent("purchase", {
      currency,
      value,
      transaction_id,
      shipping,
      items,
    });
    this.trackMetaPixelEvent({
      eventName: "Purchase",
      params: {
        content_type: "product",
        currency,
        value,
        contents: items.map((item) => ({
          id: item.item_id,
          quantity: item.quantity ?? 1,
          item_price: item.price,
        })),
        num_items: items.reduce((sum, item) => sum + (item.quantity ?? 1), 0),
        order_id: transaction_id,
        shipping,
      },
    });
  }
}
