/** Procurement gross margin only: historical customer receipts minus confirmed HioBuy cost. */
export function procurementProfitCnyCents(cost:number|null,status:string,total:number|null,currency:string|null,snapshot:string|null):number|null {
  if(cost===null||!Number.isSafeInteger(cost)||cost<0||status!=="paid"||total===null||!Number.isSafeInteger(total)||total<0)return null;
  let rate=10000;
  if(currency!=="CNY"){
    try{const policy=JSON.parse(snapshot??"{}")?.policy;if(!currency||policy?.currency!==currency||!Number.isSafeInteger(policy.cnyPerCurrencyE4)||policy.cnyPerCurrencyE4<=0)return null;rate=policy.cnyPerCurrencyE4;}catch{return null;}
  }
  const received=(BigInt(total)*BigInt(rate)+5000n)/10000n;
  const profit=Number(received-BigInt(cost));
  return Number.isSafeInteger(profit)?profit:null;
}
