import { describe, expect, it } from "vitest";
import { Event } from "nostr-tools";
import { decodeNostrRef, extractQuotedRefs } from "./quotedEvents";

const QUOTED_POLL_ID = "48942b7f9e4501af2d9f8e668256c0652dcbe41fa0104acce6aca81ab9ff2de2";
const QUOTED_POLL_NEVENT =
  "nevent1qvzqqqqy9spzpmnw5yatnljuff5w47d35d87q99xddqpzlzsac4xzn6vm22ekmn5qy2hwumn8ghj7un9d3shjtnyv9kh2uewd9hj7qgnwaehxw309ahkvenrdpskjm3wwp6kytcqypyfg2mlnezsrtedn78xdqjkcpjjmjlyr7spqjkvu6k2sx4eluk7yarpf4w";

describe("decodeNostrRef", () => {
  it("decodes nevent references to event ids and relay hints", () => {
    expect(decodeNostrRef(QUOTED_POLL_NEVENT)).toEqual({
      id: QUOTED_POLL_ID,
      relays: ["wss://relay.damus.io", "wss://offchain.pub"],
    });
  });
});

describe("extractQuotedRefs", () => {
  it("extracts refs from inline nostr references", () => {
    const event = {
      content: `Just a reminder\nnostr:${QUOTED_POLL_NEVENT}`,
      tags: [],
    } as unknown as Event;

    expect(extractQuotedRefs(event)).toEqual([
      {
        id: QUOTED_POLL_ID,
        relays: ["wss://relay.damus.io", "wss://offchain.pub"],
      },
    ]);
  });

  it("extracts refs from q tags", () => {
    const event = {
      content: "quoting this",
      tags: [
        ["p", "a".repeat(64)],
        ["q", "b".repeat(64)],
      ],
    } as Event;

    expect(extractQuotedRefs(event)).toEqual([{ id: "b".repeat(64), relays: [] }]);
  });

  it("merges relay hints from q tags", () => {
    const event = {
      content: "quoting this",
      tags: [["q", "b".repeat(64), "wss://relay.damus.io/"]],
    } as Event;

    expect(extractQuotedRefs(event)).toEqual([
      { id: "b".repeat(64), relays: ["wss://relay.damus.io"] },
    ]);
  });

  it("dedupes q tags and inline references to the same event", () => {
    const event = {
      content: `see nostr:${QUOTED_POLL_NEVENT}`,
      tags: [["q", QUOTED_POLL_ID]],
    } as Event;

    expect(extractQuotedRefs(event)).toEqual([
      {
        id: QUOTED_POLL_ID,
        relays: ["wss://relay.damus.io", "wss://offchain.pub"],
      },
    ]);
  });
});