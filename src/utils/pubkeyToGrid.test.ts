import { describe, expect, it } from "vitest";
import { pubkeyToGrid } from "./pubkeyToGrid";

const SAMPLE_PUBKEY = "a".repeat(64);

describe("pubkeyToGrid", () => {
  it("returns 16 deterministic bits for a pubkey", () => {
    const first = pubkeyToGrid(SAMPLE_PUBKEY);
    const second = pubkeyToGrid(SAMPLE_PUBKEY);

    expect(first).toHaveLength(16);
    expect(second).toEqual(first);
  });

  it("changes pattern for different pubkeys", () => {
    const gridA = pubkeyToGrid(SAMPLE_PUBKEY);
    const gridB = pubkeyToGrid("b".repeat(64));

    expect(gridB).not.toEqual(gridA);
  });

  it("matches expected vector for sample pubkey", () => {
    expect(pubkeyToGrid(SAMPLE_PUBKEY)).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      true,
      true,
      false,
      true,
      false,
      true,
    ]);
  });
});