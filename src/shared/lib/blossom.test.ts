// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event, EventTemplate } from "nostr-tools";
import {
  isSupportedMediaFile,
  sha256File,
  uploadMediaFile,
  type BlossomAuthSigner,
} from "./blossom";

function decodeAuthHeader(header: string): Event {
  const token = header.replace(/^Nostr\s+/, "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = token.padEnd(Math.ceil(token.length / 4) * 4, "=");
  return JSON.parse(atob(padded));
}

function testSigner(template: EventTemplate): Event {
  return {
    ...template,
    id: "1".repeat(64),
    pubkey: "2".repeat(64),
    sig: "3".repeat(128),
  };
}

describe("Blossom media uploads", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hashes files with SHA-256", async () => {
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });

    await expect(sha256File(file)).resolves.toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("validates supported media types and size", () => {
    expect(isSupportedMediaFile(new File(["x"], "x.png", { type: "image/png" }))).toBe(true);
    expect(isSupportedMediaFile(new File(["x"], "x.txt", { type: "text/plain" }))).toBe(false);
  });

  it("falls back from /media to /upload and returns uploaded media metadata", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        url: "https://cdn.example/video.mp4",
        sha256: "abc123",
        size: 4,
        type: "video/mp4",
        nip94: [
          ["url", "https://cdn.example/video.mp4"],
          ["thumb", "https://cdn.example/thumb.webp"],
          ["blurhash", "abc"],
        ],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["data"], "clip.mp4", { type: "video/mp4" });
    const uploaded = await uploadMediaFile({
      file,
      signer: testSigner as BlossomAuthSigner,
      servers: ["https://blossom.example/"],
    });

    expect(uploaded).toEqual({
      url: "https://cdn.example/video.mp4",
      mime: "video/mp4",
      sha256: "abc123",
      size: 4,
      imetaFields: ["thumb https://cdn.example/thumb.webp", "blurhash abc"],
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://blossom.example/media",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://blossom.example/upload",
      expect.objectContaining({ method: "PUT" }),
    );

    const secondCall = fetchMock.mock.calls[1][1] as RequestInit;
    const headers = secondCall.headers as Record<string, string>;
    const authEvent = decodeAuthHeader(headers.Authorization);

    expect(headers["Content-Type"]).toBe("video/mp4");
    expect(headers["X-Content-Length"]).toBe("4");
    expect(headers["X-SHA-256"]).toBe(
      "3a6eb0790f39ac87c94f3856b2dd2c5d110e6811602261a9a923d3bb23adc8b7",
    );
    expect(authEvent.kind).toBe(24242);
    expect(authEvent.tags).toContainEqual(["t", "upload"]);
    expect(authEvent.tags).toContainEqual(["server", "blossom.example"]);
    expect(authEvent.tags).toContainEqual([
      "x",
      "3a6eb0790f39ac87c94f3856b2dd2c5d110e6811602261a9a923d3bb23adc8b7",
    ]);
  });
});
