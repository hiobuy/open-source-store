import { useMutation, useQuery } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";
import { useState } from "react";
import { Button, Dialog, Field, inputClass } from "../components/ui";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { formatMoney } from "../../domain/locale";
import type { ProcurementCustomer } from "../../types/operations";
function ProductImage({src,small=false}:{src:string;small?:boolean}) {
  const [failed,setFailed]=useState(false),{t}=useI18n();
  const style=small?"mr-3 inline-flex size-14 shrink-0":"flex size-32";
  return failed?<span className={`${style} items-center justify-center rounded bg-slate-100 text-slate-400`} role="img" aria-label={t("Image unavailable")}><ImageOff size={24}/></span>:<img src={src} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(true)} className={`${style} rounded object-cover`}/>;
}
type Product={id:string;channel:string;title:Record<string,string>;images:string[];variants:{skuId:string;stock:number|null;attributes:Record<string,string>[]}[]};
type Quote={id:string;expiresAt:number;currency:string;goodsCents:number;serviceCents:number;shippingCents:number;totalCents:number};
export function HioBuyPurchaseCreator({onClose,onSaved,client=false}:{onClose:()=>void;onSaved:(id:string)=>Promise<void>;client?:boolean}){
  const {t,locale}=useI18n(),[customerId,setCustomerId]=useState(""),[customerSearch,setCustomerSearch]=useState(""),[channel,setChannel]=useState("1688"),[keyword,setKeyword]=useState(""),[url,setUrl]=useState("");
  const [product,setProduct]=useState<Product|null>(null),[sku,setSku]=useState(""),[quantity,setQuantity]=useState(1),[lines,setLines]=useState<{id:string;spec_id:string;quantity:number;name:string}[]>([]),[quote,setQuote]=useState<Quote|null>(null),[requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const money=(amount:number,currency:string)=>formatMoney(amount,currency,locale);
  const customers=useQuery({enabled:!client,queryKey:["admin","procurement-customers",customerSearch],queryFn:()=>api<{items:ProcurementCustomer[]}>(`/api/admin/procurement/customers?q=${encodeURIComponent(customerSearch)}`)});
  const search=useMutation({mutationFn:()=>api<{items:Product[]}>(client?"/api/products/search":"/api/admin/procurement/products/search",{method:"POST",body:JSON.stringify({channel,keyword})})});
  const lookup=useMutation({mutationFn:(input:{id:string}|{url:string})=>api<{product:Product}>(`${client?"/api/products":"/api/admin/procurement/products"}/${"url"in input?"parse":"detail"}`,{method:"POST",body:JSON.stringify("url"in input?input:{channel,...input})}),onSuccess:r=>{setProduct(r.product);setSku(r.product.variants[0]?.skuId??"");}});
  const preview=useMutation({mutationFn:()=>api<Quote>(client?"/api/purchase-orders/preview":"/api/admin/procurement/remote/preview",{method:"POST",body:JSON.stringify({...(!client?{customerId}:{}),channel,lines:lines.map(({id,spec_id,quantity})=>({id,spec_id,quantity}))})}),onSuccess:q=>{setQuote(q);setRequestId(crypto.randomUUID());}});
  const create=useMutation({mutationFn:()=>api<{id:string}>(client?"/api/purchase-orders":"/api/admin/procurement/remote/create",{method:"POST",body:JSON.stringify({id:requestId,...(!client?{customerId}:{}),quoteId:quote?.id})}),onSuccess:r=>onSaved(r.id)});
  const busy=search.isPending||lookup.isPending||preview.isPending||create.isPending;
  const invalidate=()=>setQuote(null);
  return <Dialog open title={client?"New purchase":"New HioBuy purchase"} size="xl" onClose={()=>{if(!busy)onClose();}}><div className="space-y-4"><fieldset disabled={busy} className="space-y-4">
    <p className="text-sm text-slate-500">{t("Select products from one channel and seller. Preview uses the synced warehouse address and configured selling prices.")}</p>
    {!client&&<><Field label="Search customers"><input className={inputClass} value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)}/></Field>
    <Field label="Customer"><select className={inputClass} value={customerId} onChange={e=>{setCustomerId(e.target.value);invalidate();}}><option value="">{t("Select customer")}</option>{customers.data?.items.map(c=><option key={c.id} value={c.id}>{c.name} · {c.memberCode}</option>)}</select></Field>
    </>}{!client&&customers.isError&&<p role="alert">{t(customers.error.message)}</p>}
    <Field label="Platform"><select className={inputClass} value={channel} onChange={e=>{setChannel(e.target.value);setLines([]);setProduct(null);search.reset();invalidate();}}>{["1688","taobao","weidian"].map(c=><option key={c}>{c}</option>)}</select></Field>
    <div className="flex flex-col gap-2 sm:flex-row"><input className={inputClass} aria-label={t("Search products")} value={keyword} onChange={e=>setKeyword(e.target.value)}/><Button disabled={!keyword.trim()} onClick={()=>search.mutate()}>{t("Search products")}</Button></div>
    <div className="flex flex-col gap-2 sm:flex-row"><input className={inputClass} placeholder="https://…" aria-label={t("Product URL")} value={url} onChange={e=>setUrl(e.target.value)}/><Button disabled={!url.trim()} onClick={()=>lookup.mutate({url})}>{t("Parse product URL")}</Button></div>
    {search.data&&<div className="max-h-48 space-y-2 overflow-auto">{search.data.items.map(p=><button key={p.id} className="block w-full break-all rounded border border-line p-2 text-left" onClick={()=>lookup.mutate({id:p.id})}>{p.images[0]&&<ProductImage key={p.images[0]} src={p.images[0]} small/>}{Object.values(p.title)[0]||p.id}</button>)}{!search.data.items.length&&<p>{t("No matching products")}</p>}</div>}
    {product&&<div className="space-y-2 rounded border border-line p-3">{product.images[0]&&<ProductImage key={product.images[0]} src={product.images[0]}/>}<p className="break-all">{Object.values(product.title)[0]||product.id}</p><Field label="SKU / Variant"><select className={`${inputClass} min-w-0 max-w-full`} value={sku} onChange={e=>setSku(e.target.value)}>{product.variants.map(v=><option key={v.skuId} value={v.skuId}>{v.attributes.map(a=>(locale.startsWith("zh")?(a.value_zh||a.value_original):undefined)||a.value||a.name).filter(Boolean).join(" / ")||v.skuId} · {t("Stock")}: {v.stock??"—"}</option>)}</select></Field><Field label="Quantity"><input className={inputClass} type="number" min={1} max={999} value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></Field><Button disabled={!sku||product.channel!==channel||lines.length>=20||!Number.isInteger(quantity)||quantity<1||quantity>999||lines.some(l=>l.id===product.id&&l.spec_id===sku)} onClick={()=>{setLines([...lines,{id:product.id,spec_id:sku,quantity,name:Object.values(product.title)[0]||product.id}]);invalidate();}}>{t("Add product")}</Button></div>}
    {lines.map((l,i)=><div key={`${l.id}:${l.spec_id}`} className="flex items-center justify-between gap-2 text-sm"><span className="break-all">{l.name} / {l.spec_id} × {l.quantity}</span><Button variant="ghost" onClick={()=>{setLines(lines.filter((_,j)=>i!==j));invalidate();}}>{t("Remove")}</Button></div>)}
    <Button disabled={(!client&&!customerId)||!lines.length} onClick={()=>{invalidate();preview.mutate();}}>{t("Preview purchase")}</Button>
    {quote&&<div className="space-y-2 rounded bg-slate-50 p-4"><p>{t("Goods")}: {money(quote.goodsCents,quote.currency)}</p><p>{t("Service fee")}: {money(quote.serviceCents,quote.currency)}</p><p>{t("Domestic shipping")}: {money(quote.shippingCents,quote.currency)}</p><p>{t("Customer bill")}: {money(quote.totalCents,quote.currency)}</p><p className="text-xs text-slate-500">{t("Creates a local purchase request and bill. The customer pays first; an operator then submits it to HioBuy.")}</p><Button onClick={()=>create.mutate()} disabled={quote.expiresAt<=Date.now()}>{t("Create purchase request")}</Button></div>}
  </fieldset>{[search,lookup,preview,create].map((m,i)=>m.isError?<p key={i} role="alert" className="text-red-700">{t(m.error.message)}</p>:null)}</div></Dialog>;
}
