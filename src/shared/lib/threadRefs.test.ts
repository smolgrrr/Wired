import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import {
  buildThreadPath,
  decodeThreadRef,
  encodeThreadRef,
  uniqueRelays,
} from "./threadRefs";

const EVENT_ID = "a".repeat(64);
const RELAYS = ["wss://relay.example/", "wss://relay.example", "wss://backup.example"];

describe("threadRefs", () => {
  it("does not add relay hints by default", () => {
    const ref = encodeThreadRef(EVENT_ID);
    const decoded = nip19.decode(ref);

    expect(decoded.type).toBe("nevent");
    if (decoded.type !== "nevent") {
      throw new Error("expected nevent ref");
    }
    expect(decoded.data).toMatchObject({
      id: EVENT_ID,
      relays: [],
    });
    expect(buildThreadPath(EVENT_ID)).toBe(`/thread/${ref}`);
  });

  it("encodes thread routes as nevent refs with relay hints", () => {
    const ref = encodeThreadRef(EVENT_ID, RELAYS);
    const decoded = nip19.decode(ref);

    expect(ref).toMatch(/^nevent1/);
    expect(decoded.type).toBe("nevent");
    if (decoded.type !== "nevent") {
      throw new Error("expected nevent ref");
    }
    expect(decoded.data).toMatchObject({
      id: EVENT_ID,
      relays: ["wss://relay.example", "wss://backup.example"],
    });
    expect(buildThreadPath(EVENT_ID, RELAYS)).toBe(`/thread/${ref}`);
  });

  it("decodes nevent refs to event ids and relay hints", () => {
    const ref = encodeThreadRef(EVENT_ID, RELAYS);

    expect(decodeThreadRef(ref)).toEqual({
      id: EVENT_ID,
      relays: ["wss://relay.example", "wss://backup.example"],
    });
  });

  it("preserves compatibility with legacy note refs", () => {
    expect(decodeThreadRef(nip19.noteEncode(EVENT_ID))).toEqual({
      id: EVENT_ID,
      relays: [],
    });
  });

  it("normalizes duplicate relay hints", () => {
    expect(uniqueRelays(RELAYS)).toEqual([
      "wss://relay.example",
      "wss://backup.example",
    ]);
  });
});
