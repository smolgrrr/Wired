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
const ISSUE_64_THREAD_NEVENT =
  "nevent1qqsqqqzhl26q0wdwelm6thc8v02n6crrelwwlgl5mhezdvq7lu32j7spz3mhxue69uhhyetvv9ujuerpd46hxtnfduq3vamnwvaz7tmjv4kxz7fwwpexjmtpdshxuet5qy2hwumn8ghj7ur0wuh8yetvv9uhxtnvv9hxgqg7waehxw309aex2mrp0yh8w6tjv4j8x6t8deskctn0dekxjmn9qgsrla93hqmv0e37ujk08yf8pkrxpcdh4att49r5hy5r3wc8ne6jslgrqsqqqqqpspq99w";

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

  it("decodes the issue 64 nevent and relay hints", () => {
    expect(decodeThreadRef(ISSUE_64_THREAD_NEVENT)).toEqual({
      id: "000057fab407b9aecff7a5df0763d53d6063cfdcefa3f4ddf226b01eff22a97a",
      relays: [
        "wss://relay.damus.io",
        "wss://relay.primal.net",
        "wss://pow.relays.land",
        "wss://relay.wiredsignal.online",
      ],
    });
  });
});
