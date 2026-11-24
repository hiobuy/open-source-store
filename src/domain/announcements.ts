import { z } from "zod";
import { localeCatalog, matchNavigatorLocale } from "./locale";

const translation = z.object({ title: z.string().trim().min(1).max(160), content: z.string().trim().min(1).max(20000) }).strict();
export const announcementInput = z.object({
  translations: z.partialRecord(z.enum(localeCatalog.map(l=>l.code)), translation).refine(v=>Object.keys(v).length>0,"Add at least one complete translation."),
  status: z.enum(["draft","published","archived"]), pinned: z.boolean(), version: z.number().int().min(0),
}).strict();
export const announcementQuery = z.object({
  page:z.coerce.number().int().min(1).max(10000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(20),
  locale:z.string().max(35).optional(),q:z.string().trim().max(100).default(""),status:z.enum(["draft","published","archived"]).optional(),
}).strict();
export type AnnouncementForm = z.infer<typeof announcementInput>;
export type AnnouncementRecord = AnnouncementForm & {id:string;publishedAt:number|null;createdAt:number;updatedAt:number};
export type PublicAnnouncement = {id:string;title:string;content:string;locale:string;pinned:boolean;publishedAt:number;updatedAt:number};
export function announcementTranslation(translations:AnnouncementForm["translations"],requested?:string,fallback="en") {
  const matched=requested?matchNavigatorLocale(requested,localeCatalog.map(l=>l.code)):null;
  const code=[matched,fallback,"en",...localeCatalog.map(l=>l.code)].find(code=>code&&translations[code as keyof typeof translations])!;
  return {...translations[code as keyof typeof translations]!,locale:code};
}
