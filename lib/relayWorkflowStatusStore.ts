import {
  BlobPreconditionFailedError,
  del,
  get,
  list,
  put,
} from "@vercel/blob";
import {
  isRelayWorkflowStatusEnvelope,
  RELAY_WORKFLOW_STATUS_LIMITS,
  type RelayPreviewCorrelation,
  type RelayWorkflowStatusEnvelope,
} from "../src/contracts/relay-workflow-status.js";
import { RELAY_EVIDENCE_LIMITS } from "../src/contracts/relay-workflow-evidence.js";

export type WorkflowStatusReservation = {
  source: RelayWorkflowStatusEnvelope["source"];
  day: string;
  minute: string;
  previewCandidates: Array<{
    correlation: RelayPreviewCorrelation;
    collectedAt: number;
    sample: number;
  }>;
};

export type WorkflowStatusReservationResult =
  | "accepted"
  | "rate-limited"
  | "daily-limit"
  | "preview-sampled-out";

export type WorkflowStatusStoreLimits = {
  requestsPerSourcePerMinute: number;
  rowsPerSourcePerDay: number;
  previewKeysPerDay: number;
};

export type RelayWorkflowStatusStore = {
  reserve(
    reservation: WorkflowStatusReservation,
    limits: WorkflowStatusStoreLimits,
  ): Promise<WorkflowStatusReservationResult>;
  append(envelope: RelayWorkflowStatusEnvelope, day: string): Promise<void>;
  purgeBefore(cutoff: number): Promise<number>;
};

type StoredRow = { envelope: RelayWorkflowStatusEnvelope; uploadedAt: number };
type PreviewSampleEntry = {
  correlation: RelayPreviewCorrelation;
  collectedAt: number;
};
type ControlState = {
  rows: number;
  minute: string;
  minuteRequests: number;
  previewSample: PreviewSampleEntry[];
  previewKeysSeen: number;
  previewOverflow: number;
};

function nextControlState(
  current: ControlState,
  reservation: WorkflowStatusReservation,
  limits: WorkflowStatusStoreLimits,
): { result: WorkflowStatusReservationResult; state: ControlState } {
  const minuteRequests = current.minute === reservation.minute
    ? current.minuteRequests
    : 0;
  if (minuteRequests >= limits.requestsPerSourcePerMinute) {
    return { result: "rate-limited", state: current };
  }
  const isPreview = reservation.previewCandidates.length > 0;
  if (!isPreview && current.rows >= limits.rowsPerSourcePerDay) {
    return { result: "daily-limit", state: current };
  }
  const previewSample = structuredClone(current.previewSample);
  let previewKeysSeen = current.previewKeysSeen;
  let previewOverflow = current.previewOverflow;
  let sampledOut = false;
  for (const candidate of reservation.previewCandidates) {
    const existing = previewSample.findIndex((entry) =>
      entry.correlation.dailyToken === candidate.correlation.dailyToken
    );
    const entry: PreviewSampleEntry = {
      correlation: structuredClone(candidate.correlation),
      collectedAt: candidate.collectedAt,
    };
    if (existing >= 0) {
      previewSample[existing] = entry;
      continue;
    }
    previewKeysSeen = Math.min(RELAY_EVIDENCE_LIMITS.count, previewKeysSeen + 1);
    if (previewSample.length < limits.previewKeysPerDay) {
      previewSample.push(entry);
      continue;
    }
    const sample = Number.isFinite(candidate.sample)
      ? Math.max(0, Math.min(0.9999999999999999, candidate.sample))
      : 0.9999999999999999;
    const replacement = Math.floor(sample * previewKeysSeen);
    if (replacement < limits.previewKeysPerDay) {
      previewSample[replacement] = entry;
    } else {
      sampledOut = true;
      previewOverflow = Math.min(RELAY_EVIDENCE_LIMITS.count, previewOverflow + 1);
    }
  }
  return {
    result: sampledOut ? "preview-sampled-out" : "accepted",
    state: {
      rows: current.rows + (!isPreview && !sampledOut ? 1 : 0),
      minute: reservation.minute,
      minuteRequests: minuteRequests + 1,
      previewSample,
      previewKeysSeen,
      previewOverflow,
    },
  };
}

const EMPTY_CONTROL: ControlState = {
  rows: 0,
  minute: "",
  minuteRequests: 0,
  previewSample: [],
  previewKeysSeen: 0,
  previewOverflow: 0,
};

export class MemoryRelayWorkflowStatusStore implements RelayWorkflowStatusStore {
  readonly rows: StoredRow[] = [];
  private readonly controls = new Map<string, ControlState>();

  constructor(private readonly now: () => number = Date.now) {}

  async reserve(
    reservation: WorkflowStatusReservation,
    limits: WorkflowStatusStoreLimits,
  ): Promise<WorkflowStatusReservationResult> {
    const key = `${reservation.day}|${reservation.source}`;
    const next = nextControlState(
      this.controls.get(key) ?? EMPTY_CONTROL,
      reservation,
      limits,
    );
    if (next.result === "accepted" || next.result === "preview-sampled-out") {
      this.controls.set(key, next.state);
      if (reservation.previewCandidates.length > 0) {
        const retained = this.rows.filter((row) =>
          !(row.envelope.source === reservation.source &&
            row.envelope.correlations.length > 0 &&
            new Date(row.envelope.collectedAt).toISOString().slice(0, 10) === reservation.day)
        );
        const sampled = next.state.previewSample.map((entry) => ({
          envelope: {
            schemaVersion: 1 as const,
            source: reservation.source,
            collectedAt: entry.collectedAt,
            aggregates: [],
            correlations: [structuredClone(entry.correlation)],
          },
          uploadedAt: this.now(),
        }));
        this.rows.splice(0, this.rows.length, ...retained, ...sampled);
      }
    }
    return next.result;
  }

