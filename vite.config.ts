import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import type { ServerResponse } from "node:http";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const respond = (res: ServerResponse, status: number, body: unknown) => {
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", "no-store");
    res.statusCode = status;
    res.end(JSON.stringify(body));
  };

  return {
    plugins: [
      react(),
      {
        name: "toast-api-dev",
        configureServer(server) {
          // The tiles are served by the And Done seed (D15). In dev, proxy the same
          // way production does -- api/_seed.mjs -- so local == prod.
          const VIEWS: Record<string, string> = { "toast-sales": "sales", "toast-labor": "labor", "toast-labor-detail": "labor-detail", "toast-sales-detail": "sales-detail", "toast-cogs-detail": "cogs-detail", "snapshot": "snapshot" };
          for (const [path, view] of Object.entries(VIEWS)) {
            server.middlewares.use(`/api/${path}`, async (req, res) => {
              try {
                const { fromSeed, passThrough } = await import("./api/_seed.mjs");
                respond(res, 200, await fromSeed(view, env, passThrough(req)));
              } catch (e) {
                respond(res, 500, { error: e instanceof Error ? e.message : String(e) });
              }
            });
          }
          server.middlewares.use("/api/seed", async (req, res) => {
            try {
              const url = new URL(req.url ?? "", "http://x");
              const base = env.SEED_API_BASE, key = env.SEED_API_KEY, org = env.SEED_ORG_SLUG ?? "gcdc";
              const qs = new URLSearchParams({ org, view: url.searchParams.get("view") ?? "" });
              for (const k of ["from", "to"]) { const v = url.searchParams.get(k); if (v) qs.set(k, v); }
              const r = await fetch(`${base}/api/owner?${qs}`, { headers: { Authorization: `Bearer ${key}` } });
              respond(res, r.status, await r.json());
            } catch (e) {
              respond(res, 500, { error: e instanceof Error ? e.message : String(e) });
            }
          });

          server.middlewares.use("/api/weather", async (_req, res) => {
            try {
              const { default: handler } = await import("./api/weather.mjs" as string);
              await handler(_req, res);
            } catch (e) {
              respond(res, 200, { condition: "clear", error: e instanceof Error ? e.message : String(e) });
            }
          });
        },
      },
    ],
  };
});
