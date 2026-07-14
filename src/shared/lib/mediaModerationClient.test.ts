import { describe, expect, it, vi } from "vitest";
import type { Event } from "nostr-tools";
import { createMediaModerationClient } from "./mediaModerationClient";

const event = (id: string): Event => ({
  id,
  pubkey: "a".repeat(64),
  created_at: 1,
  kind: 1,
  tags: [],
  content: "",
  sig: "b".repeat(128),
});

describe("media moderation client", () => {
  it("starts moderated video covered before any effect or request runs", () => {
    const client = createMediaModerationClient({
      baseUrl: "https://admin.example",
      mode: "enforce",
      fetcher: vi.fn(),
    });

    expect(client.initialVerdict({
      url: "https://cdn.example/first-frame.mp4",
      type: "video",
    })).toEqual({
      status: "pending",
      reason: "verdict_requested",
      enforced: true,
    });
    client.close();
  });

  it("coalesces attachment watches into one bounded batch", async () => {
    const fetcher = vi.fn(async (
      _url: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ) => {
      const request = JSON.parse(String(init?.body)) as {
        items: Array<{ requestId: string; event: Event; url: string }>;
      };
      return new Response(
        JSON.stringify({
          mode: "enforce",
          policyVersion: "wired-media-v1",
          verdicts: request.items.map((item) => ({
            requestId: item.requestId,
            eventId: item.event.id,
            url: item.url,
            mediaType: "image",
            status: "allowed",
            reason: "policy_allowed",
            expiresAt: Date.now() + 60_000,
          })),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const client = createMediaModerationClient({
      baseUrl: "https://admin.example",
      mode: "enforce",
      fetcher,
      batchDelayMs: 0,
    });
    const first = vi.fn();
    const second = vi.fn();

    const stopFirst = client.watch(
      event("1".repeat(64)),
      { url: "https://cdn.example/one.jpg", type: "image" },
      first,
    );
    const stopSecond = client.watch(
      event("2".repeat(64)),
      { url: "https://cdn.example/two.jpg", type: "image" },
      second,
    );
    await client.waitForIdle();

    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      items: unknown[];
    };
    expect(body.items).toHaveLength(2);
    expect(first).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "allowed", enforced: true }),
    );
    expect(second).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "allowed", enforced: true }),
    );

    stopFirst();
    stopSecond();
    client.close();
  });

  it("keeps failures covered in enforcement mode", async () => {
    const client = createMediaModerationClient({
      baseUrl: "https://admin.example",
      mode: "enforce",
      fetcher: vi.fn(async () => {
        throw new Error("offline");
      }),
      batchDelayMs: 0,
      retryBaseMs: 60_000,
    });
    const listener = vi.fn();
    const stop = client.watch(
      event("3".repeat(64)),
      { url: "https://cdn.example/failure.jpg", type: "image" },
      listener,
    );
    await client.waitForIdle();

    expect(listener).toHaveBeenLastCalledWith({
      status: "unavailable",
      reason: "verdict_api_unavailable",
      enforced: true,
    });
    stop();
    client.close();
  });

  it("leaves disabled media surfaces unmoderated without calling the API", () => {
    const fetcher = vi.fn();
    const client = createMediaModerationClient({
      baseUrl: "https://admin.example",
      mode: "enforce",
      fetcher,
      enabledMediaTypes: new Set(["image"]),
    });
    const listener = vi.fn();

    const stop = client.watch(
      event("4".repeat(64)),
      { url: "https://cdn.example/video.mp4", type: "video" },
      listener,
    );

    expect(listener).toHaveBeenCalledWith({
      status: "allowed",
      reason: "moderation_disabled",
      enforced: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
    stop();
    client.close();
  });

  it("does not enforce verdicts while the server remains in shadow mode", async () => {
    const client = createMediaModerationClient({
      baseUrl: "https://admin.example",
      mode: "enforce",
      batchDelayMs: 0,
      fetcher: vi.fn(async (_url, init) => {
        const request = JSON.parse(String(init?.body)) as {
          items: Array<{ requestId: string; event: Event; url: string }>;
        };
        return new Response(JSON.stringify({
          mode: "shadow",
          policyVersion: "wired-media-v1",
          verdicts: request.items.map((item) => ({
            requestId: item.requestId,
            eventId: item.event.id,
            url: item.url,
            mediaType: "image",
            status: "blocked",
            reason: "configured_hash_block",
            expiresAt: Date.now() + 60_000,
          })),
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    });
    const listener = vi.fn();
    const stop = client.watch(
      event("5".repeat(64)),
      { url: "https://cdn.example/shadow.jpg", type: "image" },
      listener,
    );

    await client.waitForIdle();

    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "blocked",
      enforced: false,
    }));
    stop();
    client.close();
  });

  it("refreshes terminal verdicts so an admin allow override can restore media", async () => {
    let requests = 0;
    const client = createMediaModerationClient({
      baseUrl: "https://admin.example",
      mode: "enforce",
      batchDelayMs: 0,
      terminalRefreshMs: 5,
      fetcher: vi.fn(async (_url, init) => {
        requests += 1;
        const request = JSON.parse(String(init?.body)) as {
          items: Array<{ requestId: string; event: Event; url: string }>;
        };
        return new Response(JSON.stringify({
          mode: "enforce",
          policyVersion: "wired-media-v1",
          verdicts: request.items.map((item) => ({
            requestId: item.requestId,
            eventId: item.event.id,
            url: item.url,
            mediaType: "image",
            status: requests === 1 ? "blocked" : "allowed",
            reason: requests === 1 ? "configured_hash_block" : "admin_allow_override",
            expiresAt: Date.now() + 60_000,
          })),
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    });
    const listener = vi.fn();
    const stop = client.watch(
      event("6".repeat(64)),
      { url: "https://cdn.example/overridden.jpg", type: "image" },
      listener,
    );

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        status: "allowed",
        reason: "admin_allow_override",
      }));
    });

    expect(requests).toBeGreaterThanOrEqual(2);
    stop();
    client.close();
  });
});
