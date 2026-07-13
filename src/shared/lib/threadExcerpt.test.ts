import { describe, expect, it } from "vitest";
import { cleanThreadExcerpt, THREAD_EXCERPT_MAX_LENGTH } from "./threadExcerpt";

describe("cleanThreadExcerpt", () => {
  it("removes links and normalizes whitespace", () => {
    expect(
      cleanThreadExcerpt("  a signal\nwith https://example.com/media.jpg   context "),
    ).toBe("a signal with context");
  });

  it("truncates long excerpts with an ellipsis", () => {
    const excerpt = cleanThreadExcerpt("x".repeat(THREAD_EXCERPT_MAX_LENGTH + 20));
    expect(excerpt).toHaveLength(THREAD_EXCERPT_MAX_LENGTH);
    expect(excerpt.endsWith("…")).toBe(true);
  });
});
