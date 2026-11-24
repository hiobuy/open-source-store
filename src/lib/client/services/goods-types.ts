/**
 * 代购商品详情 - 共享类型定义
 * 与 GoodsPreview 的 GoodsPreviewInfo 兼容
 */
export interface PropChild {
  id: string | number;
  name: string;
  noStock?: boolean;
}
export interface PropItem {
  id: string | number;
  name: string;
  value?: string;
  children: PropChild[];
}
export interface SkuItem {
  sku_id?: string | number;
  spec_id?: string;
  properties?: string;
  properties_cn?: string;
  quantity?: number;
  price?: number;
  sku_img?: string;
  origin_price?: number;
  sku_original_price?: number;
}
export interface PriceRangeItem {
  startQuantity: number;
  price: number;
  original_price?: number;
  wholesale_original_price?: number;
}
/** 商品属性（规格参数，name-value 形式） */
export interface GoodsPropItem {
  name?: string;
  value?: string;
}
export interface GoodsInfo {
  num_iid?: number;
  shop_id?: number | string;
  detail_url?: string;
  title?: string;
  title_cn?: string;
  price?: number;
  pic_url?: string;
  nick?: string;
  platform?: string;
  collection_id?: number | null;
  min_order_quantity?: number;
  batch_number?: number;
  item_imgs?: string[];
  mainVideo?: string;
  props_list?: PropItem[];
  props_list_cn?: PropItem[];
  props_img?: Record<string, string>;
  skus?: {
    sku?: SkuItem[];
  };
  price_pange_list?: {
    priceRangeList?: PriceRangeItem[];
  };
  priceRangeList?: PriceRangeItem[];
  /** 商品规格参数（如 产品类别、面料名称 等 name-value） */
  props?: GoodsPropItem[];
  /** 富文本描述（Production Details） */
  desc?: string;
  [key: string]: unknown;
}

export interface GoodsSelectionSnapshot {
  qtyBySku?: Record<string, number>;
  selectedSku?: SkuItem | null;
  totalQty?: number;
  selectedSkuImage?: string;
  canAdd?: boolean;
  sizeProp?: boolean;
}

/** Product data authorized and loaded by the server for this exact request. */
export interface ProductGoodsPayload {
  cacheKey: string;
  goodsInfo: GoodsInfo;
}
