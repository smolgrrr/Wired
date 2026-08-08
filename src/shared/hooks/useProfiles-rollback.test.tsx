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

vi.mock("../../config", () => ({
  PROFILE_REQUEST_JOIN_ENABLED: false,
}));

import { useProfile } from "./useProfiles";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ pubkey }: { pubkey: string }) {
  useProfile(pubkey);
  return null;
}

describe("useProfiles rollback", () => {
  const containers: HTMLDivElement[] = [];

  afterEach(() => {
    containers.splice(0).forEach((container) => container.remove());
    mocks.subProfilesOnce.mockReset();
  });

  it("restores legacy staggered requests when in-flight joining is disabled", async () => {
    mocks.subProfilesOnce.mockResolvedValue({ id: "profiles", close: vi.fn() });
    const pubkey = "f".repeat(64);
    const container = document.createElement("div");
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Probe pubkey={pubkey} />);
      await Promise.resolve();
    });
    await act(async () => {
      root.render(
        <>
          <Probe pubkey={pubkey} />
          <Probe pubkey={pubkey} />
        </>,
      );
      await Promise.resolve();
    });

    expect(mocks.subProfilesOnce).toHaveBeenCalledTimes(2);
    await act(async () => {
      mocks.subProfilesOnce.mock.calls.forEach((call) => {
        (call[2] as (() => void) | undefined)?.();
      });
      root.unmount();
    });
  });
});
