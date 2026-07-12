import { describe, expect, it } from "vitest";
import { renderThreadCard } from "../api/thread-card";

describe("thread social card", () => {
  it("renders a 1200 by 630 PNG", async () => {
    const response = renderThreadCard({
      eventId: "1".repeat(64),
      excerpt: "A useful anonymous signal",
      replyCount: 2,
    });
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  });
});
