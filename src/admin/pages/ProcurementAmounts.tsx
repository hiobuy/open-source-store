import { formatCnyRate } from "../../domain/exchange-rates";
import { useId } from "react";
import { ShoppingBag, Truck, CreditCard, Calculator, Info, Tag, type LucideIcon } from "lucide-react";
import { useI18n } from "../lib/i18n";
import type { ProcurementOrder } from "../../types/operations";

function AmountLine({Icon,tip,amount,className=""}:{Icon:LucideIcon;tip:string;amount:string;className?:string}) {
  const id=useId();
  return <div className={`flex items-center gap-2 py-1 text-xs ${className}`}><span className="group relative inline-flex shrink-0"><button type="button" aria-label={tip} aria-describedby={id} className="rounded text-indigo-500 outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"><Icon size={15}/></button><span id={id} role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-64 whitespace-normal rounded-md bg-slate-800 px-3 py-2 text-xs font-normal leading-5 text-white shadow-lg group-hover:block group-focus-within:block">{tip}</span></span><span className="tabular-nums">{amount}</span></div>;
}
export function ProcurementAmounts({overview:v}:{overview:ProcurementOrder["overview"]}) {
  const {t,locale}=useI18n(),meta=v?.amountMetadata;
  const money=(n:number|null|undefined,currency:string)=>n==null?"—":new Intl.NumberFormat(locale,{style:"currency",currency,currencyDisplay:"code"}).format(n/100);
  const currency=v?.billCurrency??"USD";
  let serviceTip=t("Service fee: charged according to the saved order bill.");
  if(meta?.serviceBps!=null&&meta.serviceFixedCnyCents!=null){
    serviceTip=t("Service fee: {rate}% of the goods amount.",{rate:meta.serviceBps/100});
    if(meta.serviceFixedCnyCents)serviceTip+=" "+t("Plus {amount} per item.",{amount:money(meta.serviceFixedCnyCents,"CNY")});
    if(meta.upstreamFeeCnyCents)serviceTip+=" "+t("Includes {amount} of upstream fees recorded at checkout.",{amount:money(meta.upstreamFeeCnyCents,"CNY")});
  }
  const cnyTip=(meta?.cnyBasis==="original"?t("Original CNY amount: goods, domestic shipping and service fees saved at checkout."):t("CNY equivalent: converted from the billed total using the saved order exchange rate."))+" "+(meta?.exchangeRate?t("Order exchange rate: 1 CNY = {rate} {currency}.",{currency,rate:formatCnyRate(meta.exchangeRate)}):t("No historical exchange rate is available."));
  return <section aria-label={t("Fee breakdown")}>
    <AmountLine Icon={ShoppingBag} tip={t("Goods amount: selling unit price × quantity.")} amount={money(v?.billGoodsCents,currency)}/>
    <AmountLine Icon={Truck} tip={t("Domestic shipping: seller delivery to the warehouse in China.")} amount={money(v?.billShippingCents,currency)}/>
    <AmountLine Icon={CreditCard} tip={serviceTip} amount={money(v?.billServiceCents,currency)}/>
    {!!v?.billDiscountCents&&<AmountLine Icon={Tag} tip={t("Discount deducted from this bill.")} amount={money(-v.billDiscountCents,currency)}/>}
    <AmountLine Icon={Calculator} tip={t("Order total: sum of the billed items after currency conversion and rounding, less discounts. International freight is excluded.")} amount={money(v?.billTotalCents,v?.billCurrency??currency)} className="mt-1 border-t border-line pt-2 text-sm font-semibold"/>
    <AmountLine Icon={Info} tip={cnyTip} amount={money(meta?.cnyTotalCents,"CNY")} className="mt-1 border-t border-dashed border-line pt-2 text-[10px] text-slate-400 [&_button]:text-slate-400"/>
  </section>;
}
