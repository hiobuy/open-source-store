import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { eq } from "drizzle-orm";
import { createDb, type Database } from "../db/client";
import { createAuth, type WorkerBindings } from "../auth";
import { user, verification } from "../db/schema";
import { buildClientOpenApi, searchClientDocs } from "./openapi";
import { clientCapabilities } from "./docs";

const mail = vi.hoisted(() => ({ reset: [] as { to: string; url: string }[] }));
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("cloudflare:sockets", () => ({ connect: vi.fn() }));
vi.mock("../services/email", () => ({ createEmailService: () => ({
  sendVerificationEmail: async () => {},
  sendPasswordResetEmail: async (to: string, _name: string, url: string) => { mail.reset.push({ to, url }); },
}) }));

let mf: Miniflare, db: Database, auth: Awaited<ReturnType<typeof createAuth>>;
const origin = "http://localhost:5173", email = "reset-test@example.invalid", password = "original-password-123";
let ip = 1;
const request = (path: string, body?: unknown, headers: Record<string, string> = {}) => auth.handler(new Request(path.startsWith("http") ? path : origin + "/api/auth" + path, {
  method: body === undefined ? "GET" : "POST", headers: { "x-forwarded-for": `192.0.2.${ip++}`, ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}));
const latest = () => new URL(mail.reset.at(-1)!.url);
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "password-reset-test", modules: true, script: "export default {fetch(){return new Response()}}", d1Databases: ["DB"] }] }));
  const binding = await mf.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) {
    await binding.batch(readFileSync("drizzle/" + file, "utf8").split(";").map(s => s.replaceAll("--> statement-breakpoint", "").trim()).filter(Boolean).map(s => binding.prepare(s)));
  }
  db = createDb(binding as unknown as D1Database);
  auth = await createAuth({ ENVIRONMENT: "development", BETTER_AUTH_SECRET: "isolated-reset-test-secret-not-for-production", CLIENT_API_ORIGINS: "https://client.example" } as WorkerBindings, db, new Request(origin));
  // Better Auth disables origin checks under NODE_ENV=test; exercise production validation.
  (await auth.$context).skipOriginCheck = false;
  expect((await request("/sign-up/email", { email, password, name: "Reset Test" })).status).toBe(200);
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, email));
}, 30000);
afterAll(async () => { await mf?.dispose(); });

it("uses a trusted client redirect, resets once, and revokes existing sessions", async () => {
  const login = await request("/sign-in/email", { email, password });
  const sessionToken = login.headers.get("set-auth-token")!;
  expect(login.status).toBe(200);
  expect(sessionToken).toBeTruthy();
  expect(await (await request("/get-session", undefined, { Authorization: `Bearer ${sessionToken}` })).json()).not.toBeNull();
  const requested = await request("/request-password-reset", { email, redirectTo: "https://client.example/reset?flow=forgot" });
  expect(await requested.json()).toMatchObject({ status: true });
  const link = latest();
  expect(link.origin).toBe(origin);
  expect(link.searchParams.get("callbackURL")).toBe("https://client.example/reset?flow=forgot");
  const callback = await request(link.toString());
  expect(callback.status).toBe(302);
  const target = new URL(callback.headers.get("location")!);
  expect(target.origin).toBe("https://client.example");
  expect(target.searchParams.get("flow")).toBe("forgot");
  const token = target.searchParams.get("token");
  expect(token).toBeTruthy();
  const newPassword = "new-password-for-reset-456";
  expect((await request("/reset-password", { token, newPassword: "short" })).status).toBe(400);
  expect((await request("/reset-password", { token, newPassword })).status).toBe(200);
  expect((await request("/reset-password", { token, newPassword })).status).toBe(400);
  expect(await (await request("/get-session", undefined, { Authorization: `Bearer ${sessionToken}` })).json()).toBeNull();
  expect((await request("/sign-in/email", { email, password })).status).toBe(401);
  expect((await request("/sign-in/email", { email, password: newPassword })).status).toBe(200);
});

it("defaults to the existing reset page and does not disclose unknown emails", async () => {
  const known = await request("/request-password-reset", { email });
  expect(latest().searchParams.get("callbackURL")).toBe(origin + "/auth/reset-password");
  const count = mail.reset.length;
  const unknown = await request("/request-password-reset", { email: "unknown@example.invalid" });
  expect(await unknown.json()).toEqual(await known.json());
  expect(mail.reset).toHaveLength(count);
});

it("rejects untrusted redirects and invalid or expired tokens", async () => {
  const count = mail.reset.length;
  expect((await request("/request-password-reset", { email, redirectTo: "https://evil.example/reset" })).status).toBe(403);
  expect(mail.reset).toHaveLength(count);
  await request("/request-password-reset", { email });
  const link = latest();
  const token = link.pathname.split("/").at(-1)!;
  await db.update(verification).set({ expiresAt: new Date(0) }).where(eq(verification.identifier, `reset-password:${token}`));
  const callback = await request(link.toString());
  expect(new URL(callback.headers.get("location")!).searchParams.get("error")).toBe("INVALID_TOKEN");
  expect((await request("/reset-password", { token, newPassword: password })).status).toBe(400);
  expect((await request("/reset-password", { token: "invalid-token", newPassword: password })).status).toBe(400);
});

it("rate limits reset mail requests", async () => {
  for (let i = 0; i < 5; i++) expect((await request("/request-password-reset", { email: "absent@example.invalid" }, { "x-forwarded-for": "198.51.100.10" })).status).toBe(200);
  expect((await request("/request-password-reset", { email: "absent@example.invalid" }, { "x-forwarded-for": "198.51.100.10" })).status).toBe(429);
});

it("exposes password recovery in capabilities and searchable public API docs", async () => {
  const spec = buildClientOpenApi(await auth.api.generateOpenAPISchema());
  for (const path of ["/api/auth/request-password-reset", "/api/auth/reset-password"]) expect(spec.paths[path].post.security).toEqual([]);
  expect(clientCapabilities.auth.requestPasswordReset).toBe("/api/auth/request-password-reset");
  expect(searchClientDocs(spec, { q: "忘记密码", tag: "", method: "", page: 1, pageSize: 20 }).total).toBe(2);
});
