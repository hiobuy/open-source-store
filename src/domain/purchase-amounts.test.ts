import { describe, expect, it } from "vitest";
import { purchaseAmountMetadata } from "./purchase-amounts";
const snapshot={policy:{cnyPerCurrencyE4:72000,serviceBps:600,serviceCnyCents:0},domesticCnyCents:1200,lines:[{quantity:2,sellingUnitCnyCents:4800,serviceUnitCnyCents:288},{quantity:1,sellingUnitCnyCents:12800,serviceUnitCnyCents:768}]};
describe("purchase amount display metadata",()=>{
  it("uses original selling amounts rather than rounded USD totals or purchase costs",()=>{
    expect(purchaseAmountMetadata(JSON.stringify(snapshot),3464,0)).toMatchObject({cnyTotalCents:24944,cnyBasis:"original",exchangeRate:72000,serviceBps:600});
  });
  it("includes fixed per-item service amounts and explicit upstream fees",()=>{
    const saved={...snapshot,upstreamFeeCnyCents:100,policy:{...snapshot.policy,serviceCnyCents:50},lines:snapshot.lines.map(l=>({...l,serviceUnitCnyCents:l.serviceUnitCnyCents+50}))};
    expect(purchaseAmountMetadata(JSON.stringify(saved),3500,0)).toMatchObject({cnyTotalCents:25194,serviceFixedCnyCents:50,upstreamFeeCnyCents:100});
  });
  it("marks discounted totals as an equivalent, not the undiscounted original",()=>{
    expect(purchaseAmountMetadata(JSON.stringify(snapshot),3364,100)).toMatchObject({cnyTotalCents:24221,cnyBasis:"converted"});
  });
  it("does not invent missing fees or exchange rates",()=>{
    expect(purchaseAmountMetadata(null,250,0)).toMatchObject({cnyTotalCents:null,exchangeRate:null,serviceBps:null});
    expect(purchaseAmountMetadata('invalid',250,0).cnyTotalCents).toBeNull();
    expect(purchaseAmountMetadata(JSON.stringify({policy:snapshot.policy}),250,0)).toMatchObject({cnyTotalCents:1800,cnyBasis:"converted"});
  });
});
