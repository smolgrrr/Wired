// @vitest-environment jsdom

import { act } from "react";
import type { ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PowTransmitStatus } from "./PowTransmitStatus";

type ReactActGlobal = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

describe("PowTransmitStatus", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as ReactActGlobal).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as ReactActGlobal).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function renderStatus(props: Partial<ComponentProps<typeof PowTransmitStatus>> = {}) {
    act(() => {
      root.render(
        <PowTransmitStatus
          active={false}
          difficulty="1"
          hashrate={10}
          {...props}
        />,
      );
    });
  }

  it("describes mining progress while work is active", () => {
    renderStatus({ active: true, status: "mining", bestPow: 4 });

    expect(container.querySelector("[role='status']")?.textContent).toContain("mining signal");
    expect(container.querySelector("[role='status']")?.textContent).toContain("ETA");
    expect(container.querySelector("[role='status']")?.textContent).toContain("best signal 4");
  });

  it("describes relay publishing", () => {
    renderStatus({ active: true, status: "publishing" });

    expect(container.querySelector("[role='status']")?.textContent).toBe("publishing to relays…");
  });

  it("keeps the posted state visible after active work ends", () => {
    renderStatus({ active: false, status: "published", acceptedRelayCount: 2 });

    expect(container.querySelector("[role='status']")?.textContent).toBe("posted to 2 relays");
  });
});
