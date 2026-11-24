import { describe, expect, it } from "vitest";
import { presentChannelDetail } from "./channel-detail";
const policy={markupBps:1000,markupCnyFen:300,cnyPerUsdE4:72000};
const payload={code:"AIR",regions:[{code:"US",name:"United States",countries:["US"]},{code:"JP",name:"Japan",countries:["JP"]}],rate_cards:[{region_code:"US",price_rows:[{type:"FIRST_WEIGHT",range:{minimum:0,maximum:1,unit:"KG"},charge:{currency:"CNY",amount:1000}},{type:"CONTINUED_WEIGHT",range:{minimum:1,maximum:2,unit:"KG"},charge:{currency:"CNY",amount:500}}]},{region_code:"JP",price_rows:[{charge:{currency:"CNY",amount:9999}}]}],value_added_services:[{code:"PHOTO",pricing_basis:"PER_SHIPMENT",region_prices:[{region_code:"JP",value_unit:"MINOR_UNIT",fixed_charge:{currency:"CNY",amount:999}},{region_code:"US",value_unit:"MINOR_UNIT",fixed_charge:{currency:"CNY",amount:200}}]},{code:"INSURANCE",pricing_basis:"DECLARED_VALUE",region_prices:[{region_code:"US",value_unit:"PERCENT",value:10}]}]};
describe("channel selling references",()=>{
  it("applies percentage markup to rows and fixed markup once per shipment",()=>{
    const result=presentChannelDetail(payload,"US","public",policy)!;
    expect(result.rates).toHaveLength(1);
    expect(result.rates![0].rows.map(r=>r.amountCents)).toEqual([1100,550]);
    expect(result.ratePricing).toMatchObject({priceType:"selling",currency:"CNY",fixedChargePerShipmentCents:300,referenceOnly:true});
    expect(result.rates![0].rows[0]).toMatchObject({type:"FIRST_WEIGHT",minimum:0,maximum:1,unit:"KG",amount:"¥11.00"});
    expect(presentChannelDetail(payload,"US","admin")!.rates![0].rows[0].amountCents).toBe(1000);
  });
  it("filters regional service costs and keeps service purchase prices admin-only",()=>{
    const admin=presentChannelDetail(payload,"US","admin")!;
    expect(admin.services[0].price).toBe("¥2.00");
    expect(admin.services[0].purchasePrices).toMatchObject([{regionCode:"US",pricingBasis:"PER_SHIPMENT",amountCents:200,priceType:"purchase"}]);
    expect(admin.services[1]).toMatchObject({price:"10%",purchasePrices:[{percentage:10,amountCents:null,pricingBasis:"DECLARED_VALUE"}]});
    const customer=presentChannelDetail(payload,"US","public",policy)!;
    expect(customer.services.every(s=>s.price===null && !s.purchasePrices)).toBe(true);
  });
  it("never turns missing, negative or non-CNY amounts into prices",()=>{
    const result=presentChannelDetail({...payload,rate_cards:[{region_code:"US",price_rows:[{charge:{amount:2,currency:"USD"}},{charge:{amount:-1,currency:"CNY"}},{charge:{amount:1.5,currency:"CNY"}},{charge:{currency:"CNY"}}]}]},"US","public",policy)!;
    expect(result.rates).toEqual([]);
    expect(presentChannelDetail(payload,"US","public")?.rates).toBeNull();
  });
});
