import { describe, expect, it } from "vitest";
import type { Event } from "nostr-tools";
import { hasNonceTag, verifyPow } from "./core";

const baseEvent = (): Event => ({
  id: "f".repeat(64),
  pubkey: "a".repeat(64),
  created_at: 1,
  kind: 1,
  tags: [],
  content: "hello",
  sig: "b".repeat(128),
});

describe("hasNonceTag", () => {
  it("returns false when nonce tag is missing", () => {
    expect(hasNonceTag(baseEvent())).toBe(false);
  });

  it("returns true when nonce tag is present", () => {
    expect(
      hasNonceTag({
        ...baseEvent(),
        tags: [["nonce", "1", "16"]],
      }),
    ).toBe(true);
  });
});

describe("verifyPow", () => {
  it("returns 0 without hashing when nonce tag is missing", () => {
    expect(verifyPow(baseEvent())).toBe(0);
  });

  it("returns 0 when nonce tag is malformed", () => {
    expect(
      verifyPow({
        ...baseEvent(),
        tags: [["nonce", "1"]],
      }),
    ).toBe(0);
  });
});