import { describe, expect, it } from "vitest";
import {
  buildReplyFilter,
  buildThreadReplyFilter,
  clampReplyDepth,
  MAX_REPLY_FETCH_DEPTH,
  MAX_REPLY_PARENT_IDS,
  profileQueryLimit,
  PROFILE_QUERY_LIMIT,
  REPLY_QUERY_LIMIT,
  sinceFromAgeHours,
} from "./query-limits";

describe("query limits", () => {
  it("builds bounded reply filters", () => {
    const parentIds = Array.from({ length: MAX_REPLY_PARENT_IDS + 1 }, (_, index) =>
      String(index).padStart(64, "0"),
    );

    expect(buildReplyFilter(parentIds, 123)).toEqual({
      "#e": parentIds.slice(0, MAX_REPLY_PARENT_IDS),
      kinds: [1],
      since: 123,
      limit: REPLY_QUERY_LIMIT,
    });
  });

  it("does not build empty reply filters", () => {
    expect(buildReplyFilter([], 123)).toBeNull();
    expect(buildThreadReplyFilter([])).toBeNull();
  });

  it("builds thread reply filters without age bounds", () => {
    expect(buildThreadReplyFilter(["1".repeat(64)])).toEqual({
      "#e": ["1".repeat(64)],
      kinds: [1],
      limit: REPLY_QUERY_LIMIT,
    });
  });

  it("clamps reply depth and computes age windows", () => {
    expect(clampReplyDepth(MAX_REPLY_FETCH_DEPTH + 10)).toBe(MAX_REPLY_FETCH_DEPTH);
    expect(clampReplyDepth(-1)).toBe(0);
    expect(sinceFromAgeHours(24, 100_000)).toBe(13_600);
  });

  it("caps profile query limits", () => {
    expect(profileQueryLimit(10)).toBe(10);
    expect(profileQueryLimit(PROFILE_QUERY_LIMIT + 1)).toBe(PROFILE_QUERY_LIMIT);
  });
});
