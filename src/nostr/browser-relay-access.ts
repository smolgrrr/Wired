import type { Event, Filter } from "nostr-tools";

export type RelayCompletionState =
  | "eose"
  | "closed"
  | "connect-failed"
  | "timed-out"
  | "cancelled";

export type RelayCompletion = {
  relayUrl: string;
  state: RelayCompletionState;
};

export type QueryCompletion = {
  reason: "settled" | "deadline" | "cancelled";
  targets: readonly RelayCompletion[];
  receivedEvents: number;
};

export type FiniteQuery = {
  workflowOwner:
    | "wired.browser.thread"
    | "wired.browser.feed"
    | "wired.browser.notifications"
    | "wired.browser.quotes"
    | "wired.browser.profiles";
  filters: Filter[];
  coverage: {
    configuredRelayUrls: readonly string[];
    hintedRelayUrls?: readonly string[];
  };
  completionDeadlineMs: number;
  signal?: AbortSignal;
  onEvent(event: Event, relayUrl: string): void;
};

export type QueryHandle = {
  done: Promise<QueryCompletion>;
  close(): void;
};

export interface BrowserRelayAccess {
  connectConfigured(urls: readonly string[]): Promise<void>;
  startFiniteQuery(query: FiniteQuery): QueryHandle;
  publish(event: Event): Promise<ReadonlySet<string>>;
}
