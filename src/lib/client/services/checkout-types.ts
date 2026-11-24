/** 服务记录项 */
export interface ServiceRecord {
  service_id?: number;
  image?: string;
  remark?: string;
  system_type?: number;
  charge_type?: number;
}
/** 增值服务项 */
export interface PackageServiceItem {
  id: number;
  name: string;
  content?: string;
  value: number;
  remark?: string;
  checked?: boolean;
  charge_type?: number;
  system_type?: number;
  free_value?: number;
  service_records?: ServiceRecord[];
}
/** 购物车 SKU（与 Cart 一致） */
export interface CartSku {
  id: number;
  num_iid?: string | number;
  name: string;
  price: number;
  amount?: number;
  quantity: number;
  origin_price?: number;
  freight_fee?: number;
  platform_url?: string;
  platform_sku?: string | number;
  sku_id?: string | number;
  spec_id?: string;
  imgs?: string[];
  platform?: string;
  remark?: string;
  requirement_images?: string[];
  service_records?: ServiceRecord[];
  package_service?: PackageServiceItem[];
  sku_info?: {
    sku_id?: string | number;
    spec_id?: string;
    sku_img?: string;
    shop_id?: string | number;
    shop_name?: string;
    imgs?: string[];
    freight_fee?: number;
    priceRangeList?: Array<{ startQuantity: number; price: number }>;
    min_order_quantity?: number;
    batch_number?: number;
    specs_cn?: Array<{ label: string; value: string }>;
    pic_url?: string;
    attributes?: Array<{
      label: string;
      value: string;
    }>;
    specs?: Array<{
      label: string;
      value: string;
    }>;
  };
}
/** 购物车店铺（与 Cart 一致，含 Vue regroupData 字段） */
export interface CartShop {
  id: string;
  name: string;
  avatar?: string;
  icon?: string;
  freight_fee?: number;
  goods_amount?: number;
  platform?: string;
  quantity?: number;
  collapse?: boolean;
}
/** 代购服务 */
export interface DaigouOrderService {
  id: number;
  name: string;
  remark: string;
  service_fee: number;
  fee_type: number;
}
/** 购物车分组（与 Cart 一致） */
export interface CartGroup {
  skus: CartSku[];
  shop: CartShop;
  services: DaigouOrderService;
}

export interface ImmediatePurchase {
  shop_id?: string | number;
  warehouse_id?: string | number;
  freight_fee?: number;
  platform?: string;
  platform_url?: string;
  name?: string;
  title?: string;
  title_cn?: string;
  amount?: number;
  goods_amount?: number;
  num_iid?: string | number;
  item_imgs?: string[];
  skus: Array<{
    price?: number | string;
    quantity?: number | string;
    platform_sku?: string | number;
    spec_id?: string;
    freight_fee?: number;
    sku_info?: NonNullable<CartSku["sku_info"]>;
  }>;
}

export interface CheckoutPaymentOrder {
  id: number;
  total_amount?: number;
  currency?: string;
  rate?: string;
  skus?: Array<Partial<CartSku> & { title?: string }>;
}
