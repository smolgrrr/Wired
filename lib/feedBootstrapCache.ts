import { getCache } from "@vercel/functions";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BOOTSTRAP_CACHE_KEY,
  BOOTSTRAP_CACHE_TAG,
  BOOTSTRAP_CACHE_TTL_SECONDS,
} from "./feedBootstrap.js";
import { fetchFeedSnapshot, type FeedBootstrapSnapshot } from "./feedSnapshot.js";
import { isFeedBootstrapSnapshot } from "../src/shared/lib/feedBootstrapTypes.js";

export type FeedBootstrapStore = {
  read(): Promise<FeedBootstrapSnapshot | null>;
  write(snapshot: FeedBootstrapSnapshot): Promise<void>;
};

export class MemoryFeedBootstrapStore implements FeedBootstrapStore {
  private snapshot: FeedBootstrapSnapshot | null;

  constructor(snapshot: FeedBootstrapSnapshot | null = null) {
    this.snapshot = snapshot;
  }

  async read(): Promise<FeedBootstrapSnapshot | null> {
    return this.snapshot;
  }

  async write(snapshot: FeedBootstrapSnapshot): Promise<void> {
    this.snapshot = snapshot;
  }
}

export class VercelFeedBootstrapStore implements FeedBootstrapStore {
  async read(): Promise<FeedBootstrapSnapshot | null> {
    try {
      const cached = await getCache().get(BOOTSTRAP_CACHE_KEY);
      return isFeedBootstrapSnapshot(cached) ? cached : null;
    } catch {
      // Runtime cache is unavailable outside Vercel.
      return null;
    }
  }

  async write(snapshot: FeedBootstrapSnapshot): Promise<void> {
    try {
      await getCache().set(BOOTSTRAP_CACHE_KEY, snapshot, {
        ttl: BOOTSTRAP_CACHE_TTL_SECONDS,
        tags: [BOOTSTRAP_CACHE_TAG],
        name: "feed-bootstrap",
      });
    } catch {
      // Runtime cache is unavailable outside Vercel.
    }
  }
}

export class FileFeedBootstrapStore implements FeedBootstrapStore {
  constructor(private readonly cacheFile: string) {}

  async read(): Promise<FeedBootstrapSnapshot | null> {
    try {
      const cached = JSON.parse(await readFile(this.cacheFile, "utf8")) as unknown;
      return isFeedBootstrapSnapshot(cached) ? cached : null;
    } catch {
      return null;
    }
  }

  async write(snapshot: FeedBootstrapSnapshot): Promise<void> {
    await mkdir(path.dirname(this.cacheFile), { recursive: true });
    await writeFile(this.cacheFile, JSON.stringify(snapshot), "utf8");
  }
}

export class CompositeFeedBootstrapStore implements FeedBootstrapStore {
  constructor(private readonly stores: readonly FeedBootstrapStore[]) {}

  async read(): Promise<FeedBootstrapSnapshot | null> {
    for (const [index, store] of this.stores.entries()) {
      const snapshot = await store.read();
      if (snapshot) {
        await Promise.all(
          this.stores.slice(0, index).map((previousStore) => previousStore.write(snapshot)),
        );
        return snapshot;
      }
    }

    return null;
  }

  async write(snapshot: FeedBootstrapSnapshot): Promise<void> {
    await Promise.all(this.stores.map((store) => store.write(snapshot)));
  }
}

export type FeedBootstrapCacheServiceOptions = {
  store: FeedBootstrapStore;
  fetchSnapshot?: () => Promise<FeedBootstrapSnapshot>;
  allowRefreshOnRead?: () => boolean;
};

export class FeedBootstrapCacheService {
  private refreshPromise: Promise<FeedBootstrapSnapshot> | null = null;
  private lastRefreshError: string | null = null;

  private readonly store: FeedBootstrapStore;
  private readonly fetchSnapshot: () => Promise<FeedBootstrapSnapshot>;
  private readonly allowRefreshOnRead: () => boolean;

  constructor({
    store,
    fetchSnapshot: fetchSnapshotOption = fetchFeedSnapshot,
    allowRefreshOnRead = () => process.env.NODE_ENV !== "production",
  }: FeedBootstrapCacheServiceOptions) {
    this.store = store;
    this.fetchSnapshot = fetchSnapshotOption;
    this.allowRefreshOnRead = allowRefreshOnRead;
  }

  isRefreshing(): boolean {
    return !!this.refreshPromise;
  }

  getLastRefreshError(): string | null {
    return this.lastRefreshError;
  }

  read(): Promise<FeedBootstrapSnapshot | null> {
    return this.store.read();
  }

  write(snapshot: FeedBootstrapSnapshot): Promise<void> {
    return this.store.write(snapshot);
  }

  refresh(): Promise<FeedBootstrapSnapshot> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.fetchSnapshot()
      .then(async (snapshot) => {
        await this.write(snapshot);
        this.lastRefreshError = null;
        return snapshot;
      })
      .catch((error: unknown) => {
        this.lastRefreshError = error instanceof Error ? error.message : "refresh failed";
        throw error;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }

  async get(): Promise<FeedBootstrapSnapshot | null> {
    const cached = await this.read();
    if (cached) {
      return cached;
    }

    if (!this.allowRefreshOnRead()) {
      return null;
    }

    try {
      return await this.refresh();
    } catch {
      return null;
    }
  }
}

const defaultFeedBootstrapService = new FeedBootstrapCacheService({
  store: new CompositeFeedBootstrapStore([
    new MemoryFeedBootstrapStore(),
    new VercelFeedBootstrapStore(),
  ]),
});

export function getDefaultFeedBootstrapService(): FeedBootstrapCacheService {
  return defaultFeedBootstrapService;
}

export async function readFeedBootstrapSnapshot(): Promise<FeedBootstrapSnapshot | null> {
  return defaultFeedBootstrapService.read();
}

export async function writeFeedBootstrapSnapshot(
  snapshot: FeedBootstrapSnapshot,
): Promise<void> {
  return defaultFeedBootstrapService.write(snapshot);
}

export async function refreshFeedBootstrapSnapshot(): Promise<FeedBootstrapSnapshot> {
  return defaultFeedBootstrapService.refresh();
}

export async function getFeedBootstrapSnapshot(): Promise<FeedBootstrapSnapshot | null> {
  return defaultFeedBootstrapService.get();
}
