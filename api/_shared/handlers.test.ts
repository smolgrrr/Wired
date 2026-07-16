import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleFeedBootstrapApi,
  handleFeedRefreshApi,
  handleUnfurlApi,
  handleWorkflowStatusIngestApi,
  handleWorkflowStatusPurgeApi,
} from "./handlers";
import {
  FeedBootstrapCacheService,
  MemoryFeedBootstrapStore,
} from "../../lib/feedBootstrapCache";
import type { FeedBootstrapSnapshot } from "../../lib/feedSnapshot";
import { RelayWorkflowStatusIngestService } from "../../lib/relayWorkflowStatusIngest";
import { MemoryRelayWorkflowStatusStore } from "../../lib/relayWorkflowStatusStore";
import { RelayWorkflowCollector } from "../../src/nostr/evidence/relay-workflow-collector";
import { validRelayWorkflowEvidence } from "../../src/contracts/relay-workflow-evidence.test-fixtures";

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
  processedEvents: [{
    postEventId: postEvent.id,
    replyIds: [],
    threadReplyCount: 0,
    rootWork: 1,
    replyWork: 0,
    totalWork: 1,
    rankingReplyCount: 0,
  }],
  eventsById: { [postEvent.id]: postEvent },
  relayHintsByEventId: {},
  profiles: { pubkey: { name: "Ada" } },
  scoring: {
    ageHours: 24,
    minPow: 16,
    replyDepth: 2,
    sort: "totalWork",
  },
};

describe("shared API handlers", () => {
  const originalCronSecret = process.env.CRON_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAdminToken = process.env.WORKFLOW_STATUS_ADMIN_TOKEN;
  const originalAllowedOrigin = process.env.WORKFLOW_STATUS_ALLOWED_ORIGIN;

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

    if (originalAdminToken === undefined) {
      delete process.env.WORKFLOW_STATUS_ADMIN_TOKEN;
    } else {
      process.env.WORKFLOW_STATUS_ADMIN_TOKEN = originalAdminToken;
    }

    if (originalAllowedOrigin === undefined) {
      delete process.env.WORKFLOW_STATUS_ALLOWED_ORIGIN;
    } else {
      process.env.WORKFLOW_STATUS_ALLOWED_ORIGIN = originalAllowedOrigin;
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

  it("explains bootstrap cache misses when refresh-on-read is disabled", async () => {
    const service = new FeedBootstrapCacheService({
      store: new MemoryFeedBootstrapStore(),
      allowRefreshOnRead: () => false,
    });

    await expect(handleFeedBootstrapApi({ method: "GET" }, { service })).resolves.toMatchObject({
      status: 503,
      body: {
        error: "bootstrap unavailable",
        cache: {
          hit: false,
          refreshOnRead: false,
          refreshing: false,
        },
        lastRefreshError: null,
      },
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

  it("accepts only same-origin browser workflow status", async () => {
    const now = Date.parse("2026-07-16T10:00:00.000Z");
    const store = new MemoryRelayWorkflowStatusStore(() => now);
    const service = new RelayWorkflowStatusIngestService(store, { now: () => now });
    const collector = new RelayWorkflowCollector();
    collector.record(validRelayWorkflowEvidence.query);
    const body = {
      schemaVersion: 1,
      source: "wired-browser",
      collectedAt: now,
      aggregates: collector.snapshot(),
      correlations: [],
    };
    process.env.NODE_ENV = "production";
    process.env.WORKFLOW_STATUS_ALLOWED_ORIGIN = "https://wired.test";

    await expect(handleWorkflowStatusIngestApi({
      method: "POST",
      headers: {
        host: "wired.test",
        origin: "https://wired.test",
        "x-forwarded-proto": "https",
      },
      body,
    }, { service })).resolves.toMatchObject({ status: 202, body: { ok: true } });
    await expect(handleWorkflowStatusIngestApi({
      method: "POST",
      headers: {
        host: "wired.test",
        origin: "https://attacker.test",
        "x-forwarded-proto": "https",
      },
      body,
    }, { service })).resolves.toMatchObject({ status: 401 });
    expect(store.rows).toHaveLength(1);
  });

  it("reserves wired-admin ingest for the configured operator token", async () => {
    const now = Date.parse("2026-07-16T10:00:00.000Z");
    const store = new MemoryRelayWorkflowStatusStore(() => now);
    const service = new RelayWorkflowStatusIngestService(store, { now: () => now });
    const collector = new RelayWorkflowCollector();
    collector.record({
      ...validRelayWorkflowEvidence.query,
      workflowOwner: "wired-admin.server.feed-snapshot",
    });
    const body = {
      schemaVersion: 1,
      source: "wired-admin",
      collectedAt: now,
      aggregates: collector.snapshot(),
      correlations: [],
    };
    process.env.WORKFLOW_STATUS_ADMIN_TOKEN = "operator-secret";

    await expect(handleWorkflowStatusIngestApi({
      method: "POST",
      headers: { authorization: "Bearer wrong" },
      body,
    }, { service })).resolves.toMatchObject({ status: 401 });
    await expect(handleWorkflowStatusIngestApi({
      method: "POST",
      headers: { authorization: "Bearer operator-secret" },
      body,
    }, { service })).resolves.toMatchObject({ status: 202 });
  });

  it("maps ingest limits, outages, and authorized retention purge", async () => {
    const now = Date.parse("2026-07-16T10:00:00.000Z");
    const store = new MemoryRelayWorkflowStatusStore(() => now);
    const service = new RelayWorkflowStatusIngestService(store, {
      now: () => now,
      limits: { requestsPerSourcePerMinute: 0 },
    });
    const collector = new RelayWorkflowCollector();
    collector.record(validRelayWorkflowEvidence.query);
    const request = {
      method: "POST",
      headers: {
        host: "wired.test",
        origin: "https://wired.test",
        "x-forwarded-proto": "https",
      },
      body: {
        schemaVersion: 1,
        source: "wired-browser",
        collectedAt: now,
        aggregates: collector.snapshot(),
        correlations: [],
      },
    };
    await expect(handleWorkflowStatusIngestApi(request, { service })).resolves.toMatchObject({
      status: 429,
      headers: { "Retry-After": "60" },
    });

    process.env.NODE_ENV = "production";
    process.env.CRON_SECRET = "cron-secret";
    await expect(handleWorkflowStatusPurgeApi({
      method: "GET",
      headers: { authorization: "Bearer wrong" },
    }, { service })).resolves.toMatchObject({ status: 401 });
    await expect(handleWorkflowStatusPurgeApi({
      method: "GET",
      headers: { authorization: "Bearer cron-secret" },
    }, { service })).resolves.toMatchObject({ status: 200 });

    const outage = new RelayWorkflowStatusIngestService({
      async reserve() { throw new Error("store unavailable"); },
      async append() {},
      async purgeBefore() { return 0; },
    }, { now: () => now });
    process.env.WORKFLOW_STATUS_ALLOWED_ORIGIN = "https://wired.test";
    await expect(handleWorkflowStatusIngestApi(request, { service: outage }))
      .resolves.toMatchObject({ status: 503 });
  });
});
