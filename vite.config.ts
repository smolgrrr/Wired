import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { normalizeUrl } from "./lib/link";
import { unfurlUrl } from "./api/lib/unfurl";

function unfurlDevApi(): Plugin {
  return {
    name: "unfurl-dev-api",
    configureServer(server) {
      server.middlewares.use(
        "/api/unfurl",
        async (req: IncomingMessage, res: ServerResponse, next) => {
          if (req.method !== "GET") {
            res.statusCode = 405;
            res.setHeader("Allow", "GET");
            res.end(JSON.stringify({ error: "method not allowed" }));
            return;
          }

          const requestUrl = new URL(req.url ?? "", "http://localhost");
          const target = normalizeUrl(requestUrl.searchParams.get("url") ?? "");

          if (!target) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "invalid url" }));
            return;
          }

          const metadata = await unfurlUrl(target);
          res.setHeader("Content-Type", "application/json");

          if (!metadata) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: "fetch failed" }));
            return;
          }

          res.statusCode = 200;
          res.setHeader("Cache-Control", "public, max-age=3600");
          res.end(JSON.stringify(metadata));
        },
      );

    },
  };
}

export default defineConfig({
  plugins: [react(), unfurlDevApi()],
  resolve: {
    alias: {
      "@link": path.resolve(__dirname, "lib"),
      "@lib": path.resolve(__dirname, "src/shared/lib"),
    },
  },
  build: {
    outDir: "dist",
  },
});