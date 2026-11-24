export interface CatalogProduct {
  id?: number;
  detail_url?: string;
  num_iid?: number;
  pic_url?: string;
  price?: number;
  orginal_price?: number;
  goods_original_price?: string;
  sales?: number;
  title?: string;
  seller_nick?: string;
  tags?: unknown[];
  quantity?: number;
  [key: string]: unknown;
}

export interface ProductListResult {
  items?: {
    item?: CatalogProduct[];
    total_results?: string | number;
  };
}

export interface SelectedProductCategory {
  id?: number;
  name?: string;
  products?: CatalogProduct[];
}

export interface WarehouseSummary {
  id: number;
  warehouse_name: string;
  tips?: string;
}
