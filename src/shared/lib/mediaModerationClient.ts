import type { Event } from "nostr-tools";
import type { MediaItem } from "./mediaUtils";
import type {
  MediaPresentationVerdict,
  MediaVerdictStatus,
} from "./mediaModeration";

export type MediaModerationMode = "off" | "shadow" | "enforce";
type VerdictListener = (verdict: MediaPresentationVerdict) => void;

type ServerVerdict = {
  requestId: string;
  eventId: string;
  url: string;
  mediaType: "image" | "video";
  status: MediaVerdictStatus;
  reason: string;
  expiresAt: number | null;
  sha256?: string;
  perceptualHash?: string;
};

type ServerResponse = {
  mode: MediaModerationMode;
  policyVersion: string;
  verdicts: ServerVerdict[];
};

type Entry = {
  key: string;
  event: Event;
  item: MediaItem;
  verdict: MediaPresentationVerdict;
  listeners: Set<VerdictListener>;
  retryAttempt: number;
  retryTimer?: ReturnType<typeof setTimeout>;
};

type MediaModerationClientOptions = {
  baseUrl: string;
  mode: MediaModerationMode;
  fetcher?: typeof fetch;
  batchDelayMs?: number;
  retryBaseMs?: number;
  terminalRefreshMs?: number;
  enabledMediaTypes?: ReadonlySet<"image" | "video">;
};

export type MediaModerationClient = ReturnType<typeof createMediaModerationClient>;

function keyFor(event: Event, item: MediaItem): string {
  return `${event.id}:${item.url}`;
}

function disabledVerdict(): MediaPresentationVerdict {
  return { status: "allowed", reason: "moderation_disabled", enforced: false };
}

