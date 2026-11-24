import { bindings, defineConfig, defineWorker } from "cf/config";
import { loadEnv } from "vite";

const env = {
  ...loadEnv(process.env.NODE_ENV || "development", process.cwd(), ""),
  ...process.env,
};
// Local development only: reach the API Worker over HTTP. Production builds
// use the `API` service binding instead, so a stray .env value is never baked
// into a deployment.
const apiInternalOrigin =
  process.env.NODE_ENV === "production" ? "" : env.API_INTERNAL_ORIGIN;
const webWorkerName = env.WEB_WORKER_NAME?.trim() || "hiobuy-procurement-website";
const apiWorkerName = env.API_WORKER_NAME?.trim() || "hiobuy-procurement";

export default defineConfig({
  worker: defineWorker({
    name: webWorkerName,
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-04",
    compatibilityFlags: ["nodejs_compat"],
    // Not served from workers.dev: the storefront calls same-origin /api/*, so it cannot work there.
    // The custom-domain route (<host>/*) is managed in the Cloudflare dashboard; the API Worker's
    // more specific /api/* and /agents/* routes win.
    workersDev: false,
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      // The API Worker (wrangler.jsonc env.production name). Deploy it first.
      API: bindings.worker({ worker: apiWorkerName }),
      ...(apiInternalOrigin
        ? { API_INTERNAL_ORIGIN: bindings.text(apiInternalOrigin) }
        : {}),
    },
  }),
});
