import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureRelaysConnected: vi.fn(),
  startFiniteQuery: vi.fn(),
}));

vi.mock("../client", () => ({
  ensureRelaysConnected: mocks.ensureRelaysConnected,
  getRegistry: () => ({ subscribe: vi.fn() }),
  initNostr: vi.fn(),
  PROFILE_RELAYS: [],
  startFiniteQuery: mocks.startFiniteQuery,
  THREAD_RELAYS: [],
}));

import type { FiniteQuery } from "../browser-relay-access";
import { subQuotedEventsOnce } from ".";

describe("quote finite queries", () => {
  beforeEach(() => {
    mocks.ensureRelaysConnected.mockReset();
    mocks.ensureRelaysConnected.mockResolvedValue(undefined);
    mocks.startFiniteQuery.mockReset();
    mocks.startFiniteQuery.mockReturnValue({
      done: new Promise(() => {}),
      close: vi.fn(),
    });
  });

  it("owns fallback plus extra hinted coverage per reference", async () => {
    const fallbackRelayUrls = ["wss://fallback-one.example", "wss://fallback-two.example"];
    const hint = "wss://hint.example";
    const ref = { id: "1".repeat(64), relays: [hint] };
    const onEose = vi.fn();

    const handle = await subQuotedEventsOnce([ref], vi.fn(), onEose, {
      fallbackRelayUrls,
    });

    expect(mocks.startFiniteQuery).toHaveBeenCalledOnce();
    const query = mocks.startFiniteQuery.mock.calls[0]?.[0] as FiniteQuery;
    expect(query).toMatchObject({
      workflowOwner: "wired.browser.quotes",
      filters: [{ ids: [ref.id], kinds: [1, 1068], limit: 1 }],
      coverage: {
        configuredRelayUrls: fallbackRelayUrls,
        hintedRelayUrls: [hint],
      },
    });
    query.onComplete?.({
      reason: "settled",
      targets: [],
      receivedEvents: 0,
    });
    expect(onEose).toHaveBeenCalledWith(ref.id);

    handle.close();
    expect(mocks.startFiniteQuery.mock.results[0]?.value.close).toHaveBeenCalledOnce();
  });
});
