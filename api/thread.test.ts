import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "./thread";

describe("thread HTML handler", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("serves the SPA shell with crawler metadata for invalid references", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        '<html><head><meta name="description" content="The Wired" /><title>The Wired</title></head><body></body></html>',
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const headers = new Map<string, string>();
    let status = 0;
    let body = "";
    const response = {
      setHeader: (name: string, value: string) => headers.set(name, value),
      status: (nextStatus: number) => {
        status = nextStatus;
        return response;
      },
      send: (value: string) => {
        body = value;
        return response;
      },
    };

    await handler(
      {
        method: "GET",
        query: { id: "invalid" },
        headers: { host: "wiredsignal.online", "x-forwarded-proto": "https" },
      } as never,
      response as never,
    );

    expect(status).toBe(200);
    expect(headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(headers.get("Cache-Control")).toContain("stale-while-revalidate");
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://wiredsignal.online/"),
      expect.objectContaining({ headers: expect.objectContaining({ Accept: "text/html" }) }),
    );
    expect(body).toContain('property="og:title" content="Wired"');
    expect(body).toContain('rel="canonical" href="https://wiredsignal.online/thread/invalid"');
    expect(body).toContain("/api/thread-card?id=invalid&amp;replies=0");
  });
});
