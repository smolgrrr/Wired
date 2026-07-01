import { describe, expect, it } from "vitest";
import { THREAD_RELAYS } from "../config";
import { threadRelayUrls } from "./useThreadEvents";

describe("threadRelayUrls", () => {
  it("uses the same default and hinted relay set for connect and subscribe", () => {
    expect(threadRelayUrls(["wss://relay.example/", THREAD_RELAYS[0]])).toEqual([
      ...THREAD_RELAYS,
      "wss://relay.example",
    ]);
  });
});
