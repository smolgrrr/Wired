import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_BLOSSOM_SERVERS,
  DEFAULT_FILTER_DIFFICULTY,
  DEFAULT_POST_DIFFICULTY,
  DEFAULT_RELAYS,
  configuredHttpUrls,
  configuredRelays,
} from "./config";

describe("DEFAULT_DIFFICULTY", () => {
  it("defaults new posts to signal 20", () => {
    expect(DEFAULT_POST_DIFFICULTY).toBe(20);
    expect(DEFAULT_DIFFICULTY).toBe(DEFAULT_POST_DIFFICULTY);
  });

  it("defaults feed signal filtering to 16", () => {
    expect(DEFAULT_FILTER_DIFFICULTY).toBe(16);
  });
});

describe("DEFAULT_RELAYS", () => {
  it("includes the Wired relay in the main feed relay list", () => {
    expect(DEFAULT_RELAYS).toContain("wss://relay.wiredsignal.online");
  });
});

describe("DEFAULT_BLOSSOM_SERVERS", () => {
  it("provides a default media upload server", () => {
    expect(DEFAULT_BLOSSOM_SERVERS[0]).toMatch(/^https:\/\//);
  });
});

describe("configuredRelays", () => {
  it("uses fallback relays when env is unset", () => {
    expect(configuredRelays(undefined, ["wss://fallback.example"])).toEqual([
      "wss://fallback.example",
    ]);
  });

  it("parses comma-separated wss relay URLs", () => {
    expect(
      configuredRelays(" wss://one.example,https://bad.example,wss://two.example ", [
        "wss://fallback.example",
      ]),
    ).toEqual(["wss://one.example", "wss://two.example"]);
  });

  it("uses fallback relays when env contains no wss URLs", () => {
    expect(configuredRelays("https://bad.example", ["wss://fallback.example"])).toEqual([
      "wss://fallback.example",
    ]);
  });
});

describe("configuredHttpUrls", () => {
  it("uses fallback URLs when env is unset", () => {
    expect(configuredHttpUrls(undefined, ["https://fallback.example"])).toEqual([
      "https://fallback.example",
    ]);
  });

  it("parses comma-separated HTTPS URLs and strips trailing slashes", () => {
    expect(
      configuredHttpUrls(" https://one.example/,http://bad.example,https://two.example/path/ ", [
        "https://fallback.example",
      ]),
    ).toEqual(["https://one.example", "https://two.example/path"]);
  });

  it("uses fallback URLs when env contains no HTTPS URLs", () => {
    expect(configuredHttpUrls("wss://bad.example", ["https://fallback.example"])).toEqual([
      "https://fallback.example",
    ]);
  });
});

describe("QUOTE_FALLBACK_RELAYS", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps default quote fallback relays when enrichment relays are narrowed", async () => {
    vi.stubEnv("VITE_ENRICHMENT_RELAYS", "wss://configured.example");
    vi.resetModules();

    const config = await import("./config");

    expect(config.ENRICHMENT_RELAYS).toEqual(["wss://configured.example"]);
    expect(config.QUOTE_FALLBACK_RELAYS).toEqual([
      ...config.DEFAULT_ENRICHMENT_RELAYS,
      "wss://configured.example",
    ]);
  });
});
