// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PostForm } from "./PostForm";

type ReactActGlobal = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const mocks = vi.hoisted(() => ({
  handleSubmit: vi.fn(),
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
    mocks.handleSubmit.mockReset();
    mocks.handleSubmit.mockResolvedValue(undefined);
    mocks.useSubmitForm.mockReturnValue({
      handleSubmit: mocks.handleSubmit,
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

  it("shows a visible first-use compose affordance", () => {
    act(() => {
      root.render(<PostForm />);
    });

    const label = container.querySelector("label");
    const textarea = container.querySelector("textarea");

    expect(label?.textContent).toBe("Write a note");
    expect(textarea?.getAttribute("placeholder")).toBe("Share a note with the network");
    expect(textarea?.id).toBe(label?.getAttribute("for"));
  });

  it("keeps empty transmits local and focuses the composer with feedback", async () => {
    act(() => {
      root.render(<PostForm />);
    });

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    const textarea = container.querySelector("textarea");
    const message = container.querySelector("[role='status']");

    expect(mocks.handleSubmit).not.toHaveBeenCalled();
    expect(message?.textContent).toBe("Write something before transmitting.");
    expect(textarea?.getAttribute("aria-invalid")).toBe("true");
    expect(textarea?.getAttribute("aria-describedby")).toBe(message?.id);
    expect(document.activeElement).toBe(textarea);
  });

  it("delegates non-empty transmits to the submit hook", async () => {
    act(() => {
      root.render(<PostForm />);
    });

    const textarea = container.querySelector("textarea");
    act(() => {
      if (!textarea) throw new Error("missing textarea");
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(textarea, "hello wired");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(mocks.handleSubmit).toHaveBeenCalledTimes(1);
  });
});
