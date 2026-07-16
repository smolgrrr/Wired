import { createHmac } from "node:crypto";
import {
  getDefaultRelayWorkflowStatusIngestService,
  type RelayWorkflowStatusIngestService,
} from "./relayWorkflowStatusIngest.js";
import type {
  RelayPreviewCorrelation,
} from "../src/contracts/relay-workflow-status.js";

export function deriveDailyPreviewCorrelationToken(
  eventId: string,
  secret: string,
  now = Date.now(),
): string {
  if (!/^[0-9a-f]{64}$/i.test(eventId)) throw new Error("invalid preview event id");
  if (secret.length < 32) throw new Error("preview correlation secret must be at least 32 bytes");
  const day = new Date(now).toISOString().slice(0, 10);
  const dailyKey = createHmac("sha256", secret)
    .update(`wired-preview:v1:${day}`)
    .digest();
  return createHmac("sha256", dailyKey)
    .update(eventId.toLowerCase())
    .digest("base64url")
    .slice(0, 16);
}

type PreviewObserverOptions = {
  endpoint: RelayPreviewCorrelation["endpoint"];
  enabled?: boolean;
  service?: RelayWorkflowStatusIngestService;
  secret?: string;
  now?: () => number;
  defer?: (promise: Promise<unknown>) => void;
};

export function createPreviewResolutionObserver({
  endpoint,
  enabled = String(process.env.RELAY_WORKFLOW_PREVIEW_CORRELATION_ENABLED ?? "")
    .trim().toLowerCase() === "true",
  service = getDefaultRelayWorkflowStatusIngestService(),
  secret = String(process.env.WORKFLOW_STATUS_PREVIEW_HMAC_SECRET ?? ""),
  now = Date.now,
  defer = (promise) => { void promise; },
}: PreviewObserverOptions): (
  observation: { eventId: string; outcome: RelayPreviewCorrelation["outcome"] },
) => void {
  return ({ eventId, outcome }) => {
    if (!enabled || secret.length < 32) return;
    const collectedAt = now();
    let dailyToken: string;
    try {
      dailyToken = deriveDailyPreviewCorrelationToken(eventId, secret, collectedAt);
    } catch {
      return;
    }
    try {
      defer(service.ingest({
        schemaVersion: 1,
        source: "wired-server",
        collectedAt,
        aggregates: [],
        correlations: [{
          workflowOwner: "wired.server.preview",
          endpoint,
          outcome,
          dailyToken,
        }],
      }).catch(() => undefined));
    } catch {
      // Correlation evidence cannot affect preview rendering.
    }
  };
}
