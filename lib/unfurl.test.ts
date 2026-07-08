import { lookup } from "node:dns/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isSafeUrl, resetUnfurlCachesForTests, unfurlUrl } from "./unfurl";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

const mockedLookup = vi.mocked(lookup);

describe("isSafeUrl", () => {
  it("rejects private hosts and non-standard ports", () => {
    expect(isSafeUrl("http://127.0.0.1/page")).toBe(false);
    expect(isSafeUrl("http://10.0.0.5/page")).toBe(false);
    expect(isSafeUrl("http://example.com:8080/page")).toBe(false);
  });

  it("accepts public http and https URLs on standard ports", () => {
    expect(isSafeUrl("https://example.com/page")).toBe(true);
    expect(isSafeUrl("http://example.com/page")).toBe(true);
  });
});

describe("unfurlUrl", () => {
  beforeEach(() => {
    resetUnfurlCachesForTests();
    mockedLookup.mockReset();
    mockedLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("rejects redirects to private hosts", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "http://127.0.0.1/admin" },
      }),
    );

    await expect(unfurlUrl("https://example.com/post")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows safe redirects and extracts metadata from the final page", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { Location: "/next" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("<html><head><title>Wired link</title></head></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      );

    await expect(unfurlUrl("https://example.com/post")).resolves.toMatchObject({
      title: "Wired link",
      domain: "example.com",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops reading HTML after the head closes", async () => {
    const fetchMock = vi.mocked(fetch);
    const body = [
      "<html><head>",
      '<meta property="og:title" content="Head title">',
      "</head>",
      "<body>",
      "x".repeat(100_000),
    ].join("");
    const encoder = new TextEncoder();
    const encoded = encoder.encode(body);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    });

    fetchMock.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(unfurlUrl("https://example.com/post")).resolves.toMatchObject({
      title: "Head title",
      domain: "example.com",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuses cached DNS lookups across redirect hops", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "/next" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("<html><head><title>Cached DNS</title></head></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      );

    await expect(unfurlUrl("https://example.com/post")).resolves.toMatchObject({
      title: "Cached DNS",
      domain: "example.com",
    });
    expect(mockedLookup).toHaveBeenCalledTimes(1);
  });

  it("uses the final redirect URL as the metadata base", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://cdn.example.org/post" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          '<html><head><meta property="og:image" content="/image.png"></head></html>',
          {
            status: 200,
            headers: { "content-type": "text/html" },
          },
        ),
      );

    await expect(unfurlUrl("https://example.com/post")).resolves.toMatchObject({
      domain: "cdn.example.org",
      image: "https://cdn.example.org/image.png",
    });
  });
});
