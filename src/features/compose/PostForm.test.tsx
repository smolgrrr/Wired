// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PostForm } from "./PostForm";

type ReactActGlobal = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const mocks = vi.hoisted(() => ({
  useSubmitForm: vi.fn(),
}));

vi.mock("../../app/settings", () => ({
  useSettings: () => ({ settings: { difficulty: 21 } }),
}));

vi.mock("../../shared/hooks/useSubmitForm", () => ({
  useSubmitForm: mocks.useSubmitForm,
}));

vi.mock("../thread/useThreadNavigation", () => ({
  useThreadNavigation: () => vi.fn(),
}));

vi.mock("./buildUnsignedEvent", () => ({
  buildUnsignedEvent: () => ({
    kind: 1,
    tags: [["client", "getwired.app"]],
    content: "test",
    created_at: 1,
    pubkey: "",
  }),
}));

vi.mock("./CustomEmojiPicker", () => ({
  CustomEmojiPicker: () => <button type="button">emoji</button>,
}));

describe("PostForm", () => {
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
    mocks.useSubmitForm.mockReturnValue({
      handleSubmit: vi.fn(),
      doingWorkProp: false,
      submitStatus: "idle",
      submitError: null,
      acceptedRelays: [],
      hashrate: 0,
      bestPow: 0,
      signedPoWEvent: undefined,
      powEta: "12s",
      willUseWiredAccount: false,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it("shows the PoW ETA with the signal selector", () => {
    act(() => {
      root.render(<PostForm />);
    });

    expect(container.textContent).toContain("signal");
    expect(container.textContent).toContain("estimated mine time ~12s");
  });
});
