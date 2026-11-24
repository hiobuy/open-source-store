import { and, count, desc, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import { Hono } from "hono";
import { announcementInput, announcementQuery, announcementTranslation, type AnnouncementRecord, type AnnouncementForm } from "../src/domain/announcements";
import type { AdminEnv } from "./admin";
import type { Database } from "./db/client";
import { announcements, auditLogs } from "./db/schema";
import { parseInput } from "./operations-input";
import { publicLocale } from "./locale";
import { AppError } from "./errors";

function view(row:typeof announcements.$inferSelect):AnnouncementRecord {
  const {mutationId:_mutation,translations,...rest}=row;
  return {...rest,translations:JSON.parse(translations) as AnnouncementForm["translations"]};
}
export async function listAnnouncements(db:Database,raw:unknown,admin=false){
  const input=parseInput(announcementQuery,raw);
  const where=and(admin?(input.status?eq(announcements.status,input.status):undefined):eq(announcements.status,"published"),input.q?like(announcements.translations,`%${input.q}%`):undefined);
  const rows=await db.select().from(announcements).where(where).orderBy(desc(announcements.pinned),desc(announcements.publishedAt),desc(announcements.createdAt),desc(announcements.id)).limit(input.pageSize).offset((input.page-1)*input.pageSize);
  const total=(await db.select({n:count()}).from(announcements).where(where))[0].n;
  const {defaultLocale}=await publicLocale(db);
  const items=rows.map(row=>admin?view(row):publicView(row,input.locale,defaultLocale));
  return {items,total,page:input.page,pageSize:input.pageSize};
}
function publicView(row:typeof announcements.$inferSelect,locale?:string,fallback?:string){
  const translated=announcementTranslation(JSON.parse(row.translations),locale,fallback);
  return {id:row.id,...translated,pinned:row.pinned,publishedAt:row.publishedAt!,updatedAt:row.updatedAt};
}
export async function readAnnouncement(db:Database,id:string,locale?:string){
  parseInput(z.string().uuid(),id);
  const [row]=await db.select().from(announcements).where(and(eq(announcements.id,id),eq(announcements.status,"published")));
  if(!row)throw new AppError("NOT_FOUND","Announcement not found.",404);
  return publicView(row,locale,(await publicLocale(db)).defaultLocale);
}
export async function saveAnnouncement(db:Database,actor:{id:string;email:string},id:string,raw:unknown){
  parseInput(z.string().uuid(),id);const input=parseInput(announcementInput,raw),now=Date.now(),mutationId=crypto.randomUUID();
  const values={translations:JSON.stringify(input.translations),status:input.status,pinned:input.pinned,updatedAt:now,mutationId};
  const write=input.version===0
    ?db.insert(announcements).values({...values,id,version:1,createdAt:now,publishedAt:input.status==="published"?now:null}).onConflictDoNothing().returning()
    :db.update(announcements).set({...values,version:input.version+1,publishedAt:input.status==="published"?sql`COALESCE(${announcements.publishedAt},${now})`:announcements.publishedAt}).where(and(eq(announcements.id,id),eq(announcements.version,input.version))).returning();
  const [rows]=await db.batch([write,db.insert(auditLogs).select(sql`SELECT ${crypto.randomUUID()},${actor.id},${actor.email},'announcements.save',${id},${JSON.stringify({status:input.status})},${now} WHERE EXISTS (SELECT 1 FROM announcements WHERE id=${id} AND mutation_id=${mutationId})`)]);
  if(!rows.length)throw new AppError("CONFLICT","This announcement changed. Reload before editing.",409);
  return view(rows[0]);
}
export const announcementsAdmin=new Hono<AdminEnv>();
announcementsAdmin.get("/announcements",async c=>c.json({data:await listAnnouncements(c.get("db"),c.req.query(),true),requestId:c.get("requestId")}));
announcementsAdmin.put("/announcements/:id",async c=>c.json({data:await saveAnnouncement(c.get("db"),c.get("user"),c.req.param("id"),await c.req.json()),requestId:c.get("requestId")}));
