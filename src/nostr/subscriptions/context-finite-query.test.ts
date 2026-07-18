import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "nostr-tools";
import { THREAD_RELAYS } from "../../config";

const mocks = vi.hoisted(() => ({
  registrySubscribe: vi.fn(),
  startFiniteQuery: vi.fn(),
}));

vi.mock("../client", () => ({
  getRegistry: () => ({ subscribe: mocks.registrySubscribe }),
  startFiniteQuery: mocks.startFiniteQuery,
  THREAD_RELAYS,
}));

import {
  DEFAULT_BROWSER_QUERY_DEADLINE_MS,
  type FiniteQuery,
} from "../browser-relay-access";
import { subNotesOnce } from ".";

describe("referenced-context finite query", () => {
  beforeEach(() => {
    mocks.registrySubscribe.mockReset();
    mocks.registrySubscribe.mockReturnValue({ id: "legacy", close: vi.fn() });
    mocks.startFiniteQuery.mockReset();
    mocks.startFiniteQuery.mockReturnValue({
      done: new Promise(() => {}),
      close: vi.fn(),
    });
  });

  it("owns the exact batched context filter across the selected coverage", () => {
    const eventIds = ["1".repeat(64), "2".repeat(64)];
    const relayUrls = ["wss://context-one.example", "wss://context-two.example"];
    const onEvent = vi.fn();

    const handle = subNotesOnce(eventIds, onEvent, relayUrls);

    expect(mocks.startFiniteQuery).toHaveBeenCalledOnce();
    const query = mocks.startFiniteQuery.mock.calls[0]?.[0] as FiniteQuery;
    expect(query).toMatchObject({
      workflowOwner: "wired.browser.thread",
      filters: [{ ids: eventIds, kinds: [1], limit: 2 }],
      coverage: {
        configuredRelayUrls: relayUrls,
        hintedRelayUrls: [],
      },
      completionDeadlineMs: DEFAULT_BROWSER_QUERY_DEADLINE_MS,
    });
    const event: Event = {
      id: eventIds[0],
      pubkey: "a".repeat(64),
      created_at: 1,
      kind: 1,
      tags: [],
      content: "context",
      sig: "b".repeat(128),
    };
    query.onEvent(event, relayUrls[0]);
    expect(onEvent).toHaveBeenCalledWith(event, relayUrls[0]);

    handle.close();
    expect(mocks.startFiniteQuery.mock.results[0]?.value.close).toHaveBeenCalledOnce();
    expect(mocks.registrySubscribe).not.toHaveBeenCalled();
  });
});
