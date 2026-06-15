import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./link";

describe("normalizeUrl", () => {
  it("accepts http and https URLs", () => {
    expect(normalizeUrl("https://example.com/page")).toBe("https://example.com/page");
    expect(normalizeUrl("http://example.com")).toBe("http://example.com/");
  });

  it("rejects non-http(s) schemes", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBe("");
    expect(normalizeUrl("ftp://example.com")).toBe("");
    expect(normalizeUrl("data:text/html,hi")).toBe("");
  });

  it("returns empty string for invalid URLs", () => {
    expect(normalizeUrl("not a url")).toBe("");
    expect(normalizeUrl("")).toBe("");
  });
});