import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("merges both tables without losing colliding IDs, frozen forms or checkout recovery state", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE user(id TEXT PRIMARY KEY); INSERT INTO user VALUES('owner');
      CREATE TABLE cart_items(id TEXT PRIMARY KEY, customer_id TEXT, channel TEXT, product_id TEXT, sku_id TEXT, quantity INTEGER, product TEXT, version INTEGER, created_at INTEGER, updated_at INTEGER);
      CREATE TABLE manual_cart_items(id TEXT PRIMARY KEY, customer_id TEXT, payload TEXT, initial_payload TEXT, order_id TEXT, state TEXT, version INTEGER, created_at INTEGER, updated_at INTEGER);
      INSERT INTO cart_items VALUES('same-id','owner','1688','product','sku',2,'{}',4,100,200);`);
    const form = JSON.stringify({sourcePlatform:"jd",items:[{quantity:3},{quantity:4}]});
    for (const [i,state] of ["draft","submitting","submitted","removed"].entries()) db.prepare("INSERT INTO manual_cart_items VALUES(?,?,?,?,?,?,?,?,?)").run(i===0?"same-id":`manual-${i}`,"owner",form,"original-form",`order-${i}`,state,7,300,400);
    db.exec(readFileSync("drizzle/0029_burly_quicksilver.sql","utf8"));
    expect(db.prepare("SELECT COUNT(*) AS n FROM cart_items").get()?.n).toBe(5);
    expect(db.prepare("SELECT type,quantity,version FROM cart_items WHERE id='same-id' ORDER BY type").all()).toEqual([{type:"manual",quantity:7,version:7},{type:"standard",quantity:2,version:4}]);
    expect(db.prepare("SELECT payload,initial_payload,order_id,state FROM cart_items WHERE id='manual-1'").get()).toEqual({payload:form,initial_payload:"original-form",order_id:"order-1",state:"submitting"});
    expect(db.prepare("SELECT COUNT(*) AS n,SUM(quantity) AS q FROM cart_items WHERE state IN ('draft','submitting')").get()).toEqual({n:3,q:16});
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='manual_cart_items'").get()).toBeUndefined();
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally { db.close(); }
});
