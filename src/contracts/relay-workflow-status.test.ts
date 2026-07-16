import { describe, expect, it } from "vitest";
import { RelayWorkflowCollector } from "../nostr/evidence/relay-workflow-collector";
import { validRelayWorkflowEvidence } from "./relay-workflow-evidence.test-fixtures";
import {
  isRelayWorkflowStatusEnvelope,
  type RelayWorkflowStatusEnvelope,
} from "./relay-workflow-status";

function browserEnvelope(): RelayWorkflowStatusEnvelope {
  const collector = new RelayWorkflowCollector();
  collector.record(validRelayWorkflowEvidence.query);
  return {
    schemaVersion: 1,
    source: "wired-browser",
    collectedAt: 1_700_000_000_000,
    aggregates: collector.snapshot(),
    correlations: [],
  };
}

describe("relay workflow status envelope", () => {
  it("accepts fixed, content-free aggregate envelopes", () => {
    expect(isRelayWorkflowStatusEnvelope(browserEnvelope())).toBe(true);
  });

  it("rejects source spoofing, extra labels, and raw identifiers", () => {
    const valid = browserEnvelope();
    expect(isRelayWorkflowStatusEnvelope({ ...valid, source: "wired-admin" })).toBe(false);
    expect(isRelayWorkflowStatusEnvelope({ ...valid, relayUrl: "wss://forbidden.example" })).toBe(false);
    expect(isRelayWorkflowStatusEnvelope({
      ...valid,
      aggregates: [{ ...valid.aggregates[0], eventId: "forbidden" }],
    })).toBe(false);
  });

  it("accepts only 96-bit preview correlation tokens from the server source", () => {
    const correlation = {
      workflowOwner: "wired.server.preview" as const,
      endpoint: "thread-html" as const,
      outcome: "relay-fallback" as const,
      dailyToken: "abcdefghijklmnop",
    };
    expect(isRelayWorkflowStatusEnvelope({
      schemaVersion: 1,
      source: "wired-server",
      collectedAt: 1_700_000_000_000,
      aggregates: [],
      correlations: [correlation],
    })).toBe(true);
    expect(isRelayWorkflowStatusEnvelope({
      schemaVersion: 1,
      source: "wired-browser",
      collectedAt: 1_700_000_000_000,
      aggregates: [],
      correlations: [correlation],
    })).toBe(false);
  });
});
