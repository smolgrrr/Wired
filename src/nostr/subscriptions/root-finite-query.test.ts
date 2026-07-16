import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "nostr-tools";
import { POW_RELAYS, THREAD_RELAYS } from "../../config";

const mocks = vi.hoisted(() => ({
  registrySubscribe: vi.fn(),
  startFiniteQuery: vi.fn(),
}));

vi.mock("../client", () => ({
  getRegistry: () => ({ subscribe: mocks.registrySubscribe }),
  startFiniteQuery: mocks.startFiniteQuery,
  THREAD_RELAYS,
}));

import type { FiniteQuery, QueryCompletion } from "../browser-relay-access";
import { subGlobalFeed } from "./global-feed";
import { subNote } from "./thread";

const rootNote = (id: string, tags: string[][] = []): Event => ({
  id,
  pubkey: "a".repeat(64),
  created_at: 1,
  kind: 1,
  tags,
  content: "root",
  sig: "b".repeat(128),
});

function completion(
  query: FiniteQuery,
  states: Array<"eose" | "connect-failed"> = ["eose"],
): QueryCompletion {
  const relays = [
    ...query.coverage.configuredRelayUrls,
    ...(query.coverage.hintedRelayUrls ?? []),
  ];
  return {
    reason: "settled",
    targets: states.map((state, index) => ({
      relayUrl: relays[index] ?? `wss://target-${index}.example/`,
      state,
    })),
    receivedEvents: 0,
  };
}

describe("browser root finite-query adapters", () => {
  beforeEach(() => {
    mocks.registrySubscribe.mockReset();
    mocks.registrySubscribe.mockReturnValue({ id: "legacy", close: vi.fn() });
    mocks.startFiniteQuery.mockReset();
    mocks.startFiniteQuery.mockImplementation(() => ({
      done: new Promise(() => {}),
      close: vi.fn(),
    }));
  });

  it("routes the exact thread root filter through configured plus hinted coverage", () => {
    const onEvent = vi.fn();
    const hint = "wss://hint.example";
    const handle = subNote("1".repeat(64), onEvent, [hint]);

    expect(mocks.startFiniteQuery).toHaveBeenCalledOnce();
    const query = mocks.startFiniteQuery.mock.calls[0]?.[0] as FiniteQuery;
    expect(query).toMatchObject({
      workflowOwner: "wired.browser.thread",
      filters: [{ ids: ["1".repeat(64)], kinds: [1, 1068], limit: 1 }],
      coverage: {
        configuredRelayUrls: THREAD_RELAYS,
        hintedRelayUrls: [hint],
      },
    });
    query.onEvent(rootNote("1".repeat(64)), hint);
    expect(onEvent).toHaveBeenCalledOnce();

    handle.close();
    expect(mocks.startFiniteQuery.mock.results[0]?.value.close).toHaveBeenCalledOnce();
    expect(mocks.registrySubscribe).toHaveBeenCalledOnce();
  });

  it("continues feed root resolution after partial finite completion", () => {
    const rootId = "1".repeat(64);
    const replyId = "2".repeat(64);
    const hint = "wss://hint.example";
    const onInitialEose = vi.fn();
    subGlobalFeed(vi.fn(), 24, {
      rootRelayUrls: ["wss://pow.example"],
      replyRelayUrls: ["wss://thread.example"],
      rootFilterDifficulty: 0,
      onInitialEose,
    });

    const initial = mocks.startFiniteQuery.mock.calls[0]?.[0] as FiniteQuery;
    expect(initial).toMatchObject({
      workflowOwner: "wired.browser.feed",
      filters: [{ kinds: [1], since: expect.any(Number), limit: 500 }],
      coverage: {
        configuredRelayUrls: ["wss://pow.example"],
        hintedRelayUrls: [],
      },
    });
    initial.onEvent(rootNote(replyId, [
      ["e", rootId, hint, "root"],
      ["nonce", "reply", "16"],
    ]), "wss://pow.example");
    initial.onComplete?.(completion(initial, ["eose", "connect-failed"]));

    expect(onInitialEose).toHaveBeenCalledOnce();
    const fetch = mocks.startFiniteQuery.mock.calls[1]?.[0] as FiniteQuery;
    expect(fetch).toMatchObject({
      workflowOwner: "wired.browser.feed",
      filters: [{ ids: [rootId], kinds: [1], limit: 1 }],
      coverage: {
        configuredRelayUrls: ["wss://thread.example"],
        hintedRelayUrls: [hint],
      },
    });
    expect(fetch.filters[0]).not.toHaveProperty("since");
  });

  it("uses the existing configured defaults when feed options omit relays", () => {
    subGlobalFeed(vi.fn(), 24);

    const initial = mocks.startFiniteQuery.mock.calls[0]?.[0] as FiniteQuery;
    expect(initial.coverage.configuredRelayUrls).toEqual(POW_RELAYS);
  });

  it("does not continue feed traversal after navigation cancellation", () => {
    const onInitialEose = vi.fn();
    subGlobalFeed(vi.fn(), 24, {
      rootRelayUrls: ["wss://pow.example"],
      onInitialEose,
    });

    const initial = mocks.startFiniteQuery.mock.calls[0]?.[0] as FiniteQuery;
    initial.onEvent(rootNote("1".repeat(64)), "wss://pow.example");
    initial.onComplete?.({
      reason: "cancelled",
      targets: [{ relayUrl: "wss://pow.example", state: "cancelled" }],
      receivedEvents: 1,
    });

    expect(onInitialEose).not.toHaveBeenCalled();
    expect(mocks.startFiniteQuery).toHaveBeenCalledOnce();
    expect(mocks.registrySubscribe).not.toHaveBeenCalled();
  });
});
