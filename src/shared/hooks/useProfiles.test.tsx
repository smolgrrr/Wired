// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event } from "nostr-tools";

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
  const profile = useProfile(pubkey);
  return <span data-pubkey={pubkey}>{profile?.name}</span>;
}

function profileEvent(pubkey: string, name: string, createdAt: number, id: string): Event {
  return {
    id,
    pubkey,
    created_at: createdAt,
    kind: 0,
    tags: [],
    content: JSON.stringify({ name }),
    sig: "c".repeat(128),
  };
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

  it("keeps the newest competing profile and serves later consumers from cache", async () => {
    const close = vi.fn();
    mocks.subProfilesOnce.mockResolvedValue({ id: "profiles", close });
    const pubkey = "b".repeat(64);
    const container = document.createElement("div");
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Probe pubkey={pubkey} />);
      await Promise.resolve();
    });
    expect(mocks.subProfilesOnce).toHaveBeenCalledTimes(1);

    const onEvent = mocks.subProfilesOnce.mock.calls[0]?.[1] as
      | ((event: Event) => void)
      | undefined;
    const onEose = mocks.subProfilesOnce.mock.calls[0]?.[2] as
      | (() => void)
      | undefined;
    expect(onEvent).toBeDefined();
    await act(async () => {
      onEvent?.(profileEvent(pubkey, "older", 10, "1".repeat(64)));
      onEvent?.(profileEvent(pubkey, "newest", 20, "2".repeat(64)));
      onEvent?.(profileEvent(pubkey, "stale", 15, "3".repeat(64)));
      onEose?.();
    });
    expect(container.textContent).toBe("newest");
    expect(close).toHaveBeenCalledOnce();

    await act(async () => {
      root.render(
        <>
          <Probe pubkey={pubkey} />
          <Probe pubkey={pubkey} />
        </>,
      );
      await Promise.resolve();
    });
    expect(container.textContent).toBe("newestnewest");
    expect(mocks.subProfilesOnce).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it("allows a later consumer to retry after a completed profile miss", async () => {
    mocks.subProfilesOnce.mockResolvedValue({ id: "profiles", close: vi.fn() });
    const pubkey = "c".repeat(64);
    const firstContainer = document.createElement("div");
    document.body.append(firstContainer);
    containers.push(firstContainer);
    const firstRoot = createRoot(firstContainer);

    await act(async () => {
      firstRoot.render(<Probe pubkey={pubkey} />);
      await Promise.resolve();
    });
    expect(mocks.subProfilesOnce).toHaveBeenCalledTimes(1);
    const onEose = mocks.subProfilesOnce.mock.calls[0]?.[2] as
      | (() => void)
      | undefined;
    await act(async () => {
      onEose?.();
      firstRoot.unmount();
    });

    const laterContainer = document.createElement("div");
    document.body.append(laterContainer);
    containers.push(laterContainer);
    const laterRoot = createRoot(laterContainer);
    await act(async () => {
      laterRoot.render(<Probe pubkey={pubkey} />);
      await Promise.resolve();
    });

    expect(mocks.subProfilesOnce).toHaveBeenCalledTimes(2);
    expect(mocks.subProfilesOnce.mock.calls[1]?.[0]).toEqual([pubkey]);
    await act(async () => laterRoot.unmount());
  });
});
