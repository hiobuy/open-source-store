import { describe, expect, it } from "vitest";
import { procurementProfitCnyCents as profit } from "./procurement-profit";

const snapshot=JSON.stringify({policy:{currency:"USD",cnyPerCurrencyE4:72000}});
describe("procurement profit",()=>{
  it("converts net receipts at the historical rate and subtracts only actual cost",()=>{
    expect(profit(23600,"paid",3464,"USD",snapshot)).toBe(1341);
    expect(profit(1800,"paid",250,"USD",snapshot)).toBe(0);
    expect(profit(1900,"paid",250,"USD",snapshot)).toBe(-100);
    expect(profit(100,"paid",200,"CNY",null)).toBe(100);
  });
  it("does not invent profit for unpaid or missing financial evidence",()=>{
    expect(profit(null,"paid",250,"USD",snapshot)).toBeNull();
    expect(profit(100,"issued",250,"USD",snapshot)).toBeNull();
    for(const value of [null,"broken","{}",JSON.stringify({policy:{currency:"EUR",cnyPerCurrencyE4:72000}})])
      expect(profit(100,"paid",250,"USD",value)).toBeNull();
    expect(profit(100,"paid",null,"CNY",null)).toBeNull();
  });
});
