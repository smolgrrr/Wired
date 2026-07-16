import {
  RELAY_EVIDENCE_LIMITS,
} from "../src/contracts/relay-workflow-evidence.js";
import {
  RELAY_WORKFLOW_STATUS_LIMITS,
  isRelayWorkflowStatusEnvelope,
} from "../src/contracts/relay-workflow-status.js";
import {
  type RelayWorkflowStatusStore,
  type WorkflowStatusStoreLimits,
  VercelBlobRelayWorkflowStatusStore,
} from "./relayWorkflowStatusStore.js";

export type WorkflowStatusIngestResult =
  | "stored"
  | "disabled"
  | "invalid"
  | "oversized"
  | "stale"
  | "rate-limited"
  | "daily-limit"
  | "preview-sampled-out";

type IngestOptions = {
  enabled?: () => boolean;
  now?: () => number;
  random?: () => number;
  limits?: Partial<WorkflowStatusStoreLimits>;
};

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function utcMinute(now: number): string {
  return new Date(now).toISOString().slice(0, 16);
}

export class RelayWorkflowStatusIngestService {
  private stored = 0;
  private rejected = 0;
  private previewOverflow = 0;
  private readonly enabled: () => boolean;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly limits: WorkflowStatusStoreLimits;

  constructor(
    private readonly store: RelayWorkflowStatusStore,
    {
      enabled = () => true,
      now = Date.now,
      random = Math.random,
      limits = {},
    }: IngestOptions = {},
  ) {
    this.enabled = enabled;
    this.now = now;
    this.random = random;
    this.limits = {
      requestsPerSourcePerMinute:
        limits.requestsPerSourcePerMinute ??
        RELAY_WORKFLOW_STATUS_LIMITS.requestsPerSourcePerMinute,
      rowsPerSourcePerDay:
        limits.rowsPerSourcePerDay ?? RELAY_WORKFLOW_STATUS_LIMITS.rowsPerSourcePerDay,
      previewKeysPerDay:
        limits.previewKeysPerDay ?? RELAY_WORKFLOW_STATUS_LIMITS.previewKeysPerDay,
    };
  }

  get status(): { stored: number; rejected: number; previewOverflow: number } {
    return {
      stored: this.stored,
      rejected: this.rejected,
      previewOverflow: this.previewOverflow,
    };
  }

  async ingest(value: unknown, rawBytes?: number): Promise<WorkflowStatusIngestResult> {
    if (!this.enabled()) return "disabled";
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      return this.reject("invalid");
    }
    const bytes = rawBytes ?? new TextEncoder().encode(serialized).byteLength;
    if (!Number.isSafeInteger(bytes) || bytes < 0 ||
      bytes > RELAY_WORKFLOW_STATUS_LIMITS.envelopeBytes) {
      return this.reject("oversized");
    }
    if (!isRelayWorkflowStatusEnvelope(value)) return this.reject("invalid");

    const now = this.now();
    if (value.collectedAt > now + 5 * 60_000 ||
      value.collectedAt < now - RELAY_WORKFLOW_STATUS_LIMITS.retentionMs) {
      return this.reject("stale");
    }
    const day = utcDay(now);
    const reservation = await this.store.reserve({
      source: value.source,
      day,
      minute: utcMinute(now),
      previewCandidates: value.correlations.map((entry) => ({
        correlation: entry,
        collectedAt: value.collectedAt,
        sample: this.random(),
      })),
    }, this.limits);
    if (reservation === "preview-sampled-out") {
      this.previewOverflow = Math.min(
        RELAY_EVIDENCE_LIMITS.count,
        this.previewOverflow + 1,
      );
      return this.reject(reservation);
    }
    if (reservation !== "accepted") return this.reject(reservation);

    await this.store.append(value, day);
    this.stored = Math.min(RELAY_EVIDENCE_LIMITS.count, this.stored + 1);
    return "stored";
  }

  purgeExpired(): Promise<number> {
    return this.store.purgeBefore(this.now() - RELAY_WORKFLOW_STATUS_LIMITS.retentionMs);
  }

  private reject<T extends Exclude<WorkflowStatusIngestResult, "stored" | "disabled">>(
    result: T,
  ): T {
    this.rejected = Math.min(RELAY_EVIDENCE_LIMITS.count, this.rejected + 1);
    return result;
  }
}

let defaultService: RelayWorkflowStatusIngestService | undefined;

export function getDefaultRelayWorkflowStatusIngestService(): RelayWorkflowStatusIngestService {
  defaultService ??= new RelayWorkflowStatusIngestService(
    new VercelBlobRelayWorkflowStatusStore(),
    {
      enabled: () => String(process.env.RELAY_WORKFLOW_STATUS_INGEST_ENABLED ?? "")
        .trim().toLowerCase() === "true",
    },
  );
  return defaultService;
}
