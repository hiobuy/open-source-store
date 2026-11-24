import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenAPIV3_1 } from "openapi-types";
import { createDb, type Database } from "../db/client";
import { authSchema, session, user } from "../db/schema";
import { clientAuthPlugins, clientCors, clientCorsHeaders, clientOrigins, clientRequest, requireCustomerSession } from "./access";
import { buildClientOpenApi, searchClientDocs } from "./openapi";
import { clientEndpoints } from "./catalog";
import { clientRequestSchemas } from "./requests";
import { purchaseStripeInput } from "../purchase-stripe";
import { clientDocs } from "./docs";
import type { AppEnv } from "../index";
import { saveInvoiceProfile } from "../invoice-profiles";

function testAuth(db: Database) {
  return betterAuth({
    baseURL: "http://localhost:5173", secret: "isolated-client-api-test-secret-not-a-production-key",
    database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
    plugins: [...clientAuthPlugins(), twoFactor()],
    emailAndPassword: { enabled: true, requireEmailVerification: false }, // No mail delivery in isolated tests.
    user: { additionalFields: { memberCode: { type: "string", input: false }, status: { type: "string", input: false, defaultValue: "active" } } },
    databaseHooks: { user: { create: { before: async () => ({ data: { memberCode: `TEST-${crypto.randomUUID()}`, status: "active" } }) } } },
    rateLimit: { enabled: false },
  });
}
let mf: Miniflare, db: Database, auth: ReturnType<typeof testAuth>, customerId: string;
const email = "client-api-test@example.invalid", password = "test-password-only-123";
it("documents authenticated service applications, warehouse unavailability and optional consolidation services", () => {
  const { paths } = buildClientOpenApi();
  for (const path of ["/api/packages/{id}/service-requests", "/api/shipments/{id}/service-requests"]) {
    const operation = paths[path].post;
    expect(operation.security).toContainEqual({ bearerAuth: [] });
    expect(operation.requestBody).toMatchObject({ content: { "application/json": { schema: { required: ["services"] } } } });
    expect(operation.responses).toHaveProperty("503");
    expect(operation.responses).not.toHaveProperty("200");
  }
  const body = paths["/api/shipments"].post.requestBody as OpenAPIV3_1.RequestBodyObject;
  const schema = body.content["application/json"].schema as OpenAPIV3_1.SchemaObject;
  expect(schema.properties).toHaveProperty("services");
  expect(schema.required).not.toContain("services");
});

describe("client Stripe redirect parameters", () => {
  const purchase = { id: "d2ec66ac-179e-4394-b089-ec9399e42bfa", confirm: true, billVersion: 1, amountCents: 100 };
  const cases = [
    { schema: purchaseStripeInput, body: purchase },
    { schema: clientRequestSchemas["POST /api/checkout/:id/stripe"], body: {} },
    { schema: clientRequestSchemas["POST /api/wallet/top-up/stripe"], body: { amountFen: 100 } },
  ];
  it("accepts optional client URLs on all three payment requests and rejects unsafe or empty values", () => {
    for (const { schema, body } of cases) {
      expect(schema.safeParse(body).success).toBe(true);
      expect(schema.parse({ ...body, successUrl: "https://client.example/paid", cancelUrl: "http://localhost:5173/cancel" })).toMatchObject({ successUrl: "https://client.example/paid", cancelUrl: "http://localhost:5173/cancel" });
      for (const value of ["", null, "javascript:alert(1)", "/relative", "https://user:pass@example.com", "https://example.com/#paid", "http://remote.example/paid"]) {
        expect(schema.safeParse({ ...body, successUrl: value }).success).toBe(false);
        expect(schema.safeParse({ ...body, cancelUrl: value }).success).toBe(false);
      }
    }
  });
  it("documents both client URL parameters and an optional freight request body", () => {
    const spec = buildClientOpenApi() as unknown as OpenAPIV3_1.Document;
    for (const path of ["/api/purchase-orders/{id}/stripe", "/api/checkout/{id}/stripe", "/api/wallet/top-up/stripe"]) {
      const body = spec.paths![path]!.post!.requestBody as OpenAPIV3_1.RequestBodyObject;
      const schema = body.content["application/json"].schema as OpenAPIV3_1.SchemaObject;
      expect(schema.properties).toHaveProperty("successUrl");
      expect(schema.properties).toHaveProperty("cancelUrl");
      expect(schema.required ?? []).not.toContain("successUrl");
      expect(body.required).toBe(path !== "/api/checkout/{id}/stripe");
    }
  });
});
async function authRequest(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return auth.handler(clientRequest(new Request(`http://localhost:5173/api/auth${path}`, { method: body === undefined ? "GET" : "POST", headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })));
}
async function login() {
  const response = await authRequest("/sign-in/email", { email, password });
  expect(response.status).toBe(200);
  const token = response.headers.get("set-auth-token");
  expect(Boolean(token)).toBe(true);
  return { token: token!, cookie: response.headers.get("set-cookie")!.split(";")[0] };
}
const headersFor = (token: string, cookie?: string) => clientRequest(new Request("http://localhost:5173/api/me", { headers: { Authorization: `Bearer ${token}`, ...(cookie ? { Cookie: cookie } : {}) } })).headers;
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "client-api-test", modules: true, script: "export default { fetch() { return new Response('test'); } }", d1Databases: ["DB"] }] }));
  const binding = await mf.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) {
    const statements = readFileSync(`drizzle/${file}`, "utf8").split(";").map(s => s.replaceAll("--> statement-breakpoint", "").trim()).filter(Boolean);
    await binding.batch(statements.map(s => binding.prepare(s)));
  }
  db = createDb(binding as unknown as D1Database); auth = testAuth(db);
  const signup = await authRequest("/sign-up/email", { email, password, name: "Client API test" });
  expect(signup.status).toBe(200);
  customerId = (await db.select().from(user).where(eq(user.email, email)))[0].id;
}, 30000);
afterAll(async () => { await mf?.dispose(); });

