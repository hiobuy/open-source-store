/** Legacy address field shape still used by address form components. */
export interface StoredAddress {
  id: number;
  receiver_name?: string;
  name?: string;
  phone?: string;
  country_name?: string;
  country?: { id?: number; name?: string };
  area?: { id?: number; name?: string };
  sub_area?: { id?: number; name?: string };
  low_area?: { id?: number; name?: string };
  area_id?: number;
  sub_area_id?: number;
  country_id?: number;
  province?: string;
  state?: string;
  city?: string;
  district?: string;
  street?: string;
  address?: string;
  door_no?: string;
  postcode?: string;
  is_default?: number;
  timezone?: string;
  station?: { name?: string };
}
