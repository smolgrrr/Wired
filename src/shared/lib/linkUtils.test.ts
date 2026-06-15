import { describe, expect, it } from "vitest";
import { extractLinkUrls, stripLinkUrls } from "./linkUtils";

describe("extractLinkUrls", () => {
  it("extracts non-media URLs in source order", () => {
    const content = "see https://a.com/one and https://b.com/two";
    expect(extractLinkUrls(content)).toEqual([
      { url: "https://a.com/one" },
      { url: "https://b.com/two" },
    ]);
  });

  it("dedupes repeated URLs", () => {
    const content = "https://example.com https://example.com";
    expect(extractLinkUrls(content)).toEqual([{ url: "https://example.com/" }]);
  });

  it("skips media extension URLs", () => {
    const content = "pic https://example.com/a.jpg page https://example.com/page";
    expect(extractLinkUrls(content)).toEqual([{ url: "https://example.com/page" }]);
  });

  it("skips URLs already classified as media", () => {
    const known = new Set(["https://example.com/page"]);
    const content = "https://example.com/page";
    expect(extractLinkUrls(content, known)).toEqual([]);
  });

  it("rejects non-http(s) schemes", () => {
    const content = "javascript:alert(1) data:text/html,hi";
    expect(extractLinkUrls(content)).toEqual([]);
  });
});

describe("stripLinkUrls", () => {
  it("removes link URLs and cleans whitespace", () => {
    const links = [{ url: "https://example.com/page" }];
    const content = "before https://example.com/page\n\nafter";
    expect(stripLinkUrls(content, links)).toBe("before\n\nafter");
  });

  it("returns content unchanged when links array is empty", () => {
    expect(stripLinkUrls("hello", [])).toBe("hello");
  });
});