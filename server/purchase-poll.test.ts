import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { eq } from "drizzle-orm";
import { createDb, type Database } from "./db/client";
import { procurementOrders, procurementRemote, purchaseQuotes, user } from "./db/schema";
import { performPurchaseAction } from "./purchase";
import { procurementOverviews } from "./procurement-overview";
import { pollPurchases } from "./purchase-poll";
import { AppError } from "./errors";

vi.mock("./purchase", () => ({ performPurchaseAction: vi.fn() }));
vi.mock("./procurement-overview", () => ({ procurementOverviews: vi.fn() }));
let mf: Miniflare, db: Database;
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({workers:[{name:"poll-test",modules:true,script:"export default {fetch(){return new Response('test')}}",d1Databases:["DB"]}]}));
  const binding = await mf.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter(f=>f.endsWith(".sql")).sort()) {
    const statements=readFileSync(`drizzle/${file}`,"utf8").split(";").map(s=>s.replaceAll("--> statement-breakpoint","").trim()).filter(Boolean);
    await binding.batch(statements.map(s=>binding.prepare(s)));
  }
  db=createDb(binding as unknown as D1Database);
  await db.insert(user).values({id:"poll-user",name:"Poll",email:"poll@example.invalid",memberCode:"POLL-TEST",createdAt:new Date(),updatedAt:new Date()});
},30000);
afterAll(async()=>{await mf?.dispose();});
beforeEach(async()=>{
  await db.delete(procurementRemote);await db.delete(purchaseQuotes);await db.delete(procurementOrders);
  vi.mocked(performPurchaseAction).mockReset().mockResolvedValue(null);
  vi.mocked(procurementOverviews).mockReset().mockResolvedValue([{stage:"buying"}] as Awaited<ReturnType<typeof procurementOverviews>>);
});
async function seed(overrides: Partial<typeof procurementRemote.$inferInsert> = {}) {
  const id=crypto.randomUUID(),now=Date.now();
  await db.insert(procurementOrders).values({id,number:id,customerId:"poll-user",platform:"1688",goodsCents:100,shippingCents:0,totalCents:100,requestHash:id,createdBy:"poll-user",createdAt:now,updatedAt:now});
  await db.insert(purchaseQuotes).values({id,customerId:"poll-user",channel:"1688",request:"{}",preview:"{}",pricing:"{}",costCnyCents:100,createdAt:now,expiresAt:now});
  await db.insert(procurementRemote).values({orderId:id,quoteId:id,channel:"1688",remoteId:`DG-${id}`,state:"created",costCnyCents:100,updatedAt:now,...overrides});
  return id;
}
async function saved(id:string){return (await db.select().from(procurementRemote).where(eq(procurementRemote.orderId,id)))[0];}
describe("persisted procurement polling",()=>{
  it("polls only due bound orders and never creates or pays",async()=>{
    const due=await seed();await seed({remoteId:null});await seed({state:"cancelled"});await seed({state:"paying"});await seed({syncNextAt:Date.now()+600_000});await seed({syncNextAt:null});
    const cancelled=await seed();await db.update(procurementOrders).set({status:"cancelled"}).where(eq(procurementOrders.id,cancelled));
    expect(await pollPurchases(db,"test-token")).toEqual({processed:1,failed:0});
    expect(performPurchaseAction).toHaveBeenCalledExactlyOnceWith(db,"test-token",expect.objectContaining({id:"system:purchase-poll"}),due,"sync",undefined,undefined,expect.any(Number));
    const row=await saved(due);expect(row.syncNextAt).toBeGreaterThan(Date.now()+290_000);expect(row.syncLockToken).toBeNull();
    expect((await pollPurchases(db,"test-token")).processed).toBe(0);
  });
  it("claims a lease once across overlapping cron invocations",async()=>{
    const id=await seed();
    let finish!:()=>void, entered!:()=>void;
    const started=new Promise<void>(r=>{entered=r;}), hold=new Promise<void>(r=>{finish=r;});
    vi.mocked(performPurchaseAction).mockImplementation(async()=>{entered();await hold;return null;});
    const first=pollPurchases(db,"test-token");await started;
    expect((await pollPurchases(db,"test-token")).processed).toBe(0);
    finish();expect((await first).processed).toBe(1);
    expect(performPurchaseAction).toHaveBeenCalledTimes(1);expect((await saved(id)).syncLockToken).toBeNull();
  });
  it("recovers expired leases, backs off failures, and resets after success",async()=>{
    const id=await seed({syncLockToken:"crashed",syncLockedUntil:Date.now()-1,syncFailures:2});
    vi.mocked(performPurchaseAction).mockRejectedValueOnce(new AppError("PURCHASE_PACKAGE_REVIEW","private upstream details",409));
    expect(await pollPurchases(db,"test-token")).toEqual({processed:1,failed:1});
    expect(await saved(id)).toMatchObject({syncFailures:3,syncErrorCode:"PURCHASE_PACKAGE_REVIEW",syncLockToken:null});
    expect((await saved(id)).syncNextAt).toBeGreaterThan(Date.now()+19*60_000);
    await db.update(procurementRemote).set({syncNextAt:0}).where(eq(procurementRemote.orderId,id));
    await pollPurchases(db,"test-token");
    expect(await saved(id)).toMatchObject({syncFailures:0,syncErrorCode:null});
  });
  it.each(["stocked","packed","shipped","cancelled"])("stops %s orders",async(stage)=>{
    const id=await seed();vi.mocked(procurementOverviews).mockResolvedValue([{stage}] as Awaited<ReturnType<typeof procurementOverviews>>);
    await pollPurchases(db,"test-token");expect((await saved(id)).syncNextAt).toBeNull();
    expect((await pollPurchases(db,"test-token")).processed).toBe(0);
  });
  it("limits each invocation to five and skips calls without credentials",async()=>{
    for(let i=0;i<7;i++)await seed();
    expect((await pollPurchases(db,"")).processed).toBe(0);
    expect((await pollPurchases(db,"test-token",100)).processed).toBe(5);
    expect((await pollPurchases(db,"test-token")).processed).toBe(2);
  });
});
