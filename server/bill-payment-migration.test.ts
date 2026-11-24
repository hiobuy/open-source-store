import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
describe("historical purchase receipts migration",()=>{
  it("backfills paid bills using historical amounts and keeps unpaid/void bills at zero",()=>{
    const db=new DatabaseSync(":memory:");
    try {
      db.exec("CREATE TABLE procurement_bills (id TEXT PRIMARY KEY, status TEXT NOT NULL, total_cents INTEGER NOT NULL); INSERT INTO procurement_bills VALUES ('paid','paid',250),('free','paid',0),('unpaid','issued',500),('void','void',900);");
      db.exec(readFileSync("drizzle/0026_greedy_mad_thinker.sql","utf8").replaceAll("--> statement-breakpoint",""));
      expect(db.prepare("SELECT id, paid_cents FROM procurement_bills ORDER BY id").all().map(r=>[r.id,r.paid_cents])).toEqual([["free",0],["paid",250],["unpaid",0],["void",0]]);
    } finally {db.close();}
  });
});
