export interface ShippingPaymentQuote {
  id: number;
  order_sn: string;
  actual_payment_fee: number;
  all_freight_fee?: number;
  freight_fee?: number;
  line_service_fee?: number;
  line_rule_fee?: number;
  value_added_amount?: string;
  discount_payment_fee?: number;
  payment_fee?: number;
}
