import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  handleFeedBootstrapApi,
  handleFeedRefreshApi,
} from "../api/_shared/handlers.js";
import {
  handleOptions,
  setCorsHeaders,
  toApiRequest,
  writeJson,
} from "../api/_shared/node.js";
import {
  CompositeFeedBootstrapStore,
  FeedBootstrapCacheService,
  FileFeedBootstrapStore,
  MemoryFeedBootstrapStore,
} from "../lib/feedBootstrapCache.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "..");

const host = process.env.FEED_SNAPSHOT_HOST ?? "0.0.0.0";
const port = Number(process.env.FEED_SNAPSHOT_PORT ?? process.env.PORT ?? "5192");
const refreshSeconds = Number(process.env.FEED_SNAPSHOT_REFRESH_SECONDS ?? "300");
const cacheFile = path.resolve(
  repoRoot,
  process.env.FEED_SNAPSHOT_CACHE_FILE ?? ".cache/feed-bootstrap.json",
);

const service = new FeedBootstrapCacheService({
  store: new CompositeFeedBootstrapStore([
    new MemoryFeedBootstrapStore(),
    new FileFeedBootstrapStore(cacheFile),
  ]),
  allowRefreshOnRead: () => true,
});

async function handleBootstrap(res: ServerResponse): Promise<void> {
  writeJson(res, await handleFeedBootstrapApi({ method: "GET" }, { service }));
}

async function handleRefresh(req: IncomingMessage, res: ServerResponse): Promise<void> {
  writeJson(res, await handleFeedRefreshApi(toApiRequest(req), { service }));
}

async function handleHealth(res: ServerResponse): Promise<void> {
  const snapshot = await service.read();

  writeJson(res, {
    status: snapshot ? 200 : 503,
    body: {
      ok: !!snapshot,
      fetchedAt: snapshot?.fetchedAt ?? null,
      postCount: snapshot?.processedEvents.length ?? 0,
      profileCount: snapshot ? Object.keys(snapshot.profiles).length : 0,
      refreshing: service.isRefreshing(),
      lastRefreshError: service.getLastRefreshError(),
    },
  });
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  setCorsHeaders(res);

  if (handleOptions(req, res)) {
    return;
  }

  if (req.method !== "GET") {
    writeJson(res, {
      status: 405,
      headers: {
        "Allow": "GET",
        "Content-Type": "application/json",
      },
      body: { error: "method not allowed" },
    });
    return;
  }

  void (async () => {
    if (url.pathname === "/api/feed/bootstrap") {
      await handleBootstrap(res);
      return;
    }

    if (url.pathname === "/api/cron/refresh-feed") {
      await handleRefresh(req, res);
      return;
    }

    if (url.pathname === "/healthz") {
      await handleHealth(res);
      return;
    }

    writeJson(res, {
      status: 404,
      headers: { "Content-Type": "application/json" },
      body: { error: "not found" },
    });
  })();
});

const loadedSnapshot = await service.read();

server.listen(port, host, () => {
  console.log(`feed snapshot server listening on http://${host}:${port}`);
  if (loadedSnapshot) {
    console.log(`loaded cached snapshot from ${cacheFile}`);
  }
});

void service.refresh().catch(() => {
  if (!loadedSnapshot) {
    console.error(service.getLastRefreshError() ?? "initial refresh failed");
  }
});

if (refreshSeconds > 0) {
  setInterval(() => {
    void service.refresh().catch(() => {
      console.error(service.getLastRefreshError() ?? "scheduled refresh failed");
    });
  }, refreshSeconds * 1000).unref();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
