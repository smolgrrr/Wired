import { afterEach, describe, expect, it, vi } from "vitest";
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
  events: [postEvent],
  relayHintsByEventId: {},
  profiles: { pubkey: { name: "Ada" } },
};

describe("shared API handlers", () => {
  const originalCronSecret = process.env.CRON_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

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
    delete process.env.CRON_SECRET;
    process.env.NODE_ENV = "test";
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

  it("accepts cron authorization headers case-insensitively", async () => {
    process.env.NODE_ENV = "production";
    process.env.CRON_SECRET = "secret";
    const service = new FeedBootstrapCacheService({
      store: new MemoryFeedBootstrapStore(),
      fetchSnapshot: vi.fn().mockResolvedValue(snapshot),
    });

    await expect(
      handleFeedRefreshApi(
        {
          method: "GET",
          headers: { Authorization: "Bearer secret" },
        },
        { service },
      ),
    ).resolves.toMatchObject({ status: 200 });
  });

  it("rejects cron refreshes without the configured production secret", async () => {
    process.env.NODE_ENV = "production";
    process.env.CRON_SECRET = "secret";
    const service = new FeedBootstrapCacheService({
      store: new MemoryFeedBootstrapStore(),
      fetchSnapshot: vi.fn().mockResolvedValue(snapshot),
    });

    await expect(
      handleFeedRefreshApi(
        {
          method: "GET",
          headers: { authorization: "Bearer wrong" },
        },
        { service },
      ),
    ).resolves.toMatchObject({ status: 401 });
  });

  it("can schedule cron refreshes in the background", async () => {
    process.env.NODE_ENV = "production";
    process.env.CRON_SECRET = "secret";
    const waitUntil = vi.fn();
    const service = new FeedBootstrapCacheService({
      store: new MemoryFeedBootstrapStore(),
      fetchSnapshot: vi.fn().mockResolvedValue(snapshot),
    });

    await expect(
      handleFeedRefreshApi(
        {
          method: "GET",
          headers: { authorization: "Bearer secret" },
        },
        { service, waitUntil },
      ),
    ).resolves.toMatchObject({
      status: 202,
      body: { ok: true, refresh: "started" },
    });

    expect(waitUntil).toHaveBeenCalledTimes(1);
    await expect(waitUntil.mock.calls[0][0]).resolves.toEqual(snapshot);
    await expect(service.read()).resolves.toEqual(snapshot);
  });
});