export function createMediaModerationClient({
  baseUrl,
  mode,
  fetcher = fetch,
  batchDelayMs = 8,
  retryBaseMs = 1_000,
  terminalRefreshMs = 15 * 60 * 1_000,
  enabledMediaTypes = new Set(["image", "video"]),
}: MediaModerationClientOptions) {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  const entries = new Map<string, Entry>();
  const queued = new Map<string, Entry>();
  const activeRequests = new Set<Promise<void>>();
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  function notify(entry: Entry, verdict: MediaPresentationVerdict): void {
    entry.verdict = verdict;
    for (const listener of entry.listeners) listener(verdict);
  }

  function scheduleRetry(entry: Entry): void {
    if (closed || entry.listeners.size === 0 || entry.retryTimer) return;
    const delay = Math.min(30_000, retryBaseMs * 2 ** entry.retryAttempt);
    entry.retryAttempt += 1;
    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = undefined;
      queue(entry);
    }, delay);
  }

  function scheduleTerminalRefresh(entry: Entry): void {
    if (closed || entry.listeners.size === 0 || entry.retryTimer) return;
    const untilExpiry = entry.verdict.expiresAt
      ? Math.max(0, entry.verdict.expiresAt - Date.now())
      : terminalRefreshMs;
    const delay = Math.min(terminalRefreshMs, untilExpiry);
    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = undefined;
      notify(entry, {
        status: "stale",
        reason: "verdict_refreshing",
        enforced: mode === "enforce",
      });
      queue(entry);
    }, delay);
  }

  function queue(entry: Entry): void {
    if (closed || mode === "off" || !normalizedBaseUrl) return;
    queued.set(entry.key, entry);
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = undefined;
      flush();
    }, batchDelayMs);
  }

  async function send(batch: Entry[]): Promise<void> {
    try {
      const response = await fetcher(
        `${normalizedBaseUrl}/api/media-moderation/verdicts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: batch.map((entry) => ({
              requestId: entry.key,
              event: entry.event,
              mediaType: entry.item.type,
              url: entry.item.url,
              ...(entry.item.sha256 ? { claimedHash: entry.item.sha256 } : {}),
            })),
          }),
        },
      );
      if (!response.ok) throw new Error(`verdict API returned ${response.status}`);
      const payload = (await response.json()) as ServerResponse;
      const verdicts = new Map(
        payload.verdicts.map((verdict) => [verdict.requestId, verdict]),
      );
      for (const entry of batch) {
        const serverVerdict = verdicts.get(entry.key);
        if (!serverVerdict) {
          notify(entry, {
            status: "unavailable",
            reason: "missing_batch_verdict",
            enforced: mode === "enforce",
          });
          scheduleRetry(entry);
          continue;
        }
        entry.retryAttempt = 0;
        notify(entry, {
          status: serverVerdict.status,
          reason: serverVerdict.reason,
          enforced: mode === "enforce" && payload.mode === "enforce",
          expiresAt: serverVerdict.expiresAt,
          ...(serverVerdict.sha256 ? { sha256: serverVerdict.sha256 } : {}),
          ...(serverVerdict.perceptualHash
            ? { perceptualHash: serverVerdict.perceptualHash }
            : {}),
        });
        if (
          serverVerdict.status === "pending" ||
          serverVerdict.status === "unavailable" ||
          serverVerdict.status === "stale"
        ) {
          scheduleRetry(entry);
        } else {
          scheduleTerminalRefresh(entry);
        }
      }
    } catch {
      for (const entry of batch) {
        notify(entry, {
          status: "unavailable",
          reason: "verdict_api_unavailable",
          enforced: mode === "enforce",
        });
        scheduleRetry(entry);
      }
    }
  }

  function flush(): void {
    if (closed || queued.size === 0) return;
    const batch = [...queued.values()].slice(0, 100);
    for (const entry of batch) queued.delete(entry.key);
    const request = send(batch).finally(() => {
      activeRequests.delete(request);
      if (queued.size > 0) queue([...queued.values()][0] as Entry);
    });
    activeRequests.add(request);
  }

  function watch(event: Event, item: MediaItem, listener: VerdictListener): () => void {
    if (
      item.type === "audio" ||
      !enabledMediaTypes.has(item.type) ||
      mode === "off" ||
      !normalizedBaseUrl
    ) {
      listener(disabledVerdict());
      return () => undefined;
    }

    const key = keyFor(event, item);
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        key,
        event,
        item,
        verdict: {
          status: "pending",
          reason: "verdict_requested",
          enforced: mode === "enforce",
        },
        listeners: new Set(),
        retryAttempt: 0,
      };
      entries.set(key, entry);
      queue(entry);
    } else if (
      entry.verdict.expiresAt &&
      entry.verdict.expiresAt <= Date.now()
    ) {
      notify(entry, {
        status: "stale",
        reason: "verdict_expired",
        enforced: mode === "enforce",
      });
      queue(entry);
    }
    entry.listeners.add(listener);
    listener(entry.verdict);
    if (
      entry.verdict.status !== "pending" &&
      entry.verdict.status !== "unavailable" &&
      entry.verdict.status !== "stale"
    ) {
      scheduleTerminalRefresh(entry);
    }

    return () => {
      entry?.listeners.delete(listener);
      if (entry?.listeners.size === 0 && entry.retryTimer) {
        clearTimeout(entry.retryTimer);
        entry.retryTimer = undefined;
      }
    };
  }

  function initialVerdict(item: MediaItem): MediaPresentationVerdict {
    if (
      item.type === "audio" ||
      !enabledMediaTypes.has(item.type) ||
      mode === "off" ||
      !normalizedBaseUrl
    ) {
      return disabledVerdict();
    }
    return {
      status: "pending",
      reason: "verdict_requested",
      enforced: mode === "enforce",
    };
  }

  async function waitForIdle(timeoutMs = 2_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (flushTimer || queued.size > 0 || activeRequests.size > 0) {
      if (Date.now() >= deadline) return false;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    return true;
  }

  function close(): void {
    closed = true;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = undefined;
    for (const entry of entries.values()) {
      if (entry.retryTimer) clearTimeout(entry.retryTimer);
      entry.listeners.clear();
    }
    queued.clear();
  }

  return { close, initialVerdict, waitForIdle, watch };
}
