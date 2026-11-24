import type { ConsultData } from "@/lib/store/parcel";
export interface OrderDetail {
  id: number;
  name: string;
  images?: string[];
  full_path_images?: string[];
}

export interface OrderData {
  id: number;
  order_sn: string;
  logistics_sn: string;
  logistics_company: string;
  status: number;
  payment_weight: number;
  length: number;
  width: number;
  height: number;
  freight_fee: number;
  actual_payment_fee?: number; // Amount actually paid
  created_at: string;
  updated_at: string;
  shipped_at?: string; // Shipped at
  paid_at?: string; // Paid at
  pack_pictures?: Array<{
    id: number;
    order_id: number;
    url: string;
    company_id: number;
    full_path: string;
  }>; // 打包照片数组
  last_consult?:
    | ConsultData
    | {
        id: number;
      }
    | null; // 咨询数据，可能为完整结构或仅 id
  no_read_count?: number;
  express?: {
    id: number;
    name: string;
  };
  express_line?: {
    name: string;
  };
  packages?: Array<{
    id: number;
    package_pictures?: string[];
    package_name?: string;
    details?: OrderDetail[];
  }>;
  /** 多箱时（length > 1）列表用箱数代替长宽高展示 */
  boxes?: unknown[];
}
