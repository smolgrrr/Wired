import { describe, expect, it, vi, beforeEach } from "vitest";
import { THREAD_RELAYS } from "../../config";
import { REPLY_QUERY_LIMIT } from "./query-limits";

const { subscribeMock, startFiniteQueryMock } = vi.hoisted(() => ({
  subscribeMock: vi.fn(),
  startFiniteQueryMock: vi.fn(),
}));

vi.mock("../client", () => ({
  getRegistry: () => ({
    subscribe: subscribeMock,
  }),
  startFiniteQuery: startFiniteQueryMock,
  THREAD_RELAYS,
}));

import type { FiniteQuery } from "../browser-relay-access";
import { subNote } from "./thread";

const expectedRelays = [...THREAD_RELAYS];

describe("subNote", () => {
  beforeEach(() => {
    subscribeMock.mockReset();
    subscribeMock.mockImplementation(() => ({ id: "1", close: vi.fn() }));
    startFiniteQueryMock.mockReset();
    startFiniteQueryMock.mockImplementation((query: FiniteQuery) => {
      const relayUrls = [...new Set([
        ...query.coverage.configuredRelayUrls,
        ...(query.coverage.hintedRelayUrls ?? []),
      ].map((relayUrl) => relayUrl.replace(/\/+$/, "")))];
      const legacy = subscribeMock([{
        filter: query.filters[0],
        relayUrls,
        cb: query.onEvent,
        closeOnEose: true,
      }]);
      return {
        done: new Promise(() => {}),
        close: legacy.close,
      };
    });
  });

  it("subscribes to the OP and replies on default and fallback relays", () => {
    subNote("1".repeat(64), vi.fn());

    expect(subscribeMock).toHaveBeenCalledTimes(2);

    const opRequest = subscribeMock.mock.calls[0][0][0];
    const replyRequest = subscribeMock.mock.calls[1][0][0];

    expect(opRequest.relayUrls).toEqual(expectedRelays);
    expect(replyRequest.relayUrls).toEqual(expectedRelays);
    expect(replyRequest.filter).toMatchObject({
      "#e": ["1".repeat(64)],
      kinds: [1],
      limit: REPLY_QUERY_LIMIT,
    });
    expect(replyRequest.filter.since).toBeUndefined();
  });

  it("adds relay hints to thread subscriptions", () => {
    subNote("1".repeat(64), vi.fn(), ["wss://relay.example/", THREAD_RELAYS[0]]);

    const opRequest = subscribeMock.mock.calls[0][0][0];
    const replyRequest = subscribeMock.mock.calls[1][0][0];
    const relays = [...expectedRelays, "wss://relay.example"];

    expect(opRequest.relayUrls).toEqual(relays);
    expect(replyRequest.relayUrls).toEqual(relays);
  });
});
