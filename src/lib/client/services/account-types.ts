export interface CustomerUser {
  id?: string | number;
  uid?: string;
  userId?: string | number;
  name?: string;
  userName?: string;
  avatar?: string;
  phone?: string;
  email?: string;
  payment_password_set?: boolean | number;
  [key: string]: unknown;
}
export interface TimezoneRecord {
  code?: string;
  timezone?: string;
  value?: string;
  label?: string;
}
export interface AreaRecord {
  id?: number;
  area_id?: number;
  name?: string;
  label?: string;
  areas?: AreaRecord[];
  children?: AreaRecord[];
}
export interface CountryRecord {
  id?: string | number;
  country_id?: string | number;
  countryId?: string | number;
  name?: string;
  cn_name?: string;
  en_name?: string;
  code?: string;
  iso_code?: string;
  country_code?: string;
  alpha2?: string;
  timezone?: string;
  hot?: number | string | boolean;
  index?: number;
  flag?: string;
  flag_url?: string;
  flag_icon?: string;
  logo?: string;
  icon?: string;
  image?: string;
  country_flag?: string;
  areas?: AreaRecord[];
  children?: AreaRecord[];
  regions?: { code: string; name?: string }[];
}
