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
  sinkTimeoutMs?: number;
};

export class RelayWorkflowStatusExporter {
  private readonly queue: RelayWorkflowStatusEnvelope[] = [];
  private scheduled = false;
  private flushing = false;
  private dropped = 0;
  private readonly sinkTimeoutMs: number;
  readonly enabled: boolean;

  constructor(
    private readonly sink: WorkflowStatusSink,
    {
      enabled = true,
      schedule = (task) => { queueMicrotask(task); },
      sinkTimeoutMs = 5_000,
    }: ExporterOptions = {},
  ) {
    this.enabled = enabled;
    this.schedule = schedule;
    this.sinkTimeoutMs = Math.max(1, sinkTimeoutMs);
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

  recordDrop(count = 1): void {
    this.incrementDropped(count);
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
    try {
      while (this.queue.length > 0) {
        const envelope = this.queue.shift();
        if (!envelope) continue;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            this.sink(envelope),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(
                () => { reject(new Error("workflow status sink timed out")); },
                this.sinkTimeoutMs,
              );
            }),
          ]);
        } catch {
          this.incrementDropped();
        } finally {
          if (timeout) clearTimeout(timeout);
        }
      }
    } finally {
      this.flushing = false;
      if (this.queue.length > 0) this.scheduleFlush();
    }
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
    const collectedAt = this.now();
    let chunk: typeof aggregates = [];
    for (const aggregate of aggregates) {
      const candidate = [...chunk, aggregate];
      const envelope: RelayWorkflowStatusEnvelope = {
        schemaVersion: 1,
        source: "wired-browser",
        collectedAt,
        aggregates: candidate,
        correlations: [],
      };
      const bytes = new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
      if (candidate.length <= RELAY_WORKFLOW_STATUS_LIMITS.aggregatesPerEnvelope &&
        bytes <= RELAY_WORKFLOW_STATUS_LIMITS.envelopeBytes) {
        chunk = candidate;
        continue;
      }
      if (chunk.length > 0) {
        this.exporter.enqueue({ ...envelope, aggregates: chunk });
        chunk = [];
      }
      const single = { ...envelope, aggregates: [aggregate] };
      if (new TextEncoder().encode(JSON.stringify(single)).byteLength <=
        RELAY_WORKFLOW_STATUS_LIMITS.envelopeBytes) {
        chunk = [aggregate];
      } else {
        this.exporter.recordDrop();
      }
    }
    if (chunk.length > 0) {
      this.exporter.enqueue({
        schemaVersion: 1,
        source: "wired-browser",
        collectedAt,
        aggregates: chunk,
        correlations: [],
      });
    }
  }
}

type SameOriginSinkOptions = {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  isOnline?: () => boolean;
  timeoutMs?: number;
};

export function createSameOriginWorkflowStatusSink({
  endpoint = "/api/workflow-status",
  fetchImpl = fetch,
  isOnline = () => typeof navigator === "undefined" || navigator.onLine,
  timeoutMs = 5_000,
}: SameOriginSinkOptions = {}): WorkflowStatusSink {
  return async (envelope) => {
    if (!isOnline()) throw new Error("offline");
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      credentials: "same-origin",
      keepalive: true,
      signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    });
    if (!response.ok) throw new Error(`workflow status ingest failed: ${response.status}`);
  };
}

type WorkflowStatusLifecycleOptions = {
  windowTarget?: EventTarget;
  documentTarget?: EventTarget & { visibilityState?: string };
};

export function registerBrowserWorkflowStatusLifecycle(
  adapter: Pick<BrowserRelayWorkflowStatusAdapter, "flushNow">,
  {
    windowTarget = window,
    documentTarget = document,
  }: WorkflowStatusLifecycleOptions = {},
): () => void {
  const flush = () => { adapter.flushNow(); };
  const flushWhenHidden = () => {
    if (documentTarget.visibilityState === "hidden") adapter.flushNow();
  };
  windowTarget.addEventListener("pagehide", flush);
  documentTarget.addEventListener("visibilitychange", flushWhenHidden);
  return () => {
    windowTarget.removeEventListener("pagehide", flush);
    documentTarget.removeEventListener("visibilitychange", flushWhenHidden);
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
