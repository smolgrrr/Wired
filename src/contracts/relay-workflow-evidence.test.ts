import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import {
  RELAY_EVIDENCE_LIMITS,
  RELAY_WORKFLOW_EVIDENCE_SCHEMA,
  isRelayWorkflowEvidence,
  relayAcceptedCountBucket,
  relayWorkflowOutcome,
  type RelayWorkflowEvidence,
} from "./relay-workflow-evidence";

type Corpus = {
  valid: unknown[];
  invalid: unknown[];
  acceptedCountBucketCases: Array<{
    accepted: number;
    targets: number;
    expected: string;
  }>;
  invalidAcceptedCountBucketCases: Array<{
    accepted: number;
    targets: number;
  }>;
  outcomeCases: Array<{
    targets: number;
    successfulTargets: number;
    timedOut: number;
    cancelled: number;
    expected: string;
  }>;
  invalidOutcomeCases: Array<{
    targets: number;
    successfulTargets: number;
    timedOut: number;
    cancelled: number;
  }>;
};

type Manifest = {
  schemaVersion: number;
  canonicalRepository: string;
  canonicalPath: string;
  schemaSha256: string;
  conformanceSha256: string;
};

const contractDirectory = resolve(process.cwd(), "src/contracts");
const readContract = (name: string) =>
  readFileSync(resolve(contractDirectory, name), "utf8");
const schemaSource = readContract("relay-workflow-evidence.v1.schema.json");
const conformanceSource = readContract(
  "relay-workflow-evidence.v1.conformance.json",
);
const schema = JSON.parse(schemaSource);
const corpus = JSON.parse(conformanceSource) as Corpus;
const manifest = JSON.parse(
  readContract("relay-workflow-evidence.v1.manifest.json"),
) as Manifest;
const validateSchema = new Ajv2020({ strict: true }).compile(schema);
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function boundaryVectors(): unknown[] {
  const base = structuredClone(corpus.valid[0]) as RelayWorkflowEvidence;
  const missingKey: Partial<RelayWorkflowEvidence> = structuredClone(base);
  delete missingKey.schemaVersion;

  return [
    missingKey,
    { ...structuredClone(base), outcome: "unknown" },
    { ...structuredClone(base), work: { ...base.work, attempts: -1 } },
    {
      ...structuredClone(base),
      connections: { ...base.connections, opened: 0.5 },
    },
    {
      ...structuredClone(base),
      terminal: {
        ...base.terminal,
        eose: RELAY_EVIDENCE_LIMITS.count + 1,
      },
    },
    {
      ...structuredClone(base),
      relay: {
        ...base.relay,
        requestBytes: RELAY_EVIDENCE_LIMITS.bytes + 1,
      },
    },
    {
      ...structuredClone(base),
      timingMs: {
        ...base.timingMs,
        completion: RELAY_EVIDENCE_LIMITS.durationMs + 1,
      },
    },
    { ...structuredClone(base), work: { ...base.work, extra: 1 } },
  ];
}

describe("relay workflow evidence v1", () => {
  it("pins the canonical language-neutral artifacts", () => {
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      canonicalRepository: "smolgrrr/wired-admin",
      canonicalPath: "smolgrrr-wired-admin/web/src/contracts",
    });
    expect(digest(schemaSource)).toBe(manifest.schemaSha256);
    expect(digest(conformanceSource)).toBe(manifest.conformanceSha256);
    expect(RELAY_WORKFLOW_EVIDENCE_SCHEMA).toEqual(schema);
  });

  it("keeps the JSON Schema and runtime guard conformant", () => {
    corpus.valid.forEach((envelope) => {
      expect(validateSchema(envelope)).toBe(true);
      expect(isRelayWorkflowEvidence(envelope)).toBe(true);
    });
    [...corpus.invalid, ...boundaryVectors()].forEach((envelope) => {
      expect(validateSchema(envelope)).toBe(false);
      expect(isRelayWorkflowEvidence(envelope)).toBe(false);
    });
  });

  it("uses deterministic acknowledgement and outcome precedence", () => {
    corpus.acceptedCountBucketCases.forEach(({ accepted, targets, expected }) => {
      expect(relayAcceptedCountBucket(accepted, targets)).toBe(expected);
    });
    corpus.outcomeCases.forEach(({ expected, ...input }) => {
      expect(relayWorkflowOutcome(input)).toBe(expected);
    });
    corpus.invalidAcceptedCountBucketCases.forEach(({ accepted, targets }) => {
      expect(() => relayAcceptedCountBucket(accepted, targets)).toThrow(RangeError);
    });
    corpus.invalidOutcomeCases.forEach((input) => {
      expect(() => relayWorkflowOutcome(input)).toThrow(RangeError);
    });
  });
});
