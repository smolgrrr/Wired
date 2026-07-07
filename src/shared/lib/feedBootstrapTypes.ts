import type { Event } from "nostr-tools";
import type { ProfileMetadata } from "./profile";

export type FeedBootstrapSnapshot = {
  fetchedAt: number;
  processedEvents: FeedBootstrapProcessedEvent[];
  eventsById: Record<string, Event>;
  relayHintsByEventId: Record<string, string[]>;
  profiles: Record<string, ProfileMetadata>;
  scoring: {
    ageHours: number;
    minPow: number;
    replyDepth: number;
    sort: "totalWork";
  };
};

export type FeedBootstrapProcessedEvent = {
  postEventId: string;
  replyIds: string[];
  relayHints?: string[];
  threadReplyCount: number;
  rootWork: number;
  replyWork: number;
  totalWork: number;
  rankingReplyCount: number;
};

function isEvent(value: unknown): value is Event {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<Event>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.pubkey === "string" &&
    typeof candidate.created_at === "number" &&
    typeof candidate.kind === "number" &&
    Array.isArray(candidate.tags) &&
    typeof candidate.content === "string" &&
    typeof candidate.sig === "string"
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isProcessedEvent(value: unknown): value is FeedBootstrapProcessedEvent {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<FeedBootstrapProcessedEvent>;
  return (
    typeof candidate.postEventId === "string" &&
    isStringArray(candidate.replyIds) &&
    (candidate.relayHints === undefined || isStringArray(candidate.relayHints)) &&
    typeof candidate.threadReplyCount === "number" &&
    typeof candidate.rootWork === "number" &&
    typeof candidate.replyWork === "number" &&
    typeof candidate.totalWork === "number" &&
    typeof candidate.rankingReplyCount === "number"
  );
}

export function isFeedBootstrapSnapshot(
  value: unknown,
): value is FeedBootstrapSnapshot {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<FeedBootstrapSnapshot>;
  return (
    typeof candidate.fetchedAt === "number" &&
    Array.isArray(candidate.processedEvents) &&
    candidate.processedEvents.every(isProcessedEvent) &&
    !!candidate.eventsById &&
    typeof candidate.eventsById === "object" &&
    Object.values(candidate.eventsById).every(isEvent) &&
    !!candidate.relayHintsByEventId &&
    typeof candidate.relayHintsByEventId === "object" &&
    Object.values(candidate.relayHintsByEventId).every(isStringArray) &&
    !!candidate.profiles &&
    typeof candidate.profiles === "object" &&
    !!candidate.scoring &&
    typeof candidate.scoring === "object" &&
    typeof candidate.scoring.ageHours === "number" &&
    typeof candidate.scoring.minPow === "number" &&
    typeof candidate.scoring.replyDepth === "number" &&
    candidate.scoring.sort === "totalWork"
  );
}
