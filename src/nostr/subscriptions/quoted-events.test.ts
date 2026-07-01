import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POW_RELAYS, QUOTE_FALLBACK_RELAYS, THREAD_RELAYS } from "../../config";

const mocks = vi.hoisted(() => ({
  ensureRelaysConnected: vi.fn(),
  initNostr: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock("../client", () => ({
  ensureRelaysConnected: mocks.ensureRelaysConnected,
  getRegistry: () => ({
    subscribe: mocks.subscribe,
  }),
  initNostr: mocks.initNostr,
  PROFILE_RELAYS: THREAD_RELAYS,
  THREAD_RELAYS,
}));

import { subQuotedEventsOnce } from "./index";

const quoteId = "a38fb77ce8783c30bf64063fe78e8060f3b58e41476fb3a5cd94ddfb1b3837d1";

describe("subQuotedEventsOnce", () => {
  afterEach(() => {
    vi.doUnmock("../../config");
  });

  beforeEach(() => {
    mocks.ensureRelaysConnected.mockReset();
    mocks.initNostr.mockReset();
    mocks.subscribe.mockReset();
    mocks.initNostr.mockResolvedValue(undefined);
    mocks.ensureRelaysConnected.mockResolvedValue(undefined);
    mocks.subscribe.mockReturnValue({ id: "sub", close: vi.fn() });
  });

  it("subscribes to fallback quote relays before waiting for stale relay hints", async () => {
    let resolveHintRelays: () => void = () => {};
    mocks.ensureRelaysConnected.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveHintRelays = resolve;
      }),
    );

    await subQuotedEventsOnce(
      [{ id: quoteId, relays: ["wss://nostr.land"] }],
      vi.fn(),
      vi.fn(),
    );

    expect(mocks.initNostr).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    expect(mocks.ensureRelaysConnected).toHaveBeenCalledWith(["wss://nostr.land"]);

    const fallbackRequest = mocks.subscribe.mock.calls[0][0][0];
    expect(fallbackRequest.filter).toEqual({
      ids: [quoteId],
      kinds: [1, 1068],
      limit: 1,
    });
    expect(fallbackRequest.relayUrls).toEqual([
      ...new Set([...POW_RELAYS, ...QUOTE_FALLBACK_RELAYS, "wss://nostr.land"]),
    ]);
    expect(fallbackRequest.onEose).toBeUndefined();

    resolveHintRelays();
    await Promise.resolve();

    expect(mocks.subscribe).toHaveBeenCalledTimes(2);
    const hintedRequest = mocks.subscribe.mock.calls[1][0][0];
    expect(hintedRequest.relayUrls).toEqual(["wss://nostr.land"]);
    expect(hintedRequest.onEose).toEqual(expect.any(Function));
  });

  it("reports EOSE from the fallback subscription when no extra relay hints exist", async () => {
    const onEose = vi.fn();

    await subQuotedEventsOnce(
      [{ id: quoteId, relays: ["wss://nos.lol"] }],
      vi.fn(),
      onEose,
    );

    expect(mocks.ensureRelaysConnected).not.toHaveBeenCalled();
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);

    const fallbackRequest = mocks.subscribe.mock.calls[0][0][0];
    expect(fallbackRequest.relayUrls).toEqual([
      ...new Set([...POW_RELAYS, ...QUOTE_FALLBACK_RELAYS, "wss://nos.lol"]),
    ]);

    fallbackRequest.onEose();
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

    const fallbackRequest = mocks.subscribe.mock.calls[0][0][0];
    expect(fallbackRequest.relayUrls).toEqual([
      ...powRelays,
      ...defaultQuoteRelays,
      ...configuredQuoteRelays,
      "wss://nostr.land",
    ]);
    expect(mocks.ensureRelaysConnected).toHaveBeenCalledWith(["wss://nostr.land"]);
  });
});
