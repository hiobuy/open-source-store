/** Compare customer receipts using their immutable bill rates, never today's display rate. */
export function purchaseCostCoverage(costCnyCents: number | null, bills: {status:string; currency:string; totalCents:number; paidCents?:number; snapshot:string}[]): "covered" | "shortfall" | "unverified" {
  if (costCnyCents === null || !Number.isSafeInteger(costCnyCents) || costCnyCents < 0) return "unverified";
  const paid = bills.filter(b => b.status !== "void" && (b.status === "paid" || (b.paidCents ?? 0)>0));
  if (!paid.length) return "unverified";
  let receivedCnyE4 = 0n;
  for (const bill of paid) {
    const received = bill.paidCents ?? bill.totalCents;
    if (!Number.isSafeInteger(received) || received < 0) return "unverified";
    let rate = 10000;
    if (bill.currency !== "CNY") {
      try {
        const policy = JSON.parse(bill.snapshot)?.policy;
        if (policy?.currency !== bill.currency || !Number.isSafeInteger(policy.cnyPerCurrencyE4) || policy.cnyPerCurrencyE4 <= 0) return "unverified";
        rate = policy.cnyPerCurrencyE4;
      } catch { return "unverified"; }
    }
    // totalCents is already net of discounts. No markup or service fee is added to cost.
    receivedCnyE4 += BigInt(received) * BigInt(rate);
  }
  return receivedCnyE4 >= BigInt(costCnyCents) * 10000n ? "covered" : "shortfall";
}
