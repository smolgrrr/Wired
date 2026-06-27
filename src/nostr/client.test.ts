import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RELAYS, ENRICHMENT_RELAYS } from "../config";

const relayPoolMocks = vi.hoisted(() => ({
  instances: [] as Array<{
    connect: ReturnType<typeof vi.fn>;
    ensureConnected: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    isConnected: boolean;
  }>,
}));

vi.mock("./relay-pool", () => ({
  RelayPool: vi.fn().mockImplementation(() => {
    const instance = {
      connect: vi.fn().mockResolvedValue(undefined),
      ensureConnected: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockResolvedValue(new Set()),
      isConnected: true,
    };
    relayPoolMocks.instances.push(instance);
    return instance;
  }),
}));

vi.mock("./subscription-registry", () => ({
  SubscriptionRegistry: vi.fn().mockImplementation(() => ({})),
}));

describe("nostr client relay sets", () => {
  beforeEach(() => {
    vi.resetModules();
    relayPoolMocks.instances.length = 0;
  });

  it("uses enrichment relays for thread, quote, and profile lookups", async () => {
    const { PROFILE_RELAYS, QUOTE_RELAYS, THREAD_RELAYS } = await import("./client");
    const expectedRelays = [...new Set([...DEFAULT_RELAYS, ...ENRICHMENT_RELAYS])];

    expect(THREAD_RELAYS).toEqual(expectedRelays);
    expect(QUOTE_RELAYS).toEqual(expectedRelays);
    expect(PROFILE_RELAYS).toEqual(expectedRelays);
  });

  it("connects default relays and enrichment relays during initialization", async () => {
    const { initNostr } = await import("./client");

    await initNostr();

    expect(relayPoolMocks.instances).toHaveLength(1);
    expect(relayPoolMocks.instances[0].connect).toHaveBeenCalledWith(DEFAULT_RELAYS);
    expect(relayPoolMocks.instances[0].ensureConnected).toHaveBeenCalledWith(ENRICHMENT_RELAYS);
  });
});
