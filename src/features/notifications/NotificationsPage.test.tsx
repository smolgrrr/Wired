// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { Event } from "nostr-tools";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NotificationsPage from "./NotificationsPage";
import type { NotificationSyncState } from "../../hooks/useNotificationEvents";

type NotificationState = {
  noteEvents: Event[];
  pubkeys: string[];
  syncState: NotificationSyncState;
};

const mocks = vi.hoisted(() => ({
  notificationState: {
    noteEvents: [] as Event[],
    pubkeys: ["a".repeat(64)],
    syncState: "synced" as NotificationSyncState,
  },
  openThread: vi.fn(),
}));

vi.mock("../../hooks/useNotificationEvents", () => ({
  useNotificationEvents: () => mocks.notificationState,
}));

vi.mock("../thread/useThreadNavigation", () => ({
  useThreadNavigation: () => mocks.openThread,
}));

vi.mock("../../shared/ui/PostCard", () => ({
  PostCard: ({ event }: { event: Event }) => (
    <article data-testid="post-card">{event.content}</article>
  ),
}));

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

function setNotificationState(state: Partial<NotificationState>) {
  mocks.notificationState = {
    noteEvents: [],
    pubkeys: ["a".repeat(64)],
    syncState: "synced",
    ...state,
  };
}

describe("NotificationsPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    setNotificationState({});
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function renderPage() {
    act(() => {
      root.render(
        <MemoryRouter>
          <NotificationsPage />
        </MemoryRouter>,
      );
    });
  }

  it("shows explicit empty states and next actions after sync completes", () => {
    setNotificationState({ syncState: "synced" });

    renderPage();

    expect(container.textContent).toContain("no local transmissions yet");
    expect(container.textContent).toContain("start a transmission");
    expect(container.textContent).toContain("no mentions yet");
    expect(container.querySelector("a[href='/']")).not.toBeNull();
  });

  it("distinguishes syncing from an empty activity result", () => {
    setNotificationState({ syncState: "syncing" });

    renderPage();

    expect(container.textContent).toContain("syncing your transmissions");
    expect(container.textContent).toContain("syncing mentions");
    expect(container.textContent).not.toContain("no local transmissions yet");
    expect(container.textContent).not.toContain("no mentions yet");
  });

  it("shows a degraded state instead of an empty state while relay sync is delayed", () => {
    setNotificationState({ syncState: "degraded" });

    renderPage();

    expect(container.textContent).toContain("activity sync delayed");
    expect(container.textContent).not.toContain("no local transmissions yet");
    expect(container.textContent).not.toContain("no mentions yet");
  });

  it("directs devices without local keys to settings", () => {
    setNotificationState({ pubkeys: [], syncState: "idle" });

    renderPage();

    expect(container.textContent).toContain("no local signal keys");
    expect(container.textContent).toContain("add a signal key");
    expect(container.querySelector("a[href='/settings']")).not.toBeNull();
  });

  it("keeps the mobile segmented view and desktop column visibility classes", () => {
    renderPage();

    expect(container.querySelector("[role='radiogroup']")).not.toBeNull();
    expect(container.querySelector(".hidden.sm\\:grid")).not.toBeNull();
  });
});
