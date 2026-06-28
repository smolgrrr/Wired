import { describe, expect, it } from "vitest";
import { getDisplaySegment, getPathDisplay } from "./routeLabelMap";

describe("routeLabelMap", () => {
  it("maps known routes to display segments", () => {
    expect(getDisplaySegment("/")).toBe("");
    expect(getDisplaySegment("/notifications")).toBe("activity");
    expect(getDisplaySegment("/raw")).toBe("raw");
    expect(getDisplaySegment("/settings")).toBe("settings");
    expect(getDisplaySegment("/thread/note1")).toBe("thread");
  });

  it("builds path display labels", () => {
    expect(getPathDisplay("/")).toBe("/");
    expect(getPathDisplay("/notifications")).toBe("/activity");
    expect(getPathDisplay("/raw")).toBe("/raw");
    expect(getPathDisplay("/settings")).toBe("/settings");
    expect(getPathDisplay("/thread/note1")).toBe("/thread");
  });
});