describe("native customer authentication", () => {
  it("accepts signed bearer and existing cookies and rejects raw or forged tokens", async () => {
    const { token, cookie } = await login();
    expect((await requireCustomerSession(auth, headersFor(token))).user.id).toBe(customerId);
    expect((await requireCustomerSession(auth, new Headers({ Cookie: cookie }))).user.id).toBe(customerId);
    const raw = decodeURIComponent(token).split(".")[0];
    await expect(requireCustomerSession(auth, headersFor(raw))).rejects.toMatchObject({ status: 401 });
    await expect(requireCustomerSession(auth, headersFor("invalid.signature", cookie))).rejects.toMatchObject({ status: 401 });
    await expect(requireCustomerSession(auth, new Headers())).rejects.toMatchObject({ status: 401 });
  });
  it("honors sign-out, expiration and disabled accounts", async () => {
    const first = await login();
    expect((await authRequest("/sign-out", {}, { Authorization: `Bearer ${first.token}` })).status).toBe(200);
    await expect(requireCustomerSession(auth, headersFor(first.token))).rejects.toMatchObject({ status: 401 });
    const second = await login();
    await db.update(session).set({ expiresAt: new Date(0) }).where(eq(session.userId, customerId));
    await expect(requireCustomerSession(auth, headersFor(second.token))).rejects.toMatchObject({ status: 401 });
    const third = await login();
    await db.update(user).set({ status: "suspended" }).where(eq(user.id, customerId));
    try { await expect(requireCustomerSession(auth, headersFor(third.token))).rejects.toMatchObject({ status: 403 }); }
    finally { await db.update(user).set({ status: "active" }).where(eq(user.id, customerId)); }
  });
  it("keeps resource ownership checks for bearer callers", async () => {
    const { token } = await login();
    const identity = await requireCustomerSession(auth, headersFor(token));
    const profile = { label: "Test", kind: "individual" as const, name: "Test", taxId: "", email: "", address: "", countryRegion: "" };
    const saved = await saveInvoiceProfile(db, identity.user.id, profile);
    await expect(saveInvoiceProfile(db, "another-user", profile, saved.id)).rejects.toMatchObject({ status: 404 });
  });
  it("uses exact browser-origin allowlists without wildcard credentials", () => {
    const allowed = "https://mobile.example.com,http://localhost:5174,*,https://bad.example/path,https://user:password@bad.example";
    expect(clientOrigins(allowed)).toEqual(["https://mobile.example.com", "http://localhost:5174"]);
    const request = (origin: string) => new Request("https://api.example.com/api/me", { headers: { Origin: origin } });
    expect(clientCorsHeaders(request("https://mobile.example.com"), allowed)?.["Access-Control-Allow-Origin"]).toBe("https://mobile.example.com");
    expect(clientCorsHeaders(request("https://mobile.example.com.evil.test"), allowed)).toBe(null);
    expect(clientCorsHeaders(request("null"), allowed)).toBe(null);
  });
});

