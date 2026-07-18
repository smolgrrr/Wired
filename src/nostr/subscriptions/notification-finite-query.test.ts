import { beforeEach, describe, expect, it, vi } from "vitest";
import { POW_RELAYS } from "../../config";

const mocks = vi.hoisted(() => ({
  registrySubscribe: vi.fn(),
  startFiniteQuery: vi.fn(),
}));

vi.mock("../client", () => ({
  getRegistry: () => ({ subscribe: mocks.registrySubscribe }),
  startFiniteQuery: mocks.startFiniteQuery,
}));

import type { FiniteQuery, QueryCompletion } from "../browser-relay-access";
import { subNotifications } from "./notifications";

function settled(query: FiniteQuery): QueryCompletion {
  return {
    reason: "settled",
    targets: query.coverage.configuredRelayUrls.map((relayUrl) => ({
      relayUrl,
      state: "eose",
    })),
    receivedEvents: 0,
  };
}

describe("notification finite queries", () => {
  beforeEach(() => {
    mocks.registrySubscribe.mockReset();
    mocks.registrySubscribe.mockReturnValue({ id: "legacy", close: vi.fn() });
    mocks.startFiniteQuery.mockReset();
    mocks.startFiniteQuery.mockImplementation(() => ({
      done: new Promise(() => {}),
      close: vi.fn(),
    }));
  });

  it("owns authored and mentioned filters separately and syncs after both complete", () => {
    const pubkeys = ["a".repeat(64)];
    const onEose = vi.fn();

    const handle = subNotifications(pubkeys, vi.fn(), onEose);

    expect(mocks.startFiniteQuery).toHaveBeenCalledTimes(2);
    const authored = mocks.startFiniteQuery.mock.calls[0]?.[0] as FiniteQuery;
    const mentioned = mocks.startFiniteQuery.mock.calls[1]?.[0] as FiniteQuery;
    expect(authored).toMatchObject({
      workflowOwner: "wired.browser.notifications",
      filters: [{ authors: pubkeys, kinds: [1], limit: 25 }],
      coverage: { configuredRelayUrls: POW_RELAYS, hintedRelayUrls: [] },
    });
    expect(mentioned).toMatchObject({
      workflowOwner: "wired.browser.notifications",
      filters: [{ "#p": pubkeys, kinds: [1], limit: 50 }],
      coverage: { configuredRelayUrls: POW_RELAYS, hintedRelayUrls: [] },
    });

    authored.onComplete?.(settled(authored));
    expect(onEose).not.toHaveBeenCalled();
    mentioned.onComplete?.(settled(mentioned));
    expect(onEose).toHaveBeenCalledOnce();

    handle.close();
    expect(mocks.startFiniteQuery.mock.results[0]?.value.close).toHaveBeenCalledOnce();
    expect(mocks.startFiniteQuery.mock.results[1]?.value.close).toHaveBeenCalledOnce();
    expect(mocks.registrySubscribe).not.toHaveBeenCalled();
  });

  it("closes both owned queries without reporting sync when the owner cancels", () => {
    mocks.startFiniteQuery.mockImplementation((query: FiniteQuery) => ({
      done: new Promise(() => {}),
      close: vi.fn(() => query.onComplete?.({
        reason: "cancelled",
        targets: query.coverage.configuredRelayUrls.map((relayUrl) => ({
          relayUrl,
          state: "cancelled",
        })),
        receivedEvents: 0,
      })),
    }));
    const onEose = vi.fn();
    const handle = subNotifications(["a".repeat(64)], vi.fn(), onEose);

    handle.close();

    expect(onEose).not.toHaveBeenCalled();
    expect(mocks.startFiniteQuery.mock.results[0]?.value.close).toHaveBeenCalledOnce();
    expect(mocks.startFiniteQuery.mock.results[1]?.value.close).toHaveBeenCalledOnce();
  });
});
