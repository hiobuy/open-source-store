import type { ConsultData } from "@/lib/store/parcel";
export interface OrderServiceRecord {
  image_requirement?: string;
  example_images?: string[];
  system_type?: number;
}
export interface OrderService {
  id: number;
  name: string;
  system_type?: number;
  charge_type?: number;
  records?: OrderServiceRecord[];
}
/** 订单 SKU 类型 */
export interface OrderSku {
  id: number;
  name: string;
  price: number;
  quantity: number;
  amount: number;
  remark: string;
  requirement_images?: string[];
  platform_url?: string;
  services?: OrderService[];
  sku_info?: {
    imgs?: string[];
    specs?: Array<{
      label: string;
      value: string;
    }>;
    sku_img?: string;
    pic_url?: string;
  };
}
/** 订单数据类型 */
export interface DaigouOrderData {
  id: number;
  order_sn: string;
  status: number;
  status_name: string;
  sub_status?: number;
  sub_status_name?: string;
  created_at: string;
  goods_amount: number;
  freight_fee: number;
  service_fee: number;

  amount: number;
  skus?: OrderSku[];
  pay_status?: number;
  packages?: Array<{
    express_num?: string;
    status?: number;
    package_pictures?: string[];
  }>;
  last_consult?: ConsultData;
  no_read_count?: number;
  vas_fee: number;
  paid_at?: string;
  payment_type_name?: string;
  purchase_packages?: unknown[];
  post_sales?: AfterSaleItem[];
  expresses?: Array<{
    id: unknown;
    created_at?: string;
    pivot?: { express_num?: string };
  }>;
  orbit?: Array<{ id: unknown; order_sn: string }>;
}

export interface AfterSaleItem {
  id: number;
  sn: string;
  created_at: string;
  type?: string;
  status: number;
  reason_name?: string;
  remark?: string;
  images?: string[];
  cs_remark?: string;
  cs_images?: string[];
  skus?: Array<{
    id: number;
  }>;
  order_sn: string;
  oafs?: Array<{
    id: number;
    status: number;
    amount: number;
    remark?: string;
    refund_amount?: string;
    refund_method?: string;
    sn?: string;
    created_at?: string;
  }>;
  refunds?: Array<{
    id: number;
    refund_amount?: string;
    refund_method?: string;
  }>;
  dealt_at?: string;
}
