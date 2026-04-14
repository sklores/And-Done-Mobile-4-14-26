import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      react(),
      {
        name: "toast-api-dev",
        configureServer(server) {
          server.middlewares.use(
            "/api/toast-sales",
            async (_req, res) => {
              res.setHeader("content-type", "application/json");
              res.setHeader("cache-control", "no-store");
              try {
                const { credsFromEnv, getTodaySales } = await import(
                  "./api/_toast"
                );
                const creds = credsFromEnv(env);
                const data = await getTodaySales(creds);
                res.statusCode = 200;
                res.end(JSON.stringify(data));
              } catch (e) {
                res.statusCode = 500;
                res.end(
                  JSON.stringify({
                    error: e instanceof Error ? e.message : String(e),
                  }),
                );
              }
            },
          );
        },
      },
    ],
  };
});