describe("OpenAPI client contract", () => {
  it("handles preflight and rejects cross-origin writes before business handlers", async () => {
    const app = new Hono<{ Bindings: { CLIENT_API_ORIGINS?: string } }>();
    app.use("*", clientCors);
    app.post("/api/test", c => c.json({ ok: true }));
    const env = { CLIENT_API_ORIGINS: "https://mobile.example.com" };
    const request = (method: string, origin?: string) => app.request("https://api.example.com/api/test", { method, headers: origin ? { Origin: origin } : {} }, env);
    expect((await request("OPTIONS", "https://evil.example")).status).toBe(403);
    expect((await request("POST", "https://evil.example")).status).toBe(403);
    const allowed = await request("OPTIONS", "https://mobile.example.com");
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://mobile.example.com");
    expect((await request("POST", "https://mobile.example.com")).headers.get("access-control-expose-headers")).toContain("set-auth-token");
    expect((await request("POST")).status).toBe(200);
    expect((await request("POST", "https://api.example.com")).status).toBe(200);
  });
  it("validates the merged business and actual authentication schemas", async () => {
    const spec = buildClientOpenApi(await auth.api.generateOpenAPISchema());
    await SwaggerParser.validate(structuredClone(spec) as unknown as OpenAPIV3_1.Document, { resolve: { external: false } });
    const ids = Object.values(spec.paths).flatMap(methods => Object.values(methods).map(op => op.operationId));
    expect(new Set(ids).size).toBe(ids.length);
    expect(spec.paths["/api/cart/manual-items"].get).toBeUndefined();
    expect(spec.paths["/api/cart/manual-items"].post).toBeDefined();
    expect(spec.paths["/api/auth/sign-in/email"].post.security).toEqual([]);
    expect(spec.paths["/api/wallet"].get.security).toEqual([{ bearerAuth: [] }, { sessionCookie: [] }]);
    expect(spec.paths["/api/auth/two-factor/verify-totp"]).toBeDefined();
    expect(Object.keys(spec.paths).some(p => /\/admin|\/dev|\/webhooks|\/stripe\/webhook|\/team/.test(p))).toBe(false);
  });
  it("covers every existing customer HTTP route and shares request validators", () => {
    const code = readFileSync("server/index.ts", "utf8");
    const actual = [...code.matchAll(/app\.(get|post|put|patch|delete)\("([^\"]+)"/g)].map(m => `${m[1].toUpperCase()} ${m[2]}`).filter(r => !/\/api\/(dev|team|webhooks|demo)|\/stripe\/webhook/.test(r));
    actual.push(...[...readFileSync("server/shopping-http.ts", "utf8").matchAll(/shoppingClient\.(get|post|put|patch|delete)\("([^"]+)"/g)].map(m => `${m[1].toUpperCase()} /api${m[2]}`));
    const documented = clientEndpoints.map(e => `${e.method} ${e.path}`);
    for (const route of actual) expect(documented, route).toContain(route);
    for (const route of documented.filter(r => !r.includes("/client/capabilities"))) expect(actual, route).toContain(route);
    expect(clientRequestSchemas["POST /api/packages/prealert"].safeParse({ items: [] }).success).toBe(false);
    expect(clientRequestSchemas["POST /api/wallet/top-up/stripe"].safeParse({ amountFen: 1.5 }).success).toBe(false);
    const spec = buildClientOpenApi();
    expect(spec.paths["/api/products/categories"].get.security).toEqual([]);
    expect(spec.paths["/api/products/search"].post.security).toEqual([]);
    for (const path of ["/api/products/detail", "/api/products/parse", "/api/products/search-by-image", "/api/purchase-orders"]) expect(spec.paths[path].post.security).not.toEqual([]);
    expect(spec.paths["/api/wallet/bank-transfers"].post.requestBody).toHaveProperty("content.multipart/form-data");
    expect(spec.paths["/api/documents/{id}/pdf"].get.responses["200"]).toHaveProperty("content.application/pdf");
  });
  it("documents the unified cart preview, 50 selections, checkout and recovery result", () => {
    const spec = buildClientOpenApi() as unknown as OpenAPIV3_1.Document;
    const preview = spec.paths!["/api/cart/preview"]!.post!;
    const body = preview.requestBody as OpenAPIV3_1.RequestBodyObject;
    const schema = body.content["application/json"].schema as OpenAPIV3_1.SchemaObject;
    expect(schema.properties!.items).toMatchObject({ minItems: 1, maxItems: 50 });
    const response = preview.responses!["200"] as OpenAPIV3_1.ResponseObject;
    const wrapper = response.content!["application/json"].schema as OpenAPIV3_1.SchemaObject;
    const data = wrapper.properties!.data as OpenAPIV3_1.SchemaObject;
    expect(data.properties).toHaveProperty("groups");
    expect(data.properties).toHaveProperty("referencePrice");
    expect(data.properties).toHaveProperty("orderCount");
    expect(spec.paths!["/api/cart/checkout"]!.post!.security).not.toEqual([]);
    expect(spec.paths!["/api/cart/checkouts/{id}"]!.get!.security).not.toEqual([]);
  });
  it("serves queryable documentation without customer data or login", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => { c.set("auth", auth as unknown as AppEnv["Variables"]["auth"]); c.set("requestId", "test"); await next(); });
    app.route("/api", clientDocs);
    const response = await app.request("http://localhost/api/docs/endpoints?q=wallet&method=GET&pageSize=2");
    expect(response.status).toBe(200);
    const body = await response.json() as { data: { items: { method: string }[]; total: number } };
    expect(body.data.items).toHaveLength(2); expect(body.data.total).toBeGreaterThan(2);
    expect(body.data.items.every(r => r.method === "GET")).toBe(true);
    expect((await app.request("http://localhost/api/docs")).headers.get("content-security-policy")).toContain("script-src 'self'");
    const spec = buildClientOpenApi();
    expect(searchClientDocs(spec, { q: "不存在的接口", tag: "", method: "", page: 1, pageSize: 20 }).total).toBe(0);
  });
});
