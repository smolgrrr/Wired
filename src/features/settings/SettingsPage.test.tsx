// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./SettingsPage";

type ReactActGlobal = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const settingsMock = vi.hoisted(() => ({
  settings: {
    difficulty: 20,
    filterDifficulty: 16,
    ageHours: 24,
    sortByPow: true,
    lightningAddress: "",
  },
  updateSettings: vi.fn(),
}));

const revenueMock = vi.hoisted(() => ({
  validateLightningAddress: vi.fn(),
}));

vi.mock("../../app/settings", () => ({
  useSettings: () => ({
    settings: settingsMock.settings,
    updateSettings: settingsMock.updateSettings,
  }),
}));

vi.mock("../revenue/api", () => ({
  validateLightningAddress: revenueMock.validateLightningAddress,
}));

describe("SettingsPage", () => {
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
    settingsMock.updateSettings.mockClear();
    settingsMock.settings.lightningAddress = "";
    revenueMock.validateLightningAddress.mockReset();
    revenueMock.validateLightningAddress.mockImplementation(async (address: string) => ({
      ok: true,
      address: address.trim().toLowerCase(),
      minSendableMsat: 1_000,
      maxSendableMsat: 1_000_000,
    }));
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
        <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <SettingsPage />
        </MemoryRouter>,
      );
    });
  }

  function changeInput(id: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(`#${id}`);
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

    if (!input || !valueSetter) {
      throw new Error(`Missing input ${id}`);
    }

    act(() => {
      valueSetter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function submitSettings() {
    const form = container.querySelector("form");

    if (!form) {
      throw new Error("Missing settings form");
    }

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
  }

  it("explains each numeric setting inline", () => {
    renderPage();

    expect(container.textContent).toContain("Feed minimum");
    expect(container.textContent).toContain("Proof mined for new posts");
    expect(container.textContent).toContain("Feed lookback");
  });

  it("blocks invalid settings without persisting them", async () => {
    renderPage();

    changeInput("filterDifficulty", "15");
    await submitSettings();

    expect(container.textContent).toContain("use 16 or higher");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(settingsMock.updateSettings).not.toHaveBeenCalled();
  });

  it("persists valid settings and confirms the save", async () => {
    renderPage();

    changeInput("filterDifficulty", "18");
    changeInput("difficulty", "21");
    changeInput("age", "48");
    await submitSettings();

    expect(settingsMock.updateSettings).toHaveBeenCalledWith({
      filterDifficulty: 18,
      difficulty: 21,
      ageHours: 48,
      lightningAddress: "",
    });
    expect(container.textContent).toContain("settings saved");
  });

  it("validates and saves a normalized Lightning address privately", async () => {
    renderPage();

    changeInput("lightningAddress", "Creator@Wallet.Example");
    await submitSettings();

    expect(revenueMock.validateLightningAddress).toHaveBeenCalledWith("Creator@Wallet.Example");
    expect(settingsMock.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      lightningAddress: "creator@wallet.example",
    }));
    expect(container.textContent).toContain("settings saved");
  });

  it("does not replace the saved address when validation fails", async () => {
    revenueMock.validateLightningAddress.mockRejectedValue(
      new Error("creator-secret@wallet.example is unavailable"),
    );
    renderPage();

    changeInput("lightningAddress", "creator@wallet.example");
    await submitSettings();

    expect(settingsMock.updateSettings).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Could not validate that Lightning address");
    expect(container.textContent).not.toContain("creator-secret@wallet.example is unavailable");
  });

  it("rejects a malformed Lightning address without persisting it", async () => {
    revenueMock.validateLightningAddress.mockRejectedValue(new Error("invalid Lightning address"));
    renderPage();

    changeInput("lightningAddress", "not-an-address");
    await submitSettings();

    expect(settingsMock.updateSettings).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Could not validate that Lightning address");
  });

  it("replaces a previously saved destination only after validation", async () => {
    settingsMock.settings.lightningAddress = "old@wallet.example";
    renderPage();

    changeInput("lightningAddress", "New@Wallet.Example");
    await submitSettings();

    expect(revenueMock.validateLightningAddress).toHaveBeenCalledWith("New@Wallet.Example");
    expect(settingsMock.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      lightningAddress: "new@wallet.example",
    }));
  });

  it("removes a saved destination without sending it for validation", async () => {
    settingsMock.settings.lightningAddress = "old@wallet.example";
    renderPage();

    changeInput("lightningAddress", "");
    await submitSettings();

    expect(revenueMock.validateLightningAddress).not.toHaveBeenCalled();
    expect(settingsMock.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      lightningAddress: "",
    }));
  });
});
