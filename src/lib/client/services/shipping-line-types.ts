export interface ShippingPriceBand {
  start: number;
  end: number;
  type?: number;
  price?: number;
  base_price?: number;
  unit_weight?: number;
  first_weight?: number;
}

export interface ShippingCharge {
  name?: string;
  is_is_forced?: number;
  type?: number;
  value?: number;
}

export interface ShippingRule extends ShippingCharge {
  min_charge?: number;
  max_charge?: number;
  is_and?: number;
  conditions?: Array<{
    id?: number;
    param_name?: string;
    comparison?: string;
    value?: string;
    address_tags?: Array<{ name?: string }>;
  }>;
}

export interface ShippingRegion {
  id?: number;
  reference_time?: string;
  prices?: ShippingPriceBand[];
  services?: ShippingCharge[];
  rules?: ShippingRule[];
}

export interface ShippingLine {
  id?: number;
  name?: string;
  logo?: string;
  icon?: {
    icon: string;
    name: string;
  };
  description?: string;
  group?: {
    remark?: string;
    [key: string]: unknown;
  };
  tags?: string[];
  labels?: Array<
    | string
    | {
        id?: number;
        uid?: string;
        name?: string;
        group?: unknown;
        label?: string;
        mode?: number;
        mode_name?: string;
        [key: string]: unknown;
      }
  >;
  props?: Array<{
    name?: string;
    [key: string]: unknown;
  }>;
  reference_time?: string;
  delivery_time?: string;
  max_weight?: number;
  min_weight?: number;
  successRate?: string;
  success_rate?: string;
  price?: string;
  freight?: string;
  expire_fee?: string | number;
  route_properties?: string[];
  billing_method?: string;
  base_mode?: number;
  mode?: number;
  price_list?: Array<{
    range?: string;
    weight_range?: string;
    priceType?: string;
    price_type?: string;
    regionPrice?: string | number;
    renewPrice?: string | number;
    regionUnit?: string;
    price?: string | number;
  }>;
  region?: ShippingRegion;
  regions?: ShippingRegion[];
  rules?: ShippingRule[];
  region_rules?: ShippingRule[];
  tips?: string;
  filtered?: number;
  filtered_reason?: number;
  remark?: string;
  [key: string]: unknown;
}
