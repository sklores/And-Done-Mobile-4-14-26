import { defineConfig, loadEnv } from "vite";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
          // Dev runs the SAME handler modules Vercel runs (api/*.mjs), with the
          // .env.local values passed in -- so local == prod, auth included.
          const HANDLERS = ["snapshot", "seed", "toast-sales", "toast-labor", "toast-labor-detail", "toast-sales-detail", "toast-cogs-detail", "weather", "login", "session", "logout"];
          for (const name of HANDLERS) {
            server.middlewares.use(`/api/${name}`, async (req, res) => {
              try {
                const { default: handler } = await import(pathToFileURL(path.resolve(process.cwd(), "api", `${name}.mjs`)).href);
                await handler(req, res, { ...process.env, ...env });
              } catch (e) {
                respond(res, 500, { error: e instanceof Error ? e.message : String(e) });
              }
            });
          }
        },
      },
    ],
  };
});
