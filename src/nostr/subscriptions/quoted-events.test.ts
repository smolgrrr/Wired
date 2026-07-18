import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POW_RELAYS, QUOTE_FALLBACK_RELAYS, THREAD_RELAYS } from "../../config";

const mocks = vi.hoisted(() => ({
  ensureRelaysConnected: vi.fn(),
  initNostr: vi.fn(),
  startFiniteQuery: vi.fn(),
}));

vi.mock("../client", () => ({
  ensureRelaysConnected: mocks.ensureRelaysConnected,
  getRegistry: () => ({ subscribe: vi.fn() }),
  initNostr: mocks.initNostr,
  PROFILE_RELAYS: THREAD_RELAYS,
  startFiniteQuery: mocks.startFiniteQuery,
  THREAD_RELAYS,
}));

import type { FiniteQuery } from "../browser-relay-access";
import { subQuotedEventsOnce } from "./index";

const quoteId = "a38fb77ce8783c30bf64063fe78e8060f3b58e41476fb3a5cd94ddfb1b3837d1";

describe("subQuotedEventsOnce", () => {
  afterEach(() => {
    vi.doUnmock("../../config");
  });

  beforeEach(() => {
    mocks.ensureRelaysConnected.mockReset();
    mocks.initNostr.mockReset();
    mocks.startFiniteQuery.mockReset();
    mocks.initNostr.mockResolvedValue(undefined);
    mocks.ensureRelaysConnected.mockResolvedValue(undefined);
    mocks.startFiniteQuery.mockReturnValue({
      done: new Promise(() => {}),
      close: vi.fn(),
    });
  });

  it("starts configured fallback coverage with a stale relay hint", async () => {
    await subQuotedEventsOnce(
      [{ id: quoteId, relays: ["wss://nostr.land"] }],
      vi.fn(),
      vi.fn(),
    );

    expect(mocks.initNostr).toHaveBeenCalledTimes(1);
    expect(mocks.startFiniteQuery).toHaveBeenCalledOnce();
    expect(mocks.ensureRelaysConnected).not.toHaveBeenCalled();
    const query = mocks.startFiniteQuery.mock.calls[0][0] as FiniteQuery;
    expect(query.filters).toEqual([{
      ids: [quoteId], kinds: [1, 1068], limit: 1,
    }]);
    expect(query.coverage).toEqual({
      configuredRelayUrls: [...new Set([...POW_RELAYS, ...QUOTE_FALLBACK_RELAYS])],
      hintedRelayUrls: ["wss://nostr.land"],
    });
  });

  it("reports EOSE from the fallback subscription when no extra relay hints exist", async () => {
    const onEose = vi.fn();

    await subQuotedEventsOnce(
      [{ id: quoteId, relays: ["wss://nos.lol"] }],
      vi.fn(),
      onEose,
    );

    expect(mocks.ensureRelaysConnected).not.toHaveBeenCalled();
    expect(mocks.startFiniteQuery).toHaveBeenCalledOnce();
    const query = mocks.startFiniteQuery.mock.calls[0][0] as FiniteQuery;
    expect(query.coverage.configuredRelayUrls).toEqual([
      ...new Set([...POW_RELAYS, ...QUOTE_FALLBACK_RELAYS, "wss://nos.lol"]),
    ]);
    expect(query.coverage.hintedRelayUrls).toEqual([]);
    query.onComplete?.({ reason: "settled", targets: [], receivedEvents: 0 });
    expect(onEose).toHaveBeenCalledWith(quoteId);
  });

  it("keeps default quote fallback relays with configured relays and issue relay hints", async () => {
    const powRelays = ["wss://relay.wiredsignal.online"];
    const defaultQuoteRelays = ["wss://relay.damus.io", "wss://offchain.pub"];
    const configuredQuoteRelays = ["wss://configured.example"];

    vi.resetModules();
    vi.doMock("../../config", () => ({
      POW_RELAYS: powRelays,
      QUOTE_FALLBACK_RELAYS: [...defaultQuoteRelays, ...configuredQuoteRelays],
      THREAD_RELAYS: [],
    }));

    const { subQuotedEventsOnce: subQuotedEventsOnceWithNarrowedConfig } = await import(
      "./index"
    );

    await subQuotedEventsOnceWithNarrowedConfig(
      [{ id: quoteId, relays: ["wss://nostr.land"] }],
      vi.fn(),
      vi.fn(),
    );

    const query = mocks.startFiniteQuery.mock.calls[0][0] as FiniteQuery;
    expect(query.coverage.configuredRelayUrls).toEqual([
      ...powRelays,
      ...defaultQuoteRelays,
      ...configuredQuoteRelays,
    ]);
    expect(query.coverage.hintedRelayUrls).toEqual(["wss://nostr.land"]);
  });
});
