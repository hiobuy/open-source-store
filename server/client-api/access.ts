import { bearer, openAPI } from "better-auth/plugins";
import { AppError, newRequestId } from "../errors";
import type { MiddlewareHandler } from "hono";

/** Same session store and revocation rules as the browser. Not a second credential system. */
export const clientAuthPlugins = () => [bearer({ requireSignature: true }), openAPI({ disableDefaultReference: true })];

export async function requireCustomerSession<T extends { user: { id: string; memberCode?: string | null; status?: string | null } }>(auth: { api: { getSession: (input: { headers: Headers }) => Promise<T | null> } }, headers: Headers): Promise<T> {
  const session = await auth.api.getSession({ headers });
  if (!session?.user.memberCode) throw new AppError("UNAUTHENTICATED", "Please sign in.", 401);
  if (session.user.status !== "active") throw new AppError("FORBIDDEN", "This account is not active.", 403);
  return session;
}

export function clientOrigins(value: string | undefined): string[] {
  return [...new Set((value ?? "").split(",").flatMap(entry => {
    try {
      const url = new URL(entry.trim());
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      return (url.protocol === "https:" || (local && url.protocol === "http:")) && !url.hostname.includes("*") && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash ? [url.origin] : [];
    } catch { return []; }
  }))];
}

/** Explicit Authorization takes precedence; an invalid token must not fall back to cookies. */
export function clientRequest(request: Request) {
  if (!request.headers.has("authorization")) return request;
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  return new Request(request, { headers });
}

export function clientCorsHeaders(request: Request, allowed: string | undefined) {
  const origin = request.headers.get("origin");
  if (!origin || !clientOrigins(allowed).includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key, X-Turnstile-Token",
    "Access-Control-Expose-Headers": "set-auth-token, x-request-id, Content-Disposition, ETag",
    "Access-Control-Max-Age": "600",
  };
}

export const clientCors: MiddlewareHandler<{ Bindings: { CLIENT_API_ORIGINS?: string } }> = async (c, next) => {
  const cors = clientCorsHeaders(c.req.raw, c.env.CLIENT_API_ORIGINS);
  const origin = c.req.header("origin");
  const sameOrigin = !origin || origin === new URL(c.req.url).origin;
  c.header("Vary", "Origin");
  if (cors) for (const [key, value] of Object.entries(cors)) c.header(key, value);
  if (c.req.method === "OPTIONS") return c.body(null, sameOrigin || cors ? 204 : 403);
  if (!sameOrigin && !cors && !["GET", "HEAD"].includes(c.req.method)) return c.json({ error: { code: "FORBIDDEN_ORIGIN", message: "This origin is not allowed." }, requestId: newRequestId() }, 403);
  await next();
};
