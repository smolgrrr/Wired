import { describe, expect, it, vi } from "vitest";
import {
  handleFeedBootstrapApi,
  handleFeedRefreshApi,
  handleUnfurlApi,
} from "./handlers";
import {
  FeedBootstrapCacheService,
  MemoryFeedBootstrapStore,
} from "../../lib/feedBootstrapCache";
import type { FeedBootstrapSnapshot } from "../../lib/feedSnapshot";

const postEvent = {
  id: "note-1",
  pubkey: "pubkey",
  created_at: 123,
  kind: 1,
  tags: [],
  content: "hello",
  sig: "sig",
};

const snapshot: FeedBootstrapSnapshot = {
  fetchedAt: 123,
  processedEvents: [{ postEvent, replies: [], totalWork: 1 }],
  profiles: { pubkey: { name: "Ada" } },
};

describe("shared API handlers", () => {
  it("rejects unsupported methods consistently", async () => {
    await expect(handleUnfurlApi({ method: "POST" })).resolves.toMatchObject({
      status: 405,
      headers: { Allow: "GET" },
      body: { error: "method not allowed" },
    });
  });

  it("serves bootstrap snapshots through the cache service", async () => {
    const service = new FeedBootstrapCacheService({
      store: new MemoryFeedBootstrapStore(snapshot),
    });

    await expect(handleFeedBootstrapApi({ method: "GET" }, { service })).resolves.toMatchObject({
      status: 200,
      body: snapshot,
    });
  });

  it("returns a refresh summary from the shared cache service", async () => {
    const service = new FeedBootstrapCacheService({
      store: new MemoryFeedBootstrapStore(),
      fetchSnapshot: vi.fn().mockResolvedValue(snapshot),
    });

    await expect(handleFeedRefreshApi({ method: "GET" }, { service })).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        fetchedAt: 123,
        postCount: 1,
        profileCount: 1,
      },
    });
  });
});
