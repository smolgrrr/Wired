// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Event } from "nostr-tools";
import { describe, expect, it, vi } from "vitest";
import {
  auditSampleCount,
  emitAuditMeasurement,
  summarizeSamples,
} from "./audit-metrics";

const mocks = vi.hoisted(() => ({
  joinEnabled: true,
  subProfilesOnce: vi.fn(),
}));

vi.mock("../subscriptions", () => ({
  subProfilesOnce: mocks.subProfilesOnce,
}));

vi.mock("../../config", () => Object.defineProperty(
  {},
  "PROFILE_REQUEST_JOIN_ENABLED",
  { enumerable: true, get: () => mocks.joinEnabled },
));

import { useProfile } from "../../shared/hooks/useProfiles";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  return <span>{profile?.name}</span>;
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

describe("profile request joining transcript", () => {
  it("pairs the legacy duplicate with one joined query and identical newest metadata", async () => {
    const enabledCompletionLatencies: number[] = [];
    const disabledQueriesPerRun: number[] = [];
    const enabledQueriesPerRun: number[] = [];

    for (let run = 0; run < auditSampleCount(); run += 1) {
      for (const enabled of [false, true]) {
        mocks.joinEnabled = enabled;
        mocks.subProfilesOnce.mockClear();
        mocks.subProfilesOnce.mockResolvedValue({ id: "profiles", close: vi.fn() });
        const pubkey = `${enabled ? "a" : "b"}${run.toString(16)}`.padStart(64, "0");
        const container = document.createElement("div");
        document.body.append(container);
        const root = createRoot(container);
        const startedAt = performance.now();

        await act(async () => {
          root.render(<Probe pubkey={pubkey} />);
          await Promise.resolve();
        });
        await act(async () => {
          root.render(
            <>
              <Probe pubkey={pubkey} />
              <Probe pubkey={pubkey} />
            </>,
          );
          await Promise.resolve();
        });

        const calls = mocks.subProfilesOnce.mock.calls;
        const firstOnEvent = calls[0]?.[1] as ((event: Event) => void) | undefined;
        const lastOnEvent = calls.at(-1)?.[1] as ((event: Event) => void) | undefined;
        await act(async () => {
          firstOnEvent?.(
            profileEvent(pubkey, "older", 10, `${run}1`.padStart(64, "1")),
          );
          lastOnEvent?.(
            profileEvent(pubkey, "newest", 20, `${run}2`.padStart(64, "2")),
          );
          calls.forEach((call) => {
            (call[2] as (() => void) | undefined)?.();
          });
        });

        const queryCount = calls.length;
        if (enabled) {
          enabledQueriesPerRun.push(queryCount);
          enabledCompletionLatencies.push(performance.now() - startedAt);
        } else {
          disabledQueriesPerRun.push(queryCount);
        }
        expect(container.textContent).toBe("newestnewest");
        await act(async () => root.unmount());
        container.remove();
      }
    }

    const completionLatencyMs = summarizeSamples(enabledCompletionLatencies);
    expect(disabledQueriesPerRun).toEqual(Array(auditSampleCount()).fill(2));
    expect(enabledQueriesPerRun).toEqual(Array(auditSampleCount()).fill(1));
    expect(completionLatencyMs.p95).toBeLessThanOrEqual(34);
    emitAuditMeasurement({
      scenario: "wired-browser-profile-request-joining-local-fixture",
      samples: enabledCompletionLatencies.length,
      completionLatencyMs,
      evidence: {
        disabledQueriesPerRun,
        enabledQueriesPerRun,
        disabledSelectedMetadata: "newest",
        enabledSelectedMetadata: "newest",
      },
    });
  });
});
