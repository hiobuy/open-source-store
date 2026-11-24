import { describe, expect, it } from "vitest";
import { packageGoodsPatch, readPackageGoods } from "./package-goods";

const payload = { items: [{name:"T-shirt",quantity:1,image_url:"https://example.com/shirt.jpg",unit_price:15}], total_value:15, currency:"CNY" };
describe("fulfillment package goods",()=>{
  it("reads real goods and converts major units without treating CNY as USD",()=>{
    const goods=readPackageGoods(payload)!;
    expect(goods).toEqual({items:[{name:"T-shirt",quantity:1,imageUrl:"https://example.com/shirt.jpg"}],valueCents:1500,currency:"CNY"});
    expect(packageGoodsPatch({productName:null,quantity:null,declaredValueFen:null},goods)).toMatchObject({productName:"T-shirt",quantity:1,declaredValueFen:1500,declaredCurrency:"CNY"});
    expect(readPackageGoods({...payload,total_value:"15.09"})?.valueCents).toBe(1509);
    expect(goods.items[0]).not.toHaveProperty("unit_price");
  });
  it("preserves manual declaration values and ignores absent or invalid goods",()=>{
    const patch=packageGoodsPatch({productName:"My declaration",quantity:3,declaredValueFen:700},readPackageGoods(payload));
    expect(Object.keys(patch)).toEqual(["fulfillmentItems"]);
    for(const raw of [{}, {items:[]}, {...payload,items:[{name:"T-shirt",quantity:-1}]}])expect(readPackageGoods(raw)).toBeNull();
    expect(packageGoodsPatch({productName:null,quantity:null,declaredValueFen:null},null)).toEqual({});
  });
  it("rejects unsafe images and ambiguous monetary values",()=>{
    for(const url of ["javascript:alert(1)","https://user:pass@example.com/x","http://example.com/x"])expect(readPackageGoods({...payload,items:[{name:"T-shirt",quantity:1,image_url:url}]})?.items[0].imageUrl).toBeNull();
    for(const total_value of [-1,"15.999","unknown"])expect(readPackageGoods({...payload,total_value})?.valueCents).toBeNull();
    expect(readPackageGoods({...payload,currency:null})?.valueCents).toBeNull();
  });
});
