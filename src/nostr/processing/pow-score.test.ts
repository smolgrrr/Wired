import { describe, expect, it } from "vitest";
import { Event } from "nostr-tools";
import { verifyPow } from "../../shared/pow/core";
import { eventWork, replyWork, totalWork, replyEquivalentDifficulty } from "./pow-score";

const event = (overrides: Partial<Event> = {}): Event => ({
  id: "f".repeat(64),
  pubkey: "a".repeat(64),
  created_at: 1,
  kind: 1,
  tags: [["nonce", "1", "21"]],
  content: "hello",
  sig: "b".repeat(128),
  ...overrides,
});

describe("pow-score", () => {
  it("eventWork mirrors verifyPow exponent", () => {
    const evt = event();
    expect(eventWork(evt)).toBe(Math.pow(2, verifyPow(evt)));
  });

  it("replyWork uses zero-prefix gate", () => {
    const zeroPrefix = event({ id: "0" + "f".repeat(63) });
    const other = event({ id: "f".repeat(64) });
    expect(replyWork(other)).toBe(1);
    expect(replyWork(zeroPrefix)).toBe(Math.pow(2, verifyPow(zeroPrefix)));
  });

  it("totalWork sums event and reply work", () => {
    const root = event();
    const reply = event({ id: "f".repeat(64) });
    expect(totalWork(root, [reply])).toBe(eventWork(root) + replyWork(reply));
  });

  it("replyEquivalentDifficulty is zero for empty replies", () => {
    expect(replyEquivalentDifficulty([])).toBe(0);
  });
});