// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Event, UnsignedEvent } from "nostr-tools";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useSubmitForm } from "./useSubmitForm";

type ReactActGlobal = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const mocks = vi.hoisted(() => ({
  appendKey: vi.fn(),
  publish: vi.fn(),
  fetchWiredAccountStatus: vi.fn(),
  submitWiredAccountPost: vi.fn(),
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

vi.mock("../../features/wiredAccount/api", () => ({
  fetchWiredAccountStatus: mocks.fetchWiredAccountStatus,
  submitWiredAccountPost: mocks.submitWiredAccountPost,
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

const disabledWiredAccountStatus = {
  configured: false,
  pubkey: "",
  minimumPow: 16,
};

const wiredPubkey = "a".repeat(64);
const configuredWiredAccountStatus = {
  configured: true,
  pubkey: wiredPubkey,
  minimumPow: 1,
};

function Probe({
  difficulty = "1",
  onState,
}: {
  difficulty?: string;
  onState: (state: ReturnType<typeof useSubmitForm>) => void;
}) {
  const state = useSubmitForm(unsigned, difficulty);
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
    mockWorkers = [];
    mocks.appendKey.mockReset();
    mocks.publish.mockReset();
    mocks.fetchWiredAccountStatus.mockReset();
    mocks.submitWiredAccountPost.mockReset();
    mocks.fetchWiredAccountStatus.mockResolvedValue(disabledWiredAccountStatus);
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
      await Promise.resolve();
    });
  }

  it("reports willUseWiredAccount as false when wired account is not configured", async () => {
    act(() => {
      root.render(<Probe difficulty="21" onState={(nextState) => (state = nextState)} />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(state.willUseWiredAccount).toBe(false);
  });

  it("reports willUseWiredAccount as true when signal meets the wired account minimum", async () => {
    mocks.fetchWiredAccountStatus.mockResolvedValue({
      ...configuredWiredAccountStatus,
      minimumPow: 20,
    });

    act(() => {
      root.render(<Probe difficulty="21" onState={(nextState) => (state = nextState)} />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(state.willUseWiredAccount).toBe(true);
  });

  it("reports willUseWiredAccount as false when signal is below the wired account minimum", async () => {
    mocks.fetchWiredAccountStatus.mockResolvedValue({
      ...configuredWiredAccountStatus,
      minimumPow: 20,
    });

    act(() => {
      root.render(<Probe difficulty="19" onState={(nextState) => (state = nextState)} />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(state.willUseWiredAccount).toBe(false);
  });

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

  it("mines high-PoW posts with the Wired account pubkey and submits them to wired-admin", async () => {
    const wiredMinedEvent = {
      ...unsigned,
      id: "3".repeat(64),
      pubkey: wiredPubkey,
      tags: [...unsigned.tags, ["nonce", "2", "1"]],
    };
    const wiredSignedEvent = {
      ...wiredMinedEvent,
      sig: "4".repeat(128),
    };
    mocks.fetchWiredAccountStatus.mockResolvedValue(configuredWiredAccountStatus);
    mocks.submitWiredAccountPost.mockResolvedValue({
      ok: true,
      event: wiredSignedEvent,
      acceptedRelays: ["wss://wired.example"],
    });

    act(() => {
      root.render(<Probe onState={(nextState) => (state = nextState)} />);
    });

    await submitForm();

    expect(mockWorkers[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({
      difficulty: 1,
      unsigned: expect.objectContaining({ pubkey: wiredPubkey }),
    }));

    await act(async () => {
      mockWorkers[0].emit({ type: "found", event: wiredMinedEvent });
    });

    expect(mocks.submitWiredAccountPost).toHaveBeenCalledTimes(1);
    expect(mocks.submitWiredAccountPost).toHaveBeenCalledWith(wiredMinedEvent);
    expect(mocks.submitWiredAccountPost.mock.calls[0][0]).not.toHaveProperty("sig");
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.appendKey).not.toHaveBeenCalled();
    expect(state.signedPoWEvent).toEqual(wiredSignedEvent);
    expect(state.acceptedRelays).toEqual(["wss://wired.example"]);
    expect(state.submitStatus).toBe("published");
  });

  it("keeps below-threshold posts on the anonymous publish path", async () => {
    mocks.fetchWiredAccountStatus.mockResolvedValue({
      ...configuredWiredAccountStatus,
      minimumPow: 20,
    });
    mocks.publish.mockResolvedValue(new Set<string>(["wss://relay.example"]));

    act(() => {
      root.render(<Probe onState={(nextState) => (state = nextState)} />);
    });

    await submitForm();

    expect(mockWorkers[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({
      difficulty: 1,
      unsigned: expect.objectContaining({ pubkey: "f".repeat(64) }),
    }));

    await act(async () => {
      mockWorkers[0].emit({ type: "found", event: minedEvent });
    });

    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(mocks.submitWiredAccountPost).not.toHaveBeenCalled();
    expect(mocks.appendKey).toHaveBeenCalledTimes(1);
    expect((state.signedPoWEvent as Event | undefined)?.pubkey).toBe("f".repeat(64));
  });

  it("does not flip a high-PoW submit attempt when difficulty changes mid-mine", async () => {
    const wiredMinedEvent = {
      ...unsigned,
      id: "5".repeat(64),
      pubkey: wiredPubkey,
      tags: [...unsigned.tags, ["nonce", "3", "1"]],
    };
    const wiredSignedEvent = {
      ...wiredMinedEvent,
      sig: "6".repeat(128),
    };
    mocks.fetchWiredAccountStatus.mockResolvedValue(configuredWiredAccountStatus);
    mocks.submitWiredAccountPost.mockResolvedValue({
      ok: true,
      event: wiredSignedEvent,
      acceptedRelays: ["wss://wired.example"],
    });

    act(() => {
      root.render(<Probe difficulty="1" onState={(nextState) => (state = nextState)} />);
    });

    await submitForm();
    const worker = mockWorkers[0];

    act(() => {
      root.render(<Probe difficulty="0" onState={(nextState) => (state = nextState)} />);
    });

    await act(async () => {
      worker.emit({ type: "found", event: wiredMinedEvent });
    });

    expect(mocks.submitWiredAccountPost).toHaveBeenCalledTimes(1);
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(state.signedPoWEvent).toEqual(wiredSignedEvent);
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
