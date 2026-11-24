import { record } from "./purchase";
const integer=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
/** Display-only historical metadata. No current policy or procurement cost fallback. */
export function purchaseAmountMetadata(raw:string|null, totalCents:number|null, discountCents:number|null) {
  let saved:Record<string,unknown>={};try{saved=record(JSON.parse(raw??"{}"));}catch{}
  const policy=record(saved.policy),rate=policy.cnyPerCurrencyE4;
  const exchangeRate=integer(rate)&&rate>0?rate:null;
  const serviceBps=integer(policy.serviceBps)?policy.serviceBps:null;
  const serviceFixedCnyCents=integer(policy.serviceCnyCents)?policy.serviceCnyCents:null;
  const upstreamFeeCnyCents=integer(saved.upstreamFeeCnyCents)?saved.upstreamFeeCnyCents:null;
  let originalCnyCents:number|null=null;
  if(Array.isArray(saved.lines)&&saved.lines.length&&integer(saved.domesticCnyCents)) {
    let sum=BigInt(saved.domesticCnyCents)+BigInt(upstreamFeeCnyCents??0),valid=true;
    for(const value of saved.lines){const line=record(value);if(!integer(line.quantity)||line.quantity<1||!integer(line.sellingUnitCnyCents)||!integer(line.serviceUnitCnyCents)){valid=false;break;}sum+=(BigInt(line.sellingUnitCnyCents)+BigInt(line.serviceUnitCnyCents))*BigInt(line.quantity);}
    if(valid&&sum<=BigInt(Number.MAX_SAFE_INTEGER)&&!discountCents)originalCnyCents=Number(sum);
  }
  const converted=exchangeRate!==null&&integer(totalCents)?Number((BigInt(totalCents)*BigInt(exchangeRate)+5000n)/10000n):null;
  return {exchangeRate,serviceBps,serviceFixedCnyCents,upstreamFeeCnyCents,
    cnyTotalCents:originalCnyCents??(converted!==null&&Number.isSafeInteger(converted)?converted:null),
    cnyBasis:originalCnyCents!==null?"original" as const:"converted" as const};
}
