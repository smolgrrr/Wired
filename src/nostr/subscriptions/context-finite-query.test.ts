import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "nostr-tools";
import { THREAD_RELAYS } from "../../config";

const mocks = vi.hoisted(() => ({
  prepareRelayConnections: vi.fn(),
  registrySubscribe: vi.fn(),
  startFiniteQuery: vi.fn(),
}));

vi.mock("../client", () => ({
  getRegistry: () => ({ subscribe: mocks.registrySubscribe }),
  prepareRelayConnections: mocks.prepareRelayConnections,
  startFiniteQuery: mocks.startFiniteQuery,
  THREAD_RELAYS,
}));

import {
  DEFAULT_BROWSER_QUERY_DEADLINE_MS,
  type FiniteQuery,
} from "../browser-relay-access";
import { subNotesOnce, subReferencedEventsOnce } from ".";

describe("referenced-context finite query", () => {
  beforeEach(() => {
    mocks.prepareRelayConnections.mockReset();
    mocks.prepareRelayConnections.mockImplementation(([relayUrl]: [string]) => ({
      done: Promise.resolve({
        targets: [{ relayUrl, state: "connected" }],
      }),
      close: vi.fn(),
    }));
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

  it("queries connected hints only for exact context still missing after configured coverage", async () => {
    const configuredId = "1".repeat(64);
    const hintedId = "2".repeat(64);
    const configuredRelay = "wss://configured.example";
    const hintRelay = "wss://hint.example";
    const onEvent = vi.fn();

    subReferencedEventsOnce([
      { id: configuredId, relays: [hintRelay] },
      { id: hintedId, relays: [`${hintRelay}/`] },
    ], onEvent, {
      relayUrls: [configuredRelay],
      dynamicHints: true,
    });

    expect(mocks.startFiniteQuery).toHaveBeenCalledOnce();
    const configuredQuery = mocks.startFiniteQuery.mock.calls[0]?.[0] as FiniteQuery;
    expect(configuredQuery).toMatchObject({
      workflowOwner: "wired.browser.thread",
      filters: [{
        ids: [configuredId, hintedId],
        kinds: [1],
        limit: 2,
      }],
      coverage: {
        configuredRelayUrls: [configuredRelay],
        hintedRelayUrls: [],
      },
    });
    expect(mocks.prepareRelayConnections).toHaveBeenCalledWith(
      [hintRelay],
      "wired.browser.thread",
    );

    configuredQuery.onEvent({
      id: configuredId,
      pubkey: "a".repeat(64),
      created_at: 1,
      kind: 1,
      tags: [],
      content: "configured context",
      sig: "b".repeat(128),
    }, configuredRelay);
    configuredQuery.onComplete?.({
      reason: "settled",
      targets: [{ relayUrl: configuredRelay, state: "eose" }],
      receivedEvents: 1,
    });

    await vi.waitFor(() => expect(mocks.startFiniteQuery).toHaveBeenCalledTimes(2));
    const hintQuery = mocks.startFiniteQuery.mock.calls[1]?.[0] as FiniteQuery;
    expect(hintQuery).toMatchObject({
      filters: [{ ids: [hintedId], kinds: [1], limit: 1 }],
      coverage: {
        configuredRelayUrls: [hintRelay],
        hintedRelayUrls: [],
      },
    });
  });

  it("starts configured coverage before a delayed hint and skips the hint after a configured hit", async () => {
    const eventId = "3".repeat(64);
    const configuredRelay = "wss://configured.example";
    const hintRelay = "wss://slow-hint.example";
    let resolvePreparation!: () => void;
    mocks.prepareRelayConnections.mockReturnValue({
      done: new Promise((resolve) => {
        resolvePreparation = () => resolve({
          targets: [{ relayUrl: hintRelay, state: "connected" }],
        });
      }),
      close: vi.fn(),
    });

    subReferencedEventsOnce(
      [{ id: eventId, relays: [hintRelay] }],
      vi.fn(),
      {
        relayUrls: [configuredRelay],
        dynamicHints: true,
      },
    );

    expect(mocks.startFiniteQuery).toHaveBeenCalledOnce();
    expect(mocks.startFiniteQuery.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prepareRelayConnections.mock.invocationCallOrder[0]!,
    );
    const configuredQuery = mocks.startFiniteQuery.mock.calls[0]?.[0] as FiniteQuery;
    configuredQuery.onEvent({
      id: eventId,
      pubkey: "a".repeat(64),
      created_at: 1,
      kind: 1,
      tags: [],
      content: "configured context",
      sig: "b".repeat(128),
    }, configuredRelay);
    configuredQuery.onComplete?.({
      reason: "settled",
      targets: [{ relayUrl: configuredRelay, state: "eose" }],
      receivedEvents: 1,
    });

    resolvePreparation();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.startFiniteQuery).toHaveBeenCalledOnce();
  });

  it("cancels delayed hint preparation on navigation without opening a late query", async () => {
    const eventId = "4".repeat(64);
    let resolvePreparation!: () => void;
    const closePreparation = vi.fn();
    mocks.prepareRelayConnections.mockReturnValue({
      done: new Promise((resolve) => {
        resolvePreparation = () => resolve({
          targets: [{
            relayUrl: "wss://slow-hint.example",
            state: "connected",
          }],
        });
      }),
      close: closePreparation,
    });

    const handle = subReferencedEventsOnce(
      [{ id: eventId, relays: ["wss://slow-hint.example"] }],
      vi.fn(),
      {
        relayUrls: ["wss://configured.example"],
        dynamicHints: true,
      },
    );
    const configuredQuery = mocks.startFiniteQuery.mock.calls[0]?.[0] as FiniteQuery;
    configuredQuery.onComplete?.({
      reason: "settled",
      targets: [{ relayUrl: "wss://configured.example", state: "eose" }],
      receivedEvents: 0,
    });

    handle.close();
    resolvePreparation();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(closePreparation).toHaveBeenCalledOnce();
    expect(mocks.startFiniteQuery).toHaveBeenCalledOnce();
  });

  it("keeps configured-only context coverage as an immediate rollback", () => {
    subReferencedEventsOnce(
      [{ id: "5".repeat(64), relays: ["wss://hint.example"] }],
      vi.fn(),
      {
        relayUrls: ["wss://configured.example"],
        dynamicHints: false,
      },
    );

    expect(mocks.startFiniteQuery).toHaveBeenCalledOnce();
    expect(mocks.prepareRelayConnections).not.toHaveBeenCalled();
    const query = mocks.startFiniteQuery.mock.calls[0]?.[0] as FiniteQuery;
    expect(query.coverage).toEqual({
      configuredRelayUrls: ["wss://configured.example"],
      hintedRelayUrls: [],
    });
  });

  it("does not prepare a duplicate hint that is already configured", () => {
    subReferencedEventsOnce(
      [{ id: "6".repeat(64), relays: ["wss://configured.example/"] }],
      vi.fn(),
      {
        relayUrls: ["wss://configured.example"],
        dynamicHints: true,
      },
    );

    expect(mocks.startFiniteQuery).toHaveBeenCalledOnce();
    expect(mocks.prepareRelayConnections).not.toHaveBeenCalled();
  });

  it("rejects unrelated events returned by an exact hint query", async () => {
    const eventId = "7".repeat(64);
    const onEvent = vi.fn();
    subReferencedEventsOnce(
      [{ id: eventId, relays: ["wss://hint.example"] }],
      onEvent,
      {
        relayUrls: ["wss://configured.example"],
        dynamicHints: true,
      },
    );
    const configuredQuery = mocks.startFiniteQuery.mock.calls[0]?.[0] as FiniteQuery;
    configuredQuery.onComplete?.({
      reason: "settled",
      targets: [{ relayUrl: "wss://configured.example", state: "eose" }],
      receivedEvents: 0,
    });
    await vi.waitFor(() => expect(mocks.startFiniteQuery).toHaveBeenCalledTimes(2));

    const hintQuery = mocks.startFiniteQuery.mock.calls[1]?.[0] as FiniteQuery;
    hintQuery.onEvent({
      id: "8".repeat(64),
      pubkey: "a".repeat(64),
      created_at: 1,
      kind: 1,
      tags: [],
      content: "unrelated context",
      sig: "b".repeat(128),
    }, "wss://hint.example");

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("delivers an event at most once when multiple hints return it", async () => {
    const eventId = "a".repeat(64);
    const onEvent = vi.fn();
    subReferencedEventsOnce(
      [{
        id: eventId,
        relays: ["wss://first-hint.example", "wss://second-hint.example"],
      }],
      onEvent,
      {
        relayUrls: ["wss://configured.example"],
        dynamicHints: true,
      },
    );
    const configuredQuery = mocks.startFiniteQuery.mock.calls[0]?.[0] as FiniteQuery;
    configuredQuery.onComplete?.({
      reason: "settled",
      targets: [{ relayUrl: "wss://configured.example", state: "eose" }],
      receivedEvents: 0,
    });
    await vi.waitFor(() => expect(mocks.startFiniteQuery).toHaveBeenCalledTimes(3));
    const event: Event = {
      id: eventId,
      pubkey: "b".repeat(64),
      created_at: 1,
      kind: 1,
      tags: [],
      content: "shared hinted context",
      sig: "c".repeat(128),
    };

    const firstHintQuery = mocks.startFiniteQuery.mock.calls[1]?.[0] as FiniteQuery;
    const secondHintQuery = mocks.startFiniteQuery.mock.calls[2]?.[0] as FiniteQuery;
    firstHintQuery.onEvent(event, "wss://first-hint.example");
    secondHintQuery.onEvent(event, "wss://second-hint.example");

    expect(onEvent).toHaveBeenCalledOnce();
  });

  it("owns a failed hint query without retrying or leaking work", async () => {
    const eventId = "9".repeat(64);
    mocks.prepareRelayConnections.mockReturnValue({
      done: Promise.resolve({
        targets: [{
          relayUrl: "wss://failing-hint.example",
          state: "connect-failed",
        }],
      }),
      close: vi.fn(),
    });
    mocks.startFiniteQuery.mockImplementation(() => ({
      done: new Promise(() => {}),
      close: vi.fn(),
    }));
    const handle = subReferencedEventsOnce(
      [{ id: eventId, relays: ["wss://failing-hint.example"] }],
      vi.fn(),
      {
        relayUrls: ["wss://configured.example"],
        dynamicHints: true,
      },
    );
    const configuredQuery = mocks.startFiniteQuery.mock.calls[0]?.[0] as FiniteQuery;
    configuredQuery.onComplete?.({
      reason: "settled",
      targets: [{ relayUrl: "wss://configured.example", state: "eose" }],
      receivedEvents: 0,
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    handle.close();

    expect(mocks.startFiniteQuery).toHaveBeenCalledOnce();
    expect(mocks.startFiniteQuery.mock.results[0]?.value.close).toHaveBeenCalledOnce();
    expect(mocks.prepareRelayConnections).toHaveBeenCalledOnce();
  });
});
