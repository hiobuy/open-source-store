// 地址数据类型
export type { StoredAddress as AddressData } from "@/lib/client/services/address-types";
import type { StoredAddress as AddressData } from "@/lib/client/services/address-types";
// 渠道数据类型
export interface ShippingChannel {
  id: number;
  name: string;
  props?: Array<{
    id: number;
    color?: string;
    font_color?: string;
    name?: string;
    prop_name?: string;
  }>;
  cn_name?: string;
  en_name?: string;
  icon?: {
    id: number;
    icon: string;
    name: string;
  };
  current_prices?: Array<{
    id: number;
    type: number;
    start: number;
    end: number;
    price: number;
  }>;
  reference_time?: string;
  expire_fee?: number;
  [key: string]: unknown;
}
