ALTER TABLE `procurement_remote` ADD `paid_cost_cny_cents` integer;--> statement-breakpoint
UPDATE procurement_remote
SET paid_cost_cny_cents = (
  SELECT json_extract(a.request, '$.pay_amount') FROM purchase_attempts a
  WHERE a.order_id = procurement_remote.order_id AND a.action = 'pay' AND a.state = 'succeeded'
    AND json_valid(a.request) AND json_valid(a.result)
    AND json_type(a.request, '$.pay_amount') = 'integer'
    AND json_extract(a.request, '$.pay_amount') >= 0
    AND json_extract(a.result, '$.success') = 1
    AND json_extract(a.result, '$.payment_status') = 'success'
    AND COALESCE(json_extract(a.result, '$.pending'),0) = 0
)
WHERE payment_status = 'paid' AND paid_cost_cny_cents IS NULL;
