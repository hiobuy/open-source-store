import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { createDb, type Database } from "./db/client";
import { admin, type AdminEnv } from "./admin";
import { user, staffMembers, freightPolicy, freightAreas, auditLogs } from "./db/schema";
import { freightPolicyRow } from "./freight";
import { AppError } from "./errors";
vi.mock("cloudflare:workers",()=>({env:{}}));
vi.mock("cloudflare:sockets",()=>({connect:vi.fn()}));

let mf:Miniflare, db:Database;
const app = new Hono<AdminEnv>();
app.use("*",async(c,next)=>{
  const id=c.req.header("test-actor") ?? "manager";
  c.set("db",db); c.set("user",{id,name:id,email:id+"@example.invalid"}); c.set("requestId","test"); await next();
});
app.route("/api/admin",admin);
app.onError((error,c)=>c.json({error:error.message},error instanceof AppError ? error.status as 400 : 500));
beforeAll(async()=>{
  mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:"test-address-book",modules:true,script:"export default {fetch(){return new Response()}}",d1Databases:["DB"]}]}));
  const binding=await mf.getD1Database("DB");
  for(const file of readdirSync("drizzle").filter(f=>f.endsWith(".sql")).sort()) {
    await binding.batch(readFileSync("drizzle/"+file,"utf8").split(";").map(s=>s.replaceAll("--> statement-breakpoint","").trim()).filter(Boolean).map(s=>binding.prepare(s)));
  }
  db=createDb(binding as unknown as D1Database);
  for(const id of ["owner","manager","support","alice","bob"]) {
    await db.insert(user).values({id,name:id,email:id+"@example.invalid",memberCode:id,createdAt:new Date(),updatedAt:new Date()});
    if(["owner","manager","support"].includes(id)) await db.insert(staffMembers).values({userId:id,role:id,status:"active",createdAt:1,updatedAt:1});
  }
  await freightPolicyRow(db); await db.update(freightPolicy).set({syncSource:"hiobuy"});
  await db.insert(freightAreas).values({id:"us",countryCode:"US",regionCode:"west",regionName:"West",enabled:true,updatedAt:1});
},30000);
afterAll(async()=>{await mf?.dispose()});
const send=(path:string,method="GET",body?:unknown,actor="manager")=>app.request("/api/admin"+path,{method,headers:{"test-actor":actor,"content-type":"application/json"},body:body?JSON.stringify(body):undefined},{});
const address={firstName:"Jane",lastName:"Doe",phoneCode:"+1",phone:"5550100",countryCode:"US",regionCode:"west",city:"Town",state:"CA",postalCode:"90210",addressLine1:"Test Street"};

it("manages only the target customer's addresses, preserves a default and audits without contact details",async()=>{
  const book="/users/alice/addresses";
  expect((await send(book,"POST",address,"support")).status).toBe(403);
  expect((await send(book,"POST",{...address,regionCode:"closed"})).status).toBe(400);
  const first=await (await send(book,"POST",address)).json() as {data:{id:string;isDefault:boolean}};
  expect(first.data.isDefault).toBe(true);
  const second=await (await send(book,"POST",address)).json() as typeof first;
  const path=book+"/"+second.data.id;
  expect((await send(path,"PATCH",{...address,city:"Newtown"})).status).toBe(200);
  expect((await send(path+"/default","POST")).status).toBe(200);
  const foreign="/users/bob/addresses/"+second.data.id;
  for(const [method,suffix,body] of [["DELETE","",undefined],["PATCH","",address],["POST","/default",undefined]] as const)
    expect((await send(foreign+suffix,method,body)).status).toBe(404);
  const found=await (await send("/customer-addresses?q=Newtown","GET",undefined,"support")).json();
  expect(found).toMatchObject({data:{total:1,items:[{customerId:"alice",id:second.data.id,isDefault:true}]}});
  expect((await send(path,"DELETE")).status).toBe(200);
  expect(await (await send(book)).json()).toMatchObject({data:{customer:{id:"alice"},addresses:[{id:first.data.id,isDefault:true}]}});
  const logs=await db.select().from(auditLogs);
  expect(logs.filter(l=>l.action.startsWith("customer.address."))).toHaveLength(5);
  expect(JSON.stringify(logs)).not.toMatch(/Test Street|5550100/);
});
