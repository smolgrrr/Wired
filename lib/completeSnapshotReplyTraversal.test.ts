import { describe, expect, it, vi } from "vitest";
import type { Event, Filter } from "nostr-tools";
import type {
  FiniteRelayQuery,
  FiniteRelaySession,
  QueryCompletion,
} from "./serverRelaySession";
import { traverseCompleteSnapshotReplies } from "./completeSnapshotReplyTraversal";

function event(id: string): Event {
  return {
    id,
    pubkey: "f".repeat(64),
    created_at: 2_000_000_000,
    kind: 1,
    tags: [],
    content: id,
    sig: "e".repeat(128),
  };
}

function settled(relayUrls: readonly string[], receivedEvents: number): QueryCompletion {
  return {
    reason: "settled",
    targets: relayUrls.map((relayUrl) => ({ relayUrl, state: "eose" })),
    receivedEvents,
  };
}

class ControlledSession implements FiniteRelaySession {
  readonly queries: Filter[][] = [];

  constructor(
    private readonly respond: (
      input: FiniteRelayQuery,
      queryNumber: number,
    ) => { events?: Event[]; completion?: QueryCompletion },
  ) {}

  ensureRelays(): Promise<readonly []> {
    return Promise.resolve([]);
  }

  async query(input: FiniteRelayQuery): Promise<QueryCompletion> {
    this.queries.push(input.filters);
    const response = this.respond(input, this.queries.length);
    response.events?.forEach((reply) => input.onEvent(reply, input.relayUrls![0]!));
    return response.completion ??
      settled(input.relayUrls ?? [], response.events?.length ?? 0);
  }
}

describe("complete Wired snapshot reply traversal", () => {
  it("resolves a cumulative wide/deep fixpoint through sequential exact chunks", async () => {
    const rootId = "0".repeat(64);
    const directReplies = Array.from(
      { length: 60 },
      (_, index) => event((index + 1).toString(16).padStart(64, "0")),
    );
    const nestedReplies = Array.from(
      { length: 60 },
      (_, index) => event((index + 101).toString(16).padStart(64, "0")),
    );
    const repliesByParent = new Map<string, Event[]>([[rootId, directReplies]]);
    directReplies.forEach((reply, index) => {
      repliesByParent.set(reply.id, [nestedReplies[index]!]);
    });
    const session = new ControlledSession((input) => {
      const parentIds = input.filters[0]?.["#e"] ?? [];
      return {
        events: parentIds.flatMap((parentId) => repliesByParent.get(parentId) ?? []),
      };
    });

    const result = await traverseCompleteSnapshotReplies({
      session,
      initialParentIds: [rootId],
      relayUrls: ["wss://relay.example"],
      since: 1_900_000_000,
      deadlineMs: 5_000,
    });

    expect(result.completion).toEqual({
      state: "complete",
      passes: 3,
      queries: 6,
      parentCount: 121,
    });
    expect(result.events.map((reply) => reply.id).sort()).toEqual(
      [...directReplies, ...nestedReplies].map((reply) => reply.id).sort(),
    );
    expect(session.queries).toHaveLength(6);
    expect(session.queries.every((filters) => filters.length === 1)).toBe(true);
    expect(session.queries.every((filters) => {
      const filter = filters[0]!;
      return (
        (filter["#e"]?.length ?? 0) <= 50 &&
        filter.limit === undefined &&
        filter.since === 1_900_000_000
      );
    })).toBe(true);
  });

  it("reports relay closure as incomplete instead of claiming a fixpoint", async () => {
    const onCompletion = vi.fn();
    const session = new ControlledSession((input) => ({
      completion: {
        reason: "settled",
        targets: input.relayUrls!.map((relayUrl) => ({
          relayUrl,
          state: "closed" as const,
        })),
        receivedEvents: 0,
      },
    }));

    const result = await traverseCompleteSnapshotReplies({
      session,
      initialParentIds: ["0".repeat(64)],
      relayUrls: ["wss://relay.example"],
      deadlineMs: 5_000,
      onCompletion,
    });

    expect(result.completion).toEqual({
      state: "incomplete",
      reason: "relay-closed",
      passes: 1,
      queries: 1,
      parentCount: 1,
    });
    expect(onCompletion).toHaveBeenCalledWith(result.completion);
  });

  it("promotes an already-known delivered reply so its descendants remain reachable", async () => {
    const rootId = "0".repeat(64);
    const knownReply = event("1".repeat(64));
    const child = event("2".repeat(64));
    const session = new ControlledSession((input) => {
      const parentIds = input.filters[0]?.["#e"] ?? [];
      return {
        events: [
          ...(parentIds.includes(rootId) ? [knownReply] : []),
          ...(parentIds.includes(knownReply.id) ? [child] : []),
        ],
      };
    });

    const result = await traverseCompleteSnapshotReplies({
      session,
      initialParentIds: [rootId],
      knownEventIds: [knownReply.id],
      relayUrls: ["wss://relay.example"],
      deadlineMs: 5_000,
    });

    expect(result.completion).toEqual({
      state: "complete",
      passes: 3,
      queries: 3,
      parentCount: 3,
    });
    expect(result.events).toEqual([child]);
  });

  it("reports the pass bound when the last allowed pass discovers a new parent", async () => {
    const session = new ControlledSession((_input, queryNumber) => ({
      events: [event(queryNumber.toString(16).padStart(64, "0"))],
    }));

    const result = await traverseCompleteSnapshotReplies({
      session,
      initialParentIds: ["0".repeat(64)],
      relayUrls: ["wss://relay.example"],
      deadlineMs: 5_000,
      maxPasses: 1,
    });

    expect(result.completion).toEqual({
      state: "incomplete",
      reason: "pass-bound",
      passes: 1,
      queries: 1,
      parentCount: 2,
    });
  });

  it("reports cancellation even when no reply parents were discovered", async () => {
    const controller = new AbortController();
    controller.abort();
    const session = new ControlledSession(() => ({}));

    const result = await traverseCompleteSnapshotReplies({
      session,
      initialParentIds: [],
      relayUrls: ["wss://relay.example"],
      deadlineMs: 5_000,
      signal: controller.signal,
    });

    expect(result.completion).toEqual({
      state: "incomplete",
      reason: "cancelled",
      passes: 0,
      queries: 0,
      parentCount: 0,
    });
    expect(session.queries).toHaveLength(0);
  });
});
