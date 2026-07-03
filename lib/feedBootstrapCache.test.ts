import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  fetchFeedSnapshot: vi.fn(),
}));

vi.mock("@vercel/functions", () => ({
  getCache: () => ({
    get: mocks.cacheGet,
    set: mocks.cacheSet,
  }),
}));

vi.mock("./feedSnapshot.js", () => ({
  fetchFeedSnapshot: mocks.fetchFeedSnapshot,
}));

const snapshot = {
  fetchedAt: 123,
  processedEvents: [],
  events: [],
  relayHintsByEventId: {},
  profiles: {},
};

async function loadCacheModule() {
  vi.resetModules();
  return import("./feedBootstrapCache");
}

describe("getFeedBootstrapSnapshot", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mocks.cacheGet.mockReset();
    mocks.cacheSet.mockReset();
    mocks.fetchFeedSnapshot.mockReset();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("does not refresh on cache miss in production", async () => {
    process.env.NODE_ENV = "production";
    mocks.cacheGet.mockResolvedValue(null);
    mocks.fetchFeedSnapshot.mockResolvedValue(snapshot);

    const { getFeedBootstrapSnapshot } = await loadCacheModule();

    await expect(getFeedBootstrapSnapshot()).resolves.toBeNull();
    expect(mocks.fetchFeedSnapshot).not.toHaveBeenCalled();
    expect(mocks.cacheSet).not.toHaveBeenCalled();
  });

  it("refreshes on cache miss outside production", async () => {
    process.env.NODE_ENV = "test";
    mocks.cacheGet.mockResolvedValue(null);
    mocks.fetchFeedSnapshot.mockResolvedValue(snapshot);

    const { getFeedBootstrapSnapshot } = await loadCacheModule();

    await expect(getFeedBootstrapSnapshot()).resolves.toEqual(snapshot);
    expect(mocks.fetchFeedSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.cacheSet).toHaveBeenCalledTimes(1);
  });

  it("returns a cached production snapshot without refreshing", async () => {
    process.env.NODE_ENV = "production";
    mocks.cacheGet.mockResolvedValue(snapshot);

    const { getFeedBootstrapSnapshot } = await loadCacheModule();

    await expect(getFeedBootstrapSnapshot()).resolves.toEqual(snapshot);
    expect(mocks.fetchFeedSnapshot).not.toHaveBeenCalled();
  });

  it("de-dupes concurrent refreshes through the cache service", async () => {
    const { FeedBootstrapCacheService, MemoryFeedBootstrapStore } = await loadCacheModule();
    const fetchSnapshot = vi.fn().mockResolvedValue(snapshot);
    const service = new FeedBootstrapCacheService({
      store: new MemoryFeedBootstrapStore(),
      fetchSnapshot,
    });

    await expect(Promise.all([service.refresh(), service.refresh()])).resolves.toEqual([
      snapshot,
      snapshot,
    ]);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    await expect(service.read()).resolves.toEqual(snapshot);
  });
});
