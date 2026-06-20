import type { Event } from "nostr-tools";
import type { ProcessedEvent } from "../../nostr/types";
import type { ProfileMetadata } from "./profile";

export type FeedBootstrapResponse = {
  fetchedAt: number;
  processedEvents: ProcessedEvent[];
  profiles: Record<string, ProfileMetadata>;
};

export function eventsFromProcessed(processedEvents: ProcessedEvent[]): Event[] {
  const events: Event[] = [];
  const seen = new Set<string>();

  processedEvents.forEach((processed) => {
    [processed.postEvent, ...processed.replies].forEach((event) => {
      if (seen.has(event.id)) return;
      seen.add(event.id);
      events.push(event);
    });
  });

  return events;
}

export {
  BOOTSTRAP_AGE_HOURS,
  BOOTSTRAP_FILTER_DIFFICULTY,
  canUseFeedBootstrap,
} from "../../../lib/feedBootstrap";