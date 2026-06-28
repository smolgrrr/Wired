import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchFeedSnapshot,
  type FeedBootstrapSnapshot,
} from "../lib/feedSnapshot.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "..");

const host = process.env.FEED_SNAPSHOT_HOST ?? "0.0.0.0";
const port = Number(process.env.FEED_SNAPSHOT_PORT ?? process.env.PORT ?? "5192");
const refreshSeconds = Number(process.env.FEED_SNAPSHOT_REFRESH_SECONDS ?? "300");
const cacheFile = path.resolve(
  repoRoot,
  process.env.FEED_SNAPSHOT_CACHE_FILE ?? ".cache/feed-bootstrap.json",
);

let snapshot: FeedBootstrapSnapshot | null = null;
let lastRefreshError: string | null = null;
let refreshPromise: Promise<FeedBootstrapSnapshot> | null = null;

function writeJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

async function loadSnapshotFromDisk(): Promise<void> {
  try {
    const raw = await readFile(cacheFile, "utf8");
    const cached = JSON.parse(raw) as FeedBootstrapSnapshot;

    if (
      typeof cached.fetchedAt === "number" &&
      Array.isArray(cached.processedEvents) &&
      cached.profiles &&
      typeof cached.profiles === "object"
    ) {
      snapshot = cached;
    }
  } catch {
    // The cache is optional. The first refresh will populate it.
  }
}

async function persistSnapshot(nextSnapshot: FeedBootstrapSnapshot): Promise<void> {
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(nextSnapshot), "utf8");
}

async function refreshSnapshot(): Promise<FeedBootstrapSnapshot> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = fetchFeedSnapshot()
    .then(async (nextSnapshot) => {
      snapshot = nextSnapshot;
      lastRefreshError = null;
      await persistSnapshot(nextSnapshot);
      return nextSnapshot;
    })
    .catch((error: unknown) => {
      lastRefreshError = error instanceof Error ? error.message : "refresh failed";
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

function isAuthorized(req: IncomingMessage): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;

  return req.headers.authorization === `Bearer ${cronSecret}`;
}

async function handleBootstrap(res: ServerResponse): Promise<void> {
  setCorsHeaders(res);
  res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=300");

  if (snapshot) {
    writeJson(res, 200, snapshot);
    return;
  }

  try {
    writeJson(res, 200, await refreshSnapshot());
  } catch {
    writeJson(res, 503, {
      error: "bootstrap unavailable",
      lastRefreshError,
    });
  }
}

async function handleRefresh(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isAuthorized(req)) {
    writeJson(res, 401, { error: "unauthorized" });
    return;
  }

  try {
    const nextSnapshot = await refreshSnapshot();
    writeJson(res, 200, {
      ok: true,
      fetchedAt: nextSnapshot.fetchedAt,
      postCount: nextSnapshot.processedEvents.length,
      profileCount: Object.keys(nextSnapshot.profiles).length,
    });
  } catch {
    writeJson(res, 500, {
      error: lastRefreshError ?? "refresh failed",
    });
  }
}

function handleHealth(res: ServerResponse): void {
  writeJson(res, snapshot ? 200 : 503, {
    ok: !!snapshot,
    fetchedAt: snapshot?.fetchedAt ?? null,
    postCount: snapshot?.processedEvents.length ?? 0,
    profileCount: snapshot ? Object.keys(snapshot.profiles).length : 0,
    refreshing: !!refreshPromise,
    lastRefreshError,
  });
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    writeJson(res, 405, { error: "method not allowed" });
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
      handleHealth(res);
      return;
    }

    writeJson(res, 404, { error: "not found" });
  })();
});

await loadSnapshotFromDisk();

server.listen(port, host, () => {
  console.log(`feed snapshot server listening on http://${host}:${port}`);
  if (snapshot) {
    console.log(`loaded cached snapshot from ${cacheFile}`);
  }
});

void refreshSnapshot().catch(() => {
  if (!snapshot) {
    console.error(lastRefreshError ?? "initial refresh failed");
  }
});

if (refreshSeconds > 0) {
  setInterval(() => {
    void refreshSnapshot().catch(() => {
      console.error(lastRefreshError ?? "scheduled refresh failed");
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
