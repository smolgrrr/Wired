import { describe, expect, it, vi, beforeEach } from "vitest";
import { THREAD_RELAYS } from "../../config";
import { REPLY_QUERY_LIMIT } from "./query-limits";

const subscribeMock = vi.fn();

vi.mock("../client", () => ({
  getRegistry: () => ({
    subscribe: subscribeMock,
  }),
  THREAD_RELAYS,
}));

import { subNote } from "./thread";

const expectedRelays = [...THREAD_RELAYS];

describe("subNote", () => {
  beforeEach(() => {
    subscribeMock.mockReset();
    subscribeMock.mockImplementation(() => ({ id: "1", close: vi.fn() }));
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
      since: expect.any(Number),
    });
  });
});
