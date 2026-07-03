import { describe, expect, it } from "vitest";
import { Event } from "nostr-tools";
import {
  decodeNostrRef,
  extractMentionedEventRefs,
  extractQuotedRefs,
} from "./quotedEvents";

const QUOTED_POLL_ID = "48942b7f9e4501af2d9f8e668256c0652dcbe41fa0104acce6aca81ab9ff2de2";
const QUOTED_POLL_NEVENT =
  "nevent1qvzqqqqy9spzpmnw5yatnljuff5w47d35d87q99xddqpzlzsac4xzn6vm22ekmn5qy2hwumn8ghj7un9d3shjtnyv9kh2uewd9hj7qgnwaehxw309ahkvenrdpskjm3wwp6kytcqypyfg2mlnezsrtedn78xdqjkcpjjmjlyr7spqjkvu6k2sx4eluk7yarpf4w";
const NOTE_TAG_ID = "c".repeat(64);
const NOTE_TAG_NOTE = "note1enxvenxvenxvenxvenxvenxvenxvenxvenxvenxvenxvenxvenxqzqztj2";
const ISSUE_54_QUOTED_ID = "a38fb77ce8783c30bf64063fe78e8060f3b58e41476fb3a5cd94ddfb1b3837d1";
const ISSUE_54_QUOTED_NEVENT =
  "nevent1qqs28rah0n58s0pshajqv0l836qxpua43eq5wman5hxefh0mrvur05gpzpmhxue69uhkummnw3ezumrpdejqygr2q2mat4wpemkr6zkj3ht3cn87awmrj7u4lm6u65pjey3r5y7s9gcs8lc6";

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

  it("extracts the reported issue 54 quote and its relay hint", () => {
    const event = {
      content: `No one should ever make a dumb "dry heat" joke.\nnostr:${ISSUE_54_QUOTED_NEVENT}`,
      tags: [["q", ISSUE_54_QUOTED_ID, "wss://nostr.land"]],
    } as Event;

    expect(extractQuotedRefs(event)).toEqual([
      {
        id: ISSUE_54_QUOTED_ID,
        relays: ["wss://nostr.land"],
      },
    ]);
  });

  it("decodes note and nevent values from q tags", () => {
    const event = {
      content: "",
      tags: [
        ["q", `nostr:${QUOTED_POLL_NEVENT}`, "wss://relay.example/"],
        ["q", NOTE_TAG_NOTE],
      ],
    } as Event;

    expect(extractQuotedRefs(event)).toEqual([
      {
        id: QUOTED_POLL_ID,
        relays: [
          "wss://relay.damus.io",
          "wss://offchain.pub",
          "wss://relay.example",
        ],
      },
      {
        id: NOTE_TAG_ID,
        relays: [],
      },
    ]);
  });
});

describe("extractMentionedEventRefs", () => {
  it("includes q tags, inline references, and e tags", () => {
    const event = {
      content: `see nostr:${QUOTED_POLL_NEVENT}`,
      tags: [
        ["q", "b".repeat(64), "wss://relay.example/"],
        ["e", "d".repeat(64), "wss://relay.damus.io/"],
      ],
    } as Event;

    expect(extractMentionedEventRefs(event)).toEqual([
      { id: "b".repeat(64), relays: ["wss://relay.example"] },
      {
        id: QUOTED_POLL_ID,
        relays: ["wss://relay.damus.io", "wss://offchain.pub"],
      },
      { id: "d".repeat(64), relays: ["wss://relay.damus.io"] },
    ]);
  });
});
