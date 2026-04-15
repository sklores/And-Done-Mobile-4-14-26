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
          server.middlewares.use("/api/toast-sales", async (_req, res) => {
            try {
              const { credsFromEnv, getTodaySales } = await import(
                "./api/_toast.mjs"
              );
              respond(res, 200, await getTodaySales(credsFromEnv(env)));
            } catch (e) {
              respond(res, 500, {
                error: e instanceof Error ? e.message : String(e),
              });
            }
          });

          server.middlewares.use("/api/toast-labor", async (_req, res) => {
            try {
              const { credsFromEnv, getTodayLabor } = await import(
                "./api/_toast.mjs"
              );
              respond(res, 200, await getTodayLabor(credsFromEnv(env)));
            } catch (e) {
              respond(res, 500, {
                error: e instanceof Error ? e.message : String(e),
              });
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
