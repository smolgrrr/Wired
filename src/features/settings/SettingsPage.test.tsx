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
  },
  updateSettings: vi.fn(),
}));

vi.mock("../../app/settings", () => ({
  useSettings: () => ({
    settings: settingsMock.settings,
    updateSettings: settingsMock.updateSettings,
  }),
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

  function submitSettings() {
    const form = container.querySelector("form");

    if (!form) {
      throw new Error("Missing settings form");
    }

    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  }

  it("explains each numeric setting inline", () => {
    renderPage();

    expect(container.textContent).toContain("Feed minimum");
    expect(container.textContent).toContain("Proof mined for new posts");
    expect(container.textContent).toContain("Feed lookback");
  });

  it("blocks invalid settings without persisting them", () => {
    renderPage();

    changeInput("filterDifficulty", "15");
    submitSettings();

    expect(container.textContent).toContain("use 16 or higher");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(settingsMock.updateSettings).not.toHaveBeenCalled();
  });

  it("persists valid settings and confirms the save", () => {
    renderPage();

    changeInput("filterDifficulty", "18");
    changeInput("difficulty", "21");
    changeInput("age", "48");
    submitSettings();

    expect(settingsMock.updateSettings).toHaveBeenCalledWith({
      filterDifficulty: 18,
      difficulty: 21,
      ageHours: 48,
    });
    expect(container.textContent).toContain("settings saved");
  });
});
