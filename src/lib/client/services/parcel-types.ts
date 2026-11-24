export interface ParcelDetail {
  id: number;
  name: string;
  qty: number;
  spec: string;
  images?: string[];
  full_path_images?: string[];
}

export interface ParcelProp {
  id: number;
  name: string;
  color: string;
  font_color: string;
}

export interface ParcelData {
  id: number;
  express_num: string;
  package_name: string;
  package_weight: number;
  length: number;
  width: number;
  height: number;
  free_store_days: number;
  package_pictures: string[];
  details: ParcelDetail[];
  prop: ParcelProp[];
  warehouse: {
    id?: number;
    warehouse_name: string;
    free_store_days?: number;
  };
  express_name: string;
  status_name: string;
  created_at: string;
  updated_at: string;
  chosen_service?: Array<{
    id: number;
    content: string;
  }>;
  free_store?: {
    days: number;
    start_at: string;
  };
}
