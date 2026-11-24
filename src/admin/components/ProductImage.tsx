import { useState } from "react";
import { ImageOff } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { ImagePreview } from "./ImagePreview";

export function ProductImage({url,name}:{url?:string|null;name:string}){
  const {t}=useI18n(),[failedUrl,setFailedUrl]=useState<string | null>(null),[preview,setPreview]=useState(false);
  const style="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 sm:size-20";
  if(!url||failedUrl===url)return <span className={`${style} text-slate-400`} title={t(url?"Image unavailable":"No product image saved")} role="img" aria-label={t(url?"Image unavailable":"No product image saved")}><ImageOff size={22}/></span>;
  return <><button type="button" className={`${style} cursor-zoom-in focus-visible:outline-2 focus-visible:outline-indigo-500`} title={t("View product image")} aria-label={`${t("View product image")}: ${name}`} onClick={event=>{event.stopPropagation();setPreview(true);}}><img src={url} alt={name} referrerPolicy="no-referrer" loading="lazy" onError={()=>setFailedUrl(url)} className="h-full w-full object-contain"/></button>{preview&&<ImagePreview key={url} url={url} name={name} onClose={()=>setPreview(false)}/>}</>;
}
