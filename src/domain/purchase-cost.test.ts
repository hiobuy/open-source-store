import { describe, expect, it } from "vitest";
import { purchaseCostCoverage } from "./purchase-cost";
const bill = (totalCents=250, rate=72000) => ({ status:"paid",currency:"USD",totalCents,snapshot:JSON.stringify({policy:{currency:"USD",cnyPerCurrencyE4:rate,markupBps:1000,serviceBps:600}}) });
describe("purchase cost coverage",()=>{
  it("compares net receipts using the historical rate, without adding selling fees to cost",()=>{
    expect(purchaseCostCoverage(1500,[bill()])).toBe("covered");
    expect(purchaseCostCoverage(1800,[bill()])).toBe("covered");
    expect(purchaseCostCoverage(1801,[bill()])).toBe("shortfall");
    expect(purchaseCostCoverage(1800,[bill(200)])).toBe("shortfall");
    expect(purchaseCostCoverage(1800,[bill(200),bill(50)])).toBe("covered");
  });
  it("never uses issued bills, missing rates or missing cost as zero",()=>{
    expect(purchaseCostCoverage(1,[{...bill(),status:"issued"}])).toBe("unverified");
    expect(purchaseCostCoverage(null,[bill()])).toBe("unverified");
    expect(purchaseCostCoverage(1,[{...bill(),snapshot:"{}"}])).toBe("unverified");
    expect(purchaseCostCoverage(1,[{...bill(),snapshot:"invalid"}])).toBe("unverified");
    expect(purchaseCostCoverage(1,[bill(250,0)])).toBe("unverified");
    expect(purchaseCostCoverage(250,[{...bill(),currency:"CNY",snapshot:"{}"}])).toBe("covered");
  });
  it("uses cumulative receipts instead of the re-priced bill total",()=>{
    expect(purchaseCostCoverage(1800,[{...bill(500),status:"issued",paidCents:250}])).toBe("covered");
    expect(purchaseCostCoverage(1801,[{...bill(500),status:"issued",paidCents:250}])).toBe("shortfall");
    expect(purchaseCostCoverage(1800,[{...bill(200),paidCents:250}])).toBe("covered");
    expect(purchaseCostCoverage(1,[{...bill(),status:"void",paidCents:250}])).toBe("unverified");
  });
  it("does not round a fractional shortfall into coverage",()=>{
    expect(purchaseCostCoverage(1,[bill(1,9999)])).toBe("shortfall");
    expect(purchaseCostCoverage(1,[bill(1,10000)])).toBe("covered");
  });
});
