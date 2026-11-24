import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Dialog, Field, inputClass } from "../components/ui";
import { AdminHeader, allows, ListEmpty, RowsSkeleton, useAdminAccess } from "./shared";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { localeCatalog, type LocaleCode } from "../../domain/locale";
import { announcementInput, announcementTranslation, type AnnouncementForm, type AnnouncementRecord } from "../../domain/announcements";

export function AdminAnnouncements(){
  const access=useAdminAccess(),{t}=useI18n();
  if(access.isPending)return <RowsSkeleton/>;
  if(access.data?.role==="demo")return <ListEmpty title={t("Announcements")} body={t("This module is unavailable in the read-only demo.")}/>;
  if(!allows(access.data,"announcements.read"))return <ListEmpty title={t("Announcements")} body={t("You don't have permission for this.")}/>;
  return <Workspace writable={allows(access.data,"announcements.write")}/>;
}
function Workspace({writable}:{writable:boolean}){
  const {t,locale}=useI18n(),client=useQueryClient();
  const [q,setQ]=useState(""),[status,setStatus]=useState(""),[page,setPage]=useState(1),[draft,setDraft]=useState<AnnouncementRecord|null>(null);
  const params=new URLSearchParams({q,page:String(page),pageSize:"20",...(status?{status}:{})});
  const list=useQuery({queryKey:["admin","announcements",params.toString()],queryFn:()=>api<{items:AnnouncementRecord[];total:number}>(`/api/admin/announcements?${params}`)});
  const save=useMutation({mutationFn:({id,...body}:AnnouncementForm&{id:string})=>api(`/api/admin/announcements/${id}`,{method:"PUT",body:JSON.stringify(body)}),onSuccess:async()=>{setDraft(null);await client.invalidateQueries({queryKey:["admin","announcements"]});await client.invalidateQueries({queryKey:["announcements"]});}});
  const labels={draft:t("Draft"),published:t("Published"),archived:t("Unpublished")};
  return <div className="space-y-5">
    <AdminHeader title={t("Announcements")} meta={t("Publish updates for your customers.")} action={writable?<Button onClick={()=>{save.reset();setDraft({id:crypto.randomUUID(),translations:{},status:"draft",pinned:false,version:0,createdAt:0,updatedAt:0,publishedAt:null});}}>{t("New announcement")}</Button>:undefined}/>
    <div className="flex flex-col gap-3 sm:flex-row"><input className={inputClass} aria-label={t("Search announcements")} placeholder={t("Search announcements")} value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/><select className={inputClass} aria-label={t("Status")} value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">{t("All")}</option>{Object.entries(labels).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></div>
    {list.isPending?<RowsSkeleton/>:list.isError?<p role="alert">{t(list.error.message)} <Button variant="secondary" onClick={()=>list.refetch()}>{t("Retry")}</Button></p>:!list.data.items.length?<ListEmpty title={t("No announcements yet")} body={t("Create a draft, then publish it when ready.")}/>:<div className="space-y-3">{list.data.items.map(row=>{
      const text=announcementTranslation(row.translations,locale);
      return <Card key={row.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-slate-500">{labels[row.status]}{row.pinned?` · ${t("Pinned")}`:""}</p><h2 className="mt-1 break-words font-semibold">{text.title}</h2><p className="mt-2 line-clamp-2 break-words text-sm text-slate-500">{text.content}</p></div><Button variant="secondary" onClick={()=>{save.reset();setDraft(row);}}>{t(writable?"Edit":"View")}</Button></div></Card>;
    })}</div>}
    <div className="flex items-center justify-between text-sm"><Button variant="secondary" disabled={page===1} onClick={()=>setPage(p=>p-1)}>{t("Previous")}</Button><span>{page} / {Math.max(1,Math.ceil((list.data?.total??0)/20))}</span><Button variant="secondary" disabled={page*20>=(list.data?.total??0)} onClick={()=>setPage(p=>p+1)}>{t("Next")}</Button></div>
    {draft&&<Editor key={draft.id} record={draft} writable={writable} pending={save.isPending} error={save.error?.message} onClose={()=>{if(!save.isPending)setDraft(null);}} onSave={form=>save.mutate({id:draft.id,...form})}/>}
  </div>;
}
function Editor({record,writable,pending,error,onClose,onSave}:{record:AnnouncementRecord;writable:boolean;pending:boolean;error?:string;onClose:()=>void;onSave:(form:AnnouncementForm)=>void}){
  const {t,locale}=useI18n();const [form,setForm]=useState<AnnouncementForm>({translations:record.translations,status:record.status,pinned:record.pinned,version:record.version});
  const [language,setLanguage]=useState<LocaleCode>((localeCatalog.some(l=>l.code===locale)?locale:"en") as LocaleCode),[validation,setValidation]=useState("");
  const translation=form.translations[language]??{title:"",content:""};
  function update(field:"title"|"content",value:string){setForm(prev=>({...prev,translations:{...prev.translations,[language]:{...(prev.translations[language]??{title:"",content:""}),[field]:value}}}));}
  function submit(e:FormEvent){e.preventDefault();if(!writable||pending)return;const translations=Object.fromEntries(Object.entries(form.translations).filter(([,v])=>v&&(v.title.trim()||v.content.trim())));const result=announcementInput.safeParse({...form,translations});if(!result.success){setValidation(t("Enter a title and content for each translation."));return;}setValidation("");onSave(result.data);}
  return <Dialog open title={t(record.version?"Edit announcement":"New announcement")} onClose={onClose}><form onSubmit={submit} className="space-y-4">
    <Field label={t("Language")}><select className={inputClass} value={language} onChange={e=>setLanguage(e.target.value as LocaleCode)}>{localeCatalog.map(l=><option key={l.code} value={l.code}>{l.nativeName}</option>)}</select></Field>
    <fieldset disabled={!writable||pending} className="space-y-4">
      <Field label={t("Title")}><input className={inputClass} maxLength={160} value={translation.title} onChange={e=>update("title",e.target.value)}/></Field>
      <Field label={t("Announcement content")}><textarea className={`${inputClass} min-h-52`} maxLength={20000} value={translation.content} onChange={e=>update("content",e.target.value)}/></Field>
      <Field label={t("Status")}><select className={inputClass} value={form.status} onChange={e=>setForm({...form,status:e.target.value as AnnouncementForm["status"]})}><option value="draft">{t("Draft")}</option><option value="published">{t("Published")}</option><option value="archived">{t("Unpublished")}</option></select></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.pinned} onChange={e=>setForm({...form,pinned:e.target.checked})}/>{t("Pin announcement")}</label>
    </fieldset>
    {(validation||error)&&<p role="alert" className="text-sm text-red-700">{validation||t(error!)}</p>}
    <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={pending} onClick={onClose}>{t("Close")}</Button>{writable&&<Button type="submit" disabled={pending}>{t(pending?"Saving…":"Save")}</Button>}</div>
  </form></Dialog>;
}
