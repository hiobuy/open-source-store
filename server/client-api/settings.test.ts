import { expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { createDb } from "../db/client";
import { originsInput, readClientOrigins, saveClientOrigins } from "./settings";
import { clientCorsHeaders } from "./access";
import { permissionFor } from "../../src/domain/staff";

it("validates exact origins and protects configuration writes", () => {
  for (const origin of ["https://app.example.com:8443", "http://localhost:5173", "http://[::1]:3000"]) expect(originsInput.safeParse({ origins: [origin] }).success).toBe(true);
  for (const origin of ["http://app.example.com:8080", "https://*.example.com", "https://app.example.com/path", "https://user:pass@app.example.com", "https://app.example.com?x=1", "https://a.example,https://b.example"]) expect(originsInput.safeParse({ origins: [origin] }).success).toBe(false);
  expect(permissionFor("PUT", "/settings/client-origins")).toBe("secrets.write");
});

it("persists replacement and empty allowlists without restoring environment access", async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "origins-test", modules: true, script: "export default {fetch(){return new Response('test')}}", d1Databases: ["DB"] }] }));
  try {
    const binding = await mf.getD1Database("DB");
    for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) {
      const statements = readFileSync(`drizzle/${file}`, "utf8").split(";").map(s => s.replaceAll("--> statement-breakpoint", "").trim()).filter(Boolean);
      await binding.batch(statements.map(s => binding.prepare(s)));
    }
    const db = createDb(binding as unknown as D1Database);
    const fallback = "https://old.example.com";
    expect((await readClientOrigins(db, fallback)).origins).toEqual([fallback]);
    await saveClientOrigins(db, { origins: ["https://app.example.com:8443", "https://app.example.com:8443/"] });
    const saved = await readClientOrigins(db, fallback);
    expect(saved).toEqual({ origins: ["https://app.example.com:8443"], source: "database" });
    const request = (origin: string) => new Request("https://api.example.com/api/me", { headers: { Origin: origin } });
    expect(clientCorsHeaders(request(saved.origins[0]), saved.origins.join(","))).not.toBeNull();
    expect(clientCorsHeaders(request("https://app.example.com:8444"), saved.origins.join(","))).toBeNull();
    await saveClientOrigins(db, { origins: [] });
    expect((await readClientOrigins(db, fallback)).origins).toEqual([]);
  } finally { await mf.dispose(); }
}, 30000);
