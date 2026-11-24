import http from "node:http";
import { defineConfig, type Plugin } from "vite";
import svgr from "vite-plugin-svgr";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

// The API worker (`npm run dev:api`) owns /api/* and /agents/* in development,
// mirroring the production Routes.
const API_HOST = "127.0.0.1";
const API_PORT = 8787;
const apiPath = /^\/(?:api\/|agents(?:\/|\?|$))/;

/**
 * Dev-only reverse proxy to the API worker. Vite's `server.proxy` runs after the
 * Cloudflare/vinext request handling here, so this registers as a pre middleware
 * instead. The browser's Host header is kept so Better Auth sees the dev origin.
 */
function apiDevProxy(): Plugin {
  return {
    name: "api-dev-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !apiPath.test(req.url)) return next();
        const upstream = http.request(
          { host: API_HOST, port: API_PORT, method: req.method, path: req.url, headers: req.headers },
          (response) => {
            res.writeHead(response.statusCode ?? 502, response.headers);
            response.pipe(res);
          },
        );
        upstream.on("error", (error) => {
          if (res.headersSent) return res.destroy();
          res.writeHead(502, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { code: "API_UNAVAILABLE", message: `API worker not reachable on ${API_HOST}:${API_PORT}: ${error.message}` } }));
        });
        req.pipe(upstream);
      });
      // WebSocket upgrades (e.g. /agents) are not proxied in dev.
    },
  };
}

export default defineConfig({
  plugins: [
    apiDevProxy(),
    svgr({
      include: "**/*.svg",
      svgrOptions: { exportType: "default" },
    }),
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
