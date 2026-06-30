// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Event, UnsignedEvent } from "nostr-tools";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSubmitForm } from "./useSubmitForm";

const mocks = vi.hoisted(() => ({
  appendKey: vi.fn(),
  publish: vi.fn(),
}));
let mockWorkers: MockWorker[] = [];

vi.mock("nostr-tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("nostr-tools")>();
  return {
    ...actual,
    generateSecretKey: () => new Uint8Array(32).fill(1),
    getPublicKey: () => "f".repeat(64),
    finalizeEvent: (event: UnsignedEvent) => ({
      ...event,
      id: "1".repeat(64),
      pubkey: "f".repeat(64),
      sig: "2".repeat(128),
    }),
  };
});

vi.mock("../../nostr/client", () => ({
  publish: mocks.publish,
}));

vi.mock("./useStoredKeys", () => ({
  useStoredKeys: () => ({ appendKey: mocks.appendKey }),
}));

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    mockWorkers.push(this);
  }

  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }

  fail() {
    this.onerror?.({} as ErrorEvent);
  }
}

const unsigned: UnsignedEvent = {
  kind: 1,
  tags: [["client", "getwired.app"]],
  content: "test reply",
  created_at: 1,
  pubkey: "",
};

const minedEvent = {
  ...unsigned,
  id: "1".repeat(64),
  pubkey: "f".repeat(64),
  tags: [...unsigned.tags, ["nonce", "1", "1"]],
};

function Probe({ onState }: { onState: (state: ReturnType<typeof useSubmitForm>) => void }) {
  const state = useSubmitForm(unsigned, "1");
  onState(state);

  return (
    <form onSubmit={state.handleSubmit}>
      <button type="submit">submit</button>
    </form>
  );
}

describe("useSubmitForm", () => {
  let container: HTMLDivElement;
  let root: Root;
  let state: ReturnType<typeof useSubmitForm>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockWorkers = [];
    mocks.appendKey.mockReset();
    mocks.publish.mockReset();
    vi.stubGlobal("Worker", MockWorker);
    Object.defineProperty(window.navigator, "hardwareConcurrency", {
      configurable: true,
      value: 1,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  async function submitForm() {
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  }

  it("does not expose a posted event when no relay accepts the publish", async () => {
    mocks.publish.mockResolvedValue(new Set<string>());

    act(() => {
      root.render(<Probe onState={(nextState) => (state = nextState)} />);
    });

    await submitForm();

    await act(async () => {
      mockWorkers[0].emit({ type: "found", event: minedEvent });
    });

    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(state.signedPoWEvent).toBeUndefined();
    expect(state.submitStatus).toBe("failed");
    expect(state.submitError).toMatch(/No relay accepted/);
    expect(state.acceptedRelays).toEqual([]);
    expect(mocks.appendKey).not.toHaveBeenCalled();
  });

  it("exposes a posted event after at least one relay accepts it", async () => {
    mocks.publish.mockResolvedValue(new Set<string>(["wss://relay.example"]));

    act(() => {
      root.render(<Probe onState={(nextState) => (state = nextState)} />);
    });

    await submitForm();

    await act(async () => {
      mockWorkers[0].emit({ type: "found", event: minedEvent });
    });

    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect((state.signedPoWEvent as Event | undefined)?.content).toBe("test reply");
    expect(state.submitStatus).toBe("published");
    expect(state.submitError).toBeNull();
    expect(state.acceptedRelays).toEqual(["wss://relay.example"]);
    expect(mocks.appendKey).toHaveBeenCalledTimes(1);
  });

  it("does not expose a posted event when publish rejects", async () => {
    mocks.publish.mockRejectedValue(new Error("relay failure"));

    act(() => {
      root.render(<Probe onState={(nextState) => (state = nextState)} />);
    });

    await submitForm();

    await act(async () => {
      mockWorkers[0].emit({ type: "found", event: minedEvent });
    });

    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(state.signedPoWEvent).toBeUndefined();
    expect(state.submitStatus).toBe("failed");
    expect(state.submitError).toMatch(/Publishing failed/);
    expect(state.acceptedRelays).toEqual([]);
    expect(mocks.appendKey).not.toHaveBeenCalled();
  });

  it("terminates active mining workers on unmount", async () => {
    mocks.publish.mockResolvedValue(new Set<string>(["wss://relay.example"]));

    act(() => {
      root.render(<Probe onState={(nextState) => (state = nextState)} />);
    });

    await submitForm();

    const worker = mockWorkers[0];

    act(() => {
      root.unmount();
    });

    await act(async () => {
      worker.emit({ type: "found", event: minedEvent });
    });

    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("ignores superseded mining work", async () => {
    mocks.publish.mockResolvedValue(new Set<string>(["wss://relay.example"]));

    act(() => {
      root.render(<Probe onState={(nextState) => (state = nextState)} />);
    });

    await submitForm();
    const firstWorker = mockWorkers[0];

    await submitForm();
    const secondWorker = mockWorkers[1];

    await act(async () => {
      firstWorker.emit({ type: "found", event: { ...minedEvent, content: "old" } });
      secondWorker.emit({ type: "found", event: minedEvent });
    });

    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect((state.signedPoWEvent as Event | undefined)?.content).toBe("test reply");
    expect(state.submitStatus).toBe("published");
  });

  it("reports mining worker failures", async () => {
    act(() => {
      root.render(<Probe onState={(nextState) => (state = nextState)} />);
    });

    await submitForm();

    act(() => {
      mockWorkers[0].fail();
    });

    expect(mocks.publish).not.toHaveBeenCalled();
    expect(state.submitStatus).toBe("failed");
    expect(state.submitError).toMatch(/Mining failed/);
    expect(state.acceptedRelays).toEqual([]);
  });
});
