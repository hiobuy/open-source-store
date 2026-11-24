// UI fixtures only. These amounts are illustrative snapshots, never payable quotes.
export const orderStates = {
  awaiting_payment: "Awaiting customer payment", pending: "Pending", buying: "Purchasing",
  transit: "Seller shipped", partial: "Partially received", stocked: "In warehouse",
  packed: "Consolidated", shipped: "Shipped", exception: "Purchase issue", after: "After-sales",
} as const;
export type OrderState = keyof typeof orderStates;
export type OrderLine = { name: string; sku: string; quantity: number; priceCents: number; received: number; locked: number };
export type PreviewOrder = {
  id: string; customer: string; member: string; platform: string; date: string; state: OrderState;
  payment: "Paid" | "Unpaid" | "Supplement due" | "Partially refunded";
  lines: OrderLine[]; shippingCents: number; serviceCents: number; totalUsdCents: number;
  costCnyCents: number; upstream: string | null; tracking: string | null; parcels: string[];
  issue: string; notes: { text: string; at: string; kind: string }[];
};
export const sampleCustomers = [{ name: "Emma Wilson", member: "DEMO-1001" }, { name: "Lucas Martin", member: "DEMO-1002" }, { name: "Sofia Rossi", member: "DEMO-1003" }];
export function sampleOrders(): PreviewOrder[] {
  const states: OrderState[] = ["pending", "awaiting_payment", "buying", "transit", "partial", "stocked", "exception", "after", "packed", "shipped", "pending", "awaiting_payment"];
  return states.map((state, i) => {
    const customer = sampleCustomers[i % 3];
    const arrived = ["partial", "stocked", "after", "packed", "shipped"].includes(state);
    const upstream = !["pending", "awaiting_payment", "exception"].includes(state);
    return {
      id: `DEMO-SO-${String(101 + i)}`, customer: customer.name, member: customer.member,
      platform: ["1688", "Taobao", "Weidian"][i % 3], date: `2026-11-${String(1 + i % 9).padStart(2, "0")}`,
      state, payment: state === "awaiting_payment" ? "Unpaid" : state === "exception" ? "Supplement due" : state === "after" ? "Partially refunded" : "Paid",
      lines: [{ name: ["Cotton oversized T-shirt", "Canvas shoulder bag", "Everyday running shoes"][i % 3], sku: ["Black / L", "Natural / Large", "White / EU 40"][i % 3], quantity: 3, priceCents: 8000, received: arrived ? state === "partial" ? 2 : 3 : 0, locked: state === "after" ? 1 : 0 }],
      shippingCents: 1200, serviceCents: 1440, totalUsdCents: 3700, costCnyCents: 25200,
      upstream: upstream ? `DEMO-PO-${101 + i}` : null, tracking: arrived || state === "transit" ? `DEMO-TRACK-${101 + i}` : null,
      parcels: arrived ? [`DEMO-PKG-${101 + i}`] : [], issue: state === "exception" ? "Seller price changed. Customer approval and a supplemental payment are required." : state === "after" ? "One item has a size issue and remains on hold." : "", notes: [],
    };
  });
}
