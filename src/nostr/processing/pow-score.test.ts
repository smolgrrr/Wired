import { describe, expect, it, vi } from "vitest";
import { Event } from "nostr-tools";
import { verifyPow } from "../../shared/pow/core";
import {
  eventWork,
  replyWork,
  totalWork,
  replyEquivalentDifficulty,
  workScoreBreakdown,
} from "./pow-score";

vi.mock("../../shared/pow/core", () => ({
  verifyPow: (event: Event) =>
    Number(event.tags.find((tag) => tag[0] === "nonce")?.[2] ?? 0),
}));

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

  it("replyWork mirrors reply PoW when it meets the minimum difficulty", () => {
    const reply = event({ tags: [["nonce", "1", "16"]] });

    expect(replyWork(reply, { minReplyDifficulty: 16 })).toBe(Math.pow(2, 16));
  });

  it("replyWork ignores replies below the minimum difficulty", () => {
    const reply = event({ tags: [["nonce", "1", "15"]] });

    expect(replyWork(reply, { minReplyDifficulty: 16 })).toBe(0);
  });

  it("totalWork sums root work and qualifying reply work", () => {
    const root = event();
    const qualifyingReply = event({ tags: [["nonce", "1", "16"]] });
    const ignoredReply = event({ tags: [["nonce", "1", "15"]] });

    expect(
      totalWork(root, [qualifyingReply, ignoredReply], {
        minReplyDifficulty: 16,
      }),
    ).toBe(eventWork(root) + replyWork(qualifyingReply));
  });

  it("sixteen 16-PoW replies equal one 20-PoW event worth of reply work", () => {
    const replies = Array.from({ length: 16 }, (_, index) =>
      event({
        id: String(index).padStart(64, "0"),
        tags: [["nonce", String(index), "16"]],
      }),
    );

    const { replyWork: totalReplyWork, rankingReplyCount } = workScoreBreakdown(
      event({ tags: [["nonce", "root", "0"]] }),
      replies,
      { minReplyDifficulty: 16 },
    );

    expect(totalReplyWork).toBe(Math.pow(2, 20));
    expect(totalReplyWork).toBe(eventWork(event({ tags: [["nonce", "1", "20"]] })));
    expect(rankingReplyCount).toBe(16);
  });

  it("replyEquivalentDifficulty is zero for empty replies", () => {
    expect(replyEquivalentDifficulty([])).toBe(0);
  });
});
