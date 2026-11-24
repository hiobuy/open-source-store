import "server-only";

import { env } from "cloudflare:workers";
import { headers } from "next/headers";

const betterAuthCookieName =
  /^(?:__Secure-|__Host-)?better-auth(?:\.[A-Za-z0-9_-]+)+$/;
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Keep only Better Auth cookies; other site cookies must not reach the API. */
export function betterAuthCookies(header: string | null): string {
  if (!header) return "";
  return header
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => {
      const separator = cookie.indexOf("=");
      return (
        separator > 0 &&
        betterAuthCookieName.test(cookie.slice(0, separator).trim())
      );
    })
    .join("; ");
}

/**
 * Dev / fallback origin of the API Worker (`API_INTERNAL_ORIGIN`). Plain HTTP
 * is accepted for local hosts only.
 */
function internalOrigin(): URL | null {
  const configured = process.env.API_INTERNAL_ORIGIN;
  if (!configured) return null;
  let origin: URL;
  try {
    origin = new URL(configured);
  } catch {
    throw new Error("API_INTERNAL_ORIGIN is not a valid URL");
  }
  const local = localHosts.has(origin.hostname);
  if (
    (origin.protocol !== "https:" && !(local && origin.protocol === "http:")) ||
    origin.username ||
    origin.password
  ) {
    throw new Error(
      "API_INTERNAL_ORIGIN must be HTTPS (HTTP only for localhost)",
    );
  }
  return new URL(origin.origin);
}

async function requestOrigin(): Promise<string> {
  const incoming = await headers();
  const host = incoming.get("host");
  if (!host) throw new Error("Request host is unavailable");
  const hostname = new URL(`http://${host}`).hostname;
  const protocol = localHosts.has(hostname) ? "http" : "https";
  return `${protocol}://${host}`;
}

/**
 * Server-side call to the same-origin API (`/api/<path>`).
 *
 * `API_INTERNAL_ORIGIN` wins when set (local development). Otherwise the `API`
 * service binding reaches the API Worker directly, using the incoming request's
 * origin so Better Auth sees the public host and cookie names match.
 */
export async function fetchApi(
  path: string,
  init: RequestInit & { cookie?: string } = {},
): Promise<Response> {
  const { cookie, ...rest } = init;
  const requestHeaders = new Headers(rest.headers);
  if (cookie) requestHeaders.set("cookie", cookie);
  const options = { ...rest, headers: requestHeaders };

  const internal = internalOrigin();
  if (internal) {
    return fetch(new URL(`/api/${path}`, internal), options);
  }
  const binding = (env as { API?: { fetch: typeof fetch } }).API;
  if (!binding) throw new Error("API service binding is not configured");
  return binding.fetch(
    new Request(new URL(`/api/${path}`, await requestOrigin()), options),
  );
}
