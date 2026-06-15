import { describe, expect, it } from "vitest";
import { Event } from "nostr-tools";
import { decodeNostrRef, extractQuotedEventIds } from "./quotedEvents";

describe("decodeNostrRef", () => {
  it("decodes nevent references to event ids", () => {
    expect(
      decodeNostrRef(
        "nevent1qvzqqqqy9spzpmnw5yatnljuff5w47d35d87q99xddqpzlzsac4xzn6vm22ekmn5qy2hwumn8ghj7un9d3shjtnyv9kh2uewd9hj7qgnwaehxw309ahkvenrdpskjm3wwp6kytcqypyfg2mlnezsrtedn78xdqjkcpjjmjlyr7spqjkvu6k2sx4eluk7yarpf4w",
      ),
    ).toBe("48942b7f9e4501af2d9f8e668256c0652dcbe41fa0104acce6aca81ab9ff2de2");
  });
});

describe("extractQuotedEventIds", () => {
  it("extracts ids from inline nostr references", () => {
    const event = {
      content:
        "Just a reminder\nnostr:nevent1qvzqqqqy9spzpmnw5yatnljuff5w47d35d87q99xddqpzlzsac4xzn6vm22ekmn5qy2hwumn8ghj7un9d3shjtnyv9kh2uewd9hj7qgnwaehxw309ahkvenrdpskjm3wwp6kytcqypyfg2mlnezsrtedn78xdqjkcpjjmjlyr7spqjkvu6k2sx4eluk7yarpf4w",
      tags: [],
    } as unknown as Event;

    expect(extractQuotedEventIds(event)).toEqual([
      "48942b7f9e4501af2d9f8e668256c0652dcbe41fa0104acce6aca81ab9ff2de2",
    ]);
  });

  it("extracts ids from q tags", () => {
    const event = {
      content: "quoting this",
      tags: [
        ["p", "a".repeat(64)],
        ["q", "b".repeat(64)],
      ],
    } as Event;

    expect(extractQuotedEventIds(event)).toEqual(["b".repeat(64)]);
  });

  it("dedupes q tags and inline references to the same event", () => {
    const quotedId = "48942b7f9e4501af2d9f8e668256c0652dcbe41fa0104acce6aca81ab9ff2de2";
    const event = {
      content:
        "see nostr:nevent1qvzqqqqy9spzpmnw5yatnljuff5w47d35d87q99xddqpzlzsac4xzn6vm22ekmn5qy2hwumn8ghj7un9d3shjtnyv9kh2uewd9hj7qgnwaehxw309ahkvenrdpskjm3wwp6kytcqypyfg2mlnezsrtedn78xdqjkcpjjmjlyr7spqjkvu6k2sx4eluk7yarpf4w",
      tags: [["q", quotedId]],
    } as Event;

    expect(extractQuotedEventIds(event)).toEqual([quotedId]);
  });
});