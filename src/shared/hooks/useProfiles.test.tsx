// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  subProfilesOnce: vi.fn(),
}));

vi.mock("../../nostr/subscriptions", () => ({
  subProfilesOnce: mocks.subProfilesOnce,
}));

import { useProfile } from "./useProfiles";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ pubkey }: { pubkey: string }) {
  useProfile(pubkey);
  return null;
}

describe("useProfiles batching", () => {
  const containers: HTMLDivElement[] = [];

  afterEach(() => {
    containers.splice(0).forEach((container) => container.remove());
    mocks.subProfilesOnce.mockReset();
  });

  it("batches same-task consumers but re-queries a pubkey mounted while its request is live", async () => {
    mocks.subProfilesOnce.mockResolvedValue({ id: "profiles", close: vi.fn() });
    const pubkey = "a".repeat(64);
    const container = document.createElement("div");
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <>
          <Probe pubkey={pubkey} />
          <Probe pubkey={pubkey} />
        </>,
      );
      await Promise.resolve();
    });

    expect(mocks.subProfilesOnce).toHaveBeenCalledTimes(1);
    expect(mocks.subProfilesOnce.mock.calls[0]?.[0]).toEqual([pubkey]);

    await act(async () => {
      root.render(
        <>
          <Probe pubkey={pubkey} />
          <Probe pubkey={pubkey} />
          <Probe pubkey={pubkey} />
        </>,
      );
      await Promise.resolve();
    });

    expect(mocks.subProfilesOnce).toHaveBeenCalledTimes(2);
    expect(mocks.subProfilesOnce.mock.calls[1]?.[0]).toEqual([pubkey]);

    await act(async () => root.unmount());
  });
});