  async append(envelope: RelayWorkflowStatusEnvelope): Promise<void> {
    if (envelope.correlations.length > 0) return;
    this.rows.push({ envelope: structuredClone(envelope), uploadedAt: this.now() });
  }

  previewOverflow(day: string, source: WorkflowStatusReservation["source"]): number {
    return this.controls.get(`${day}|${source}`)?.previewOverflow ?? 0;
  }

  async purgeBefore(cutoff: number): Promise<number> {
    const retained = this.rows.filter((row) => row.uploadedAt >= cutoff);
    const deleted = this.rows.length - retained.length;
    this.rows.splice(0, this.rows.length, ...retained);
    for (const key of this.controls.keys()) {
      const day = key.slice(0, 10);
      if (Date.parse(`${day}T00:00:00.000Z`) < cutoff) this.controls.delete(key);
    }
    return deleted;
  }
}

const DATA_PREFIX = "relay-workflow-status/v1/data/";
const CONTROL_PREFIX = "relay-workflow-status/v1/control/";

function isControlState(value: unknown): value is ControlState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<ControlState>;
  return Number.isInteger(state.rows) && Number(state.rows) >= 0 &&
    typeof state.minute === "string" && /^$|^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(state.minute) &&
    Number.isInteger(state.minuteRequests) && Number(state.minuteRequests) >= 0 &&
    Number.isInteger(state.previewKeysSeen) && Number(state.previewKeysSeen) >= 0 &&
    Number(state.previewKeysSeen) <= RELAY_EVIDENCE_LIMITS.count &&
    Number.isInteger(state.previewOverflow) && Number(state.previewOverflow) >= 0 &&
    Number(state.previewOverflow) <= RELAY_EVIDENCE_LIMITS.count &&
    Array.isArray(state.previewSample) &&
    state.previewSample.length <= RELAY_WORKFLOW_STATUS_LIMITS.previewKeysPerDay &&
    state.previewSample.every((entry) =>
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry) &&
      isRelayWorkflowStatusEnvelope({
        schemaVersion: 1,
        source: "wired-server",
        collectedAt: (entry as PreviewSampleEntry).collectedAt,
        aggregates: [],
        correlations: [(entry as PreviewSampleEntry).correlation],
      })
    );
}

async function streamJson(stream: ReadableStream<Uint8Array>): Promise<unknown> {
  return JSON.parse(await new Response(stream).text()) as unknown;
}

export class VercelBlobRelayWorkflowStatusStore implements RelayWorkflowStatusStore {
  async reserve(
    reservation: WorkflowStatusReservation,
    limits: WorkflowStatusStoreLimits,
  ): Promise<WorkflowStatusReservationResult> {
    const pathname = `${CONTROL_PREFIX}${reservation.day}/${reservation.source}.json`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await get(pathname, { access: "private", useCache: false });
      const parsed = existing?.statusCode === 200
        ? await streamJson(existing.stream)
        : null;
      const current = isControlState(parsed) ? parsed : EMPTY_CONTROL;
      const next = nextControlState(current, reservation, limits);
      if (next.result !== "accepted" && next.result !== "preview-sampled-out") {
        return next.result;
      }
      try {
        await put(pathname, JSON.stringify(next.state), {
          access: "private",
          allowOverwrite: Boolean(existing),
          cacheControlMaxAge: 60,
          contentType: "application/json",
          ...(existing ? { ifMatch: existing.blob.etag } : {}),
        });
        return next.result;
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) continue;
        const appeared = !existing && await get(pathname, {
          access: "private",
          useCache: false,
        });
        if (appeared) continue;
        throw error;
      }
    }
    throw new Error("workflow status limit reservation contention");
  }

  async append(envelope: RelayWorkflowStatusEnvelope, day: string): Promise<void> {
    if (envelope.correlations.length > 0) return;
    await put(
      `${DATA_PREFIX}${day}/${envelope.source}/envelope.json`,
      JSON.stringify(envelope),
      {
        access: "private",
        addRandomSuffix: true,
        allowOverwrite: false,
        cacheControlMaxAge: 60,
        contentType: "application/json",
        maximumSizeInBytes: RELAY_WORKFLOW_STATUS_LIMITS.envelopeBytes,
      },
    );
  }

  async purgeBefore(cutoff: number): Promise<number> {
    let cursor: string | undefined;
    let deleted = 0;
    while (true) {
      const page = await list({ prefix: "relay-workflow-status/v1/", cursor, limit: 1_000 });
      const expired = page.blobs
        .filter((blob) => blob.uploadedAt.getTime() < cutoff)
        .map((blob) => blob.url);
      if (expired.length > 0) {
        await del(expired);
        deleted += expired.length;
        cursor = undefined;
        continue;
      }
      if (!page.hasMore || !page.cursor) break;
      cursor = page.cursor;
    }
    return deleted;
  }
}
