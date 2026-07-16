import { RELAY_EVIDENCE_LIMITS } from "../../contracts/relay-workflow-evidence";
import {
  RELAY_WORKFLOW_STATUS_LIMITS,
  type RelayWorkflowStatusEnvelope,
} from "../../contracts/relay-workflow-status";
import type { RelayWorkflowCollector } from "./relay-workflow-collector";

export type WorkflowStatusSink = (
  envelope: RelayWorkflowStatusEnvelope,
) => Promise<void>;

type ExporterOptions = {
  enabled?: boolean;
  schedule?: (task: () => void) => void;
};

export class RelayWorkflowStatusExporter {
  private readonly queue: RelayWorkflowStatusEnvelope[] = [];
  private scheduled = false;
  private flushing = false;
  private dropped = 0;
  readonly enabled: boolean;

  constructor(
    private readonly sink: WorkflowStatusSink,
    {
      enabled = true,
      schedule = (task) => { queueMicrotask(task); },
    }: ExporterOptions = {},
  ) {
    this.enabled = enabled;
    this.schedule = schedule;
  }

  private readonly schedule: (task: () => void) => void;

  get status(): { enabled: boolean; pending: number; dropped: number } {
    return { enabled: this.enabled, pending: this.queue.length, dropped: this.dropped };
  }

  enqueue(envelope: RelayWorkflowStatusEnvelope): void {
    if (!this.enabled) return;
    if (this.queue.length >= RELAY_WORKFLOW_STATUS_LIMITS.queuedEnvelopes) {
      this.queue.shift();
      this.incrementDropped();
    }
    this.queue.push(structuredClone(envelope));
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.scheduled || this.flushing) return;
    this.scheduled = true;
    try {
      this.schedule(() => {
        this.scheduled = false;
        void this.flush();
      });
    } catch {
      this.scheduled = false;
      this.incrementDropped(this.queue.splice(0).length);
    }
  }

  private async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    while (this.queue.length > 0) {
      const envelope = this.queue.shift();
      if (!envelope) continue;
      try {
        await this.sink(envelope);
      } catch {
        this.incrementDropped();
      }
    }
    this.flushing = false;
  }

  private incrementDropped(count = 1): void {
    this.dropped = Math.min(RELAY_EVIDENCE_LIMITS.count, this.dropped + count);
  }
}

type BrowserAdapterOptions = {
  enabled?: boolean;
  flushIntervalMs?: number;
  now?: () => number;
  setTimer?: (task: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
};

export class BrowserRelayWorkflowStatusAdapter {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly enabled: boolean;
  private readonly flushIntervalMs: number;
  private readonly now: () => number;
  private readonly setTimer: NonNullable<BrowserAdapterOptions["setTimer"]>;
  private readonly clearTimer: NonNullable<BrowserAdapterOptions["clearTimer"]>;

  constructor(
    private readonly collector: RelayWorkflowCollector,
    private readonly exporter: RelayWorkflowStatusExporter,
    {
      enabled = true,
      flushIntervalMs = 30_000,
      now = Date.now,
      setTimer = (task, delayMs) => setTimeout(task, delayMs),
      clearTimer = (timer) => clearTimeout(timer),
    }: BrowserAdapterOptions = {},
  ) {
    this.enabled = enabled;
    this.flushIntervalMs = flushIntervalMs;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
  }

  schedule(): void {
    if (!this.enabled || this.timer) return;
    this.timer = this.setTimer(() => {
      this.timer = undefined;
      this.flushNow();
    }, this.flushIntervalMs);
  }

  flushNow(): void {
    if (!this.enabled) return;
    if (this.timer) {
      this.clearTimer(this.timer);
      this.timer = undefined;
    }
    const aggregates = this.collector.drain();
    if (aggregates.length === 0) return;
    this.exporter.enqueue({
      schemaVersion: 1,
      source: "wired-browser",
      collectedAt: this.now(),
      aggregates,
      correlations: [],
    });
  }
}

type SameOriginSinkOptions = {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  isOnline?: () => boolean;
};

export function createSameOriginWorkflowStatusSink({
  endpoint = "/api/workflow-status",
  fetchImpl = fetch,
  isOnline = () => typeof navigator === "undefined" || navigator.onLine,
}: SameOriginSinkOptions = {}): WorkflowStatusSink {
  return async (envelope) => {
    if (!isOnline()) throw new Error("offline");
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      credentials: "same-origin",
      keepalive: true,
    });
    if (!response.ok) throw new Error(`workflow status ingest failed: ${response.status}`);
  };
}

export function workflowStatusRolloutEnabled(
  enabled: unknown,
  percentage: unknown,
  sample = Math.random(),
): boolean {
  if (String(enabled ?? "").trim().toLowerCase() !== "true") return false;
  const parsed = Number(percentage ?? 0);
  const bounded = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
  return sample >= 0 && sample < bounded / 100;
}
