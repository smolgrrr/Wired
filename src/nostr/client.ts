import type { Event } from "nostr-tools";
import {
  ENRICHMENT_RELAYS,
  POW_RELAYS,
  THREAD_RELAYS as CONFIG_THREAD_RELAYS,
} from "../config";
import { RelayPool } from "./relay-pool";
import type { FiniteQuery, QueryHandle } from "./browser-relay-access";
import { SubscriptionRegistry } from "./subscription-registry";
import {
  RelayWorkflowCollector,
  type RelayWorkflowAggregate,
} from "./evidence/relay-workflow-collector";
import {
  BrowserRelayWorkflowStatusAdapter,
  RelayWorkflowStatusExporter,
  createSameOriginWorkflowStatusSink,
  registerBrowserWorkflowStatusLifecycle,
  workflowStatusRolloutEnabled,
} from "./evidence/relay-workflow-exporter";

export { THREAD_RELAYS } from "../config";
export type {
  FiniteQuery,
  QueryCompletion,
  QueryHandle,
  RelayCompletion,
  RelayCompletionState,
} from "./browser-relay-access";

let pool: RelayPool | null = null;
let registry: SubscriptionRegistry | null = null;
let connectPromise: Promise<void> | null = null;
const activeFiniteQueries = new Set<QueryHandle>();
let scheduleWorkflowEvidenceExport = () => {};
const workflowEvidence = new RelayWorkflowCollector({
  onChange: () => { scheduleWorkflowEvidenceExport(); },
});
const workflowExportEnabled = typeof window !== "undefined" &&
  workflowStatusRolloutEnabled(
    import.meta.env.VITE_RELAY_WORKFLOW_STATUS_ENABLED,
    import.meta.env.VITE_RELAY_WORKFLOW_STATUS_PERCENT,
  );
const workflowStatusExporter = new RelayWorkflowStatusExporter(
  createSameOriginWorkflowStatusSink(),
  { enabled: workflowExportEnabled },
);
const workflowStatusAdapter = new BrowserRelayWorkflowStatusAdapter(
  workflowEvidence,
  workflowStatusExporter,
  { enabled: workflowExportEnabled },
);
scheduleWorkflowEvidenceExport = () => { workflowStatusAdapter.schedule(); };

if (workflowExportEnabled && typeof window !== "undefined") {
  registerBrowserWorkflowStatusLifecycle(workflowStatusAdapter);
}

export const PROFILE_RELAYS = [...CONFIG_THREAD_RELAYS];

function ensureNostrClient(): void {
  if (!pool) {
    pool = new RelayPool({ workflowEvidence });
    registry = new SubscriptionRegistry(pool);
  }
}

export function getRelayWorkflowEvidence(): RelayWorkflowAggregate[] {
  return workflowEvidence.snapshot();
}

export function getRelayWorkflowEvidenceStatus(): {
  pending: number;
  dropped: number;
} {
  return pool?.workflowEvidenceStatus ?? { pending: 0, dropped: 0 };
}

export function getRelayWorkflowExportStatus(): {
  enabled: boolean;
  pending: number;
  dropped: number;
} {
  return workflowStatusExporter.status;
}

export function flushRelayWorkflowEvidence(): void {
  workflowStatusAdapter.flushNow();
}

export function initNostr(): Promise<void> {
  ensureNostrClient();
  if (!pool) {
    throw new Error("Nostr client failed to initialize.");
  }

  if (!connectPromise) {
    connectPromise = Promise.all([
      pool.connect(POW_RELAYS),
      pool.ensureConnected(ENRICHMENT_RELAYS),
    ]).then(() => {});
  }

  return connectPromise;
}

export function getRegistry(): SubscriptionRegistry {
  ensureNostrClient();
  if (!registry) {
    throw new Error("Nostr client is not initialized. Wrap the app in NostrProvider.");
  }
  return registry;
}

export async function ensureRelaysConnected(urls: readonly string[]): Promise<void> {
  ensureNostrClient();
  if (!pool) {
    throw new Error("Nostr client is not initialized.");
  }
  await pool.ensureConnected(urls);
}

export function startFiniteQuery(query: FiniteQuery): QueryHandle {
  ensureNostrClient();
  if (!pool) {
    throw new Error("Nostr client is not initialized.");
  }
  const handle = pool.startFiniteQuery(query);
  activeFiniteQueries.add(handle);
  void handle.done.finally(() => activeFiniteQueries.delete(handle));
  return handle;
}

export async function publish(event: Event): Promise<Set<string>> {
  await initNostr();
  if (!pool) {
    throw new Error("Nostr client is not initialized.");
  }
  return pool.publish(event);
}

export function isNostrReady(): boolean {
  return pool?.isConnected ?? false;
}

export function closeAllSubscriptions(): void {
  registry?.closeAll();
  [...activeFiniteQueries].forEach((query) => query.close());
}
