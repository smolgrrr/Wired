import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { handleOptions, setCorsHeaders, toApiRequest, writeJson } from "./api/_shared/node";

function unfurlDevApi(): Plugin {
  return {
    name: "unfurl-dev-api",
    configureServer(server) {
      server.middlewares.use(
        "/api/unfurl",
        async (req: IncomingMessage, res: ServerResponse) => {
          const { handleUnfurlApi } = await import("./api/_shared/handlers");
          writeJson(res, await handleUnfurlApi(toApiRequest(req)));
        },
      );

      server.middlewares.use(
        "/api/feed/bootstrap",
        async (req: IncomingMessage, res: ServerResponse) => {
          setCorsHeaders(res);
          if (handleOptions(req, res)) {
            return;
          }

          const { handleFeedBootstrapApi } = await import("./api/_shared/handlers");
          writeJson(res, await handleFeedBootstrapApi(toApiRequest(req)));
        },
      );

      server.middlewares.use(
        "/api/cron/refresh-feed",
        async (req: IncomingMessage, res: ServerResponse) => {
          const { handleFeedRefreshApi } = await import("./api/_shared/handlers");
          writeJson(res, await handleFeedRefreshApi(toApiRequest(req)));
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
