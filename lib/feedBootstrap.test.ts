import { describe, expect, it } from "vitest";
import {
  BOOTSTRAP_AGE_HOURS,
  BOOTSTRAP_FILTER_DIFFICULTY,
  canUseFeedBootstrap,
} from "./feedBootstrap";

describe("canUseFeedBootstrap", () => {
  it("allows the default feed settings", () => {
    expect(
      canUseFeedBootstrap({
        ageHours: BOOTSTRAP_AGE_HOURS,
        filterDifficulty: BOOTSTRAP_FILTER_DIFFICULTY,
      }),
    ).toBe(true);
  });

  it("rejects custom age windows", () => {
    expect(
      canUseFeedBootstrap({
        ageHours: 12,
        filterDifficulty: BOOTSTRAP_FILTER_DIFFICULTY,
      }),
    ).toBe(false);
  });

  it("rejects custom difficulty filters", () => {
    expect(
      canUseFeedBootstrap({
        ageHours: BOOTSTRAP_AGE_HOURS,
        filterDifficulty: BOOTSTRAP_FILTER_DIFFICULTY + 1,
      }),
    ).toBe(false);
  });
});