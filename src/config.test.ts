import { describe, expect, it } from "vitest";
import { configuredRelays } from "./config";

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
