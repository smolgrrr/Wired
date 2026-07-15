// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Event } from "nostr-tools";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refs: [] as Array<{ id: string; relays: string[] }>,
  loadFeedBootstrapSnapshot: vi.fn(),
  seedProfiles: vi.fn(),
  snapshotEventById: vi.fn(),
  subQuotedEventsOnce: vi.fn(),
}));

vi.mock("@lib/quotedEvents", () => ({
  extractQuotedRefs: () => mocks.refs,
}));

vi.mock("../lib/feedBootstrapClient", () => ({
  loadFeedBootstrapSnapshot: mocks.loadFeedBootstrapSnapshot,
  snapshotEventById: mocks.snapshotEventById,
}));

vi.mock("./useProfiles", () => ({
  seedProfiles: mocks.seedProfiles,
}));

vi.mock("../../nostr/subscriptions", () => ({
  subQuotedEventsOnce: mocks.subQuotedEventsOnce,
}));

import { useQuotedEvents } from "./useQuotedEvents";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const hostEvent = (id: string): Event => ({
  id,
  pubkey: "a".repeat(64),
  created_at: 1,
  kind: 1,
  tags: [],
  content: "host",
  sig: "b".repeat(128),
});

function Probe({ event }: { event: Event }) {
  const state = useQuotedEvents(event);
  return (
    <output
      data-quoted={state.quotedEvents.map((item) => item.id).join(",")}
      data-pending={state.pendingRefs.map((item) => item.id).join(",")}
      data-failed={state.failedRefs.map((item) => item.id).join(",")}
    />
  );
}

describe("useQuotedEvents snapshot and relay ownership", () => {
  const roots: ReturnType<typeof createRoot>[] = [];
  const containers: HTMLDivElement[] = [];

  beforeEach(() => {
    mocks.refs = [];
    mocks.loadFeedBootstrapSnapshot.mockReset();
    mocks.seedProfiles.mockReset();
    mocks.snapshotEventById.mockReset();
    mocks.subQuotedEventsOnce.mockReset();
  });

  afterEach(async () => {
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    containers.splice(0).forEach((container) => container.remove());
  });

  async function renderProbe() {
    const container = document.createElement("div");
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => {
      root.render(<Probe event={hostEvent("9".repeat(64))} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    return { container, root };
  }

  it("serves a snapshot hit with zero relay subscriptions", async () => {
    const quoted = hostEvent("1".repeat(64));
    mocks.refs = [{ id: quoted.id, relays: ["wss://hint.example"] }];
    mocks.loadFeedBootstrapSnapshot.mockResolvedValue({ profiles: {} });
    mocks.snapshotEventById.mockReturnValue(new Map([[quoted.id, quoted]]));

    const { container } = await renderProbe();

    expect(container.querySelector("output")?.dataset).toMatchObject({
      quoted: quoted.id,
      pending: "",
      failed: "",
    });
    expect(mocks.subQuotedEventsOnce).not.toHaveBeenCalled();
  });

  it("falls through on a snapshot miss and marks only completed missing refs failed", async () => {
    const quoted = hostEvent("2".repeat(64));
    const missingId = "3".repeat(64);
    mocks.refs = [
      { id: quoted.id, relays: ["wss://hint.example"] },
      { id: missingId, relays: [] },
    ];
    mocks.loadFeedBootstrapSnapshot.mockResolvedValue({ profiles: {} });
    mocks.snapshotEventById.mockReturnValue(new Map());
    const close = vi.fn();
    mocks.subQuotedEventsOnce.mockResolvedValue({ id: "quotes", close });

    const { container } = await renderProbe();
    expect(mocks.subQuotedEventsOnce).toHaveBeenCalledTimes(1);
    expect(mocks.subQuotedEventsOnce.mock.calls[0]?.[0]).toEqual(mocks.refs);
    const onEvent = mocks.subQuotedEventsOnce.mock.calls[0]?.[1] as
      | ((event: Event) => void)
      | undefined;
    const onEose = mocks.subQuotedEventsOnce.mock.calls[0]?.[2] as
      | ((id: string) => void)
      | undefined;

    await act(async () => {
      onEvent?.(quoted);
      onEose?.(quoted.id);
      onEose?.(missingId);
    });
    expect(container.querySelector("output")?.dataset).toMatchObject({
      quoted: quoted.id,
      pending: "",
      failed: missingId,
    });
  });

  it("falls through when the snapshot request errors", async () => {
    const quoted = hostEvent("4".repeat(64));
    mocks.refs = [{ id: quoted.id, relays: [] }];
    mocks.loadFeedBootstrapSnapshot.mockRejectedValue(new Error("offline"));
    mocks.subQuotedEventsOnce.mockResolvedValue({ id: "quotes", close: vi.fn() });

    await renderProbe();

    expect(mocks.subQuotedEventsOnce).toHaveBeenCalledTimes(1);
    expect(mocks.subQuotedEventsOnce.mock.calls[0]?.[0]).toEqual(mocks.refs);
  });

  it("closes a relay handle that resolves after unmount", async () => {
    const quoted = hostEvent("5".repeat(64));
    mocks.refs = [{ id: quoted.id, relays: ["wss://slow.example"] }];
    mocks.loadFeedBootstrapSnapshot.mockResolvedValue({ profiles: {} });
    mocks.snapshotEventById.mockReturnValue(new Map());
    let resolveHandle: ((handle: { id: string; close(): void }) => void) | undefined;
    mocks.subQuotedEventsOnce.mockReturnValue(new Promise((resolve) => {
      resolveHandle = resolve;
    }));
    const close = vi.fn();

    const { root } = await renderProbe();
    await act(async () => root.unmount());
    roots.splice(roots.indexOf(root), 1);
    await act(async () => {
      resolveHandle?.({ id: "late", close });
      await Promise.resolve();
    });

    expect(close).toHaveBeenCalledOnce();
  });
});
