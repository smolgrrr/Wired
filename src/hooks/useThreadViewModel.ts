import { useMemo, useState } from "react";
import type { Event } from "nostr-tools";
import { subReferencedEventsOnce } from "../nostr/subscriptions";
import { scoreThreadPost } from "../nostr/processEvents";
import { uniqBy } from "@lib/collections";
import { useThreadEvents } from "./useThreadEvents";
import { useNostrSubscription } from "../shared/hooks/useNostrSubscription";
import { useModerationManifest } from "../shared/hooks/useModerationManifest";
import { filterModeratedEvents } from "../shared/lib/moderation";
import { extractEventTagRefs } from "../shared/lib/quotedEvents";

export function useThreadViewModel(
  hexID: string,
  seedEvents: Event[] = [],
  relayHints?: readonly string[],
) {
  const [showAllReplies, setShowAllReplies] = useState(true);
  const moderationManifest = useModerationManifest();
  const { noteEvents, traversalCompletion } = useThreadEvents(hexID, relayHints);

  const allEvents = useMemo(() => {
    return filterModeratedEvents([...noteEvents, ...seedEvents], moderationManifest);
  }, [noteEvents, seedEvents, moderationManifest]);

  const eventsById = useMemo(
    () => new Map(allEvents.map((event) => [event.id, event])),
    [allEvents],
  );

  const opEvent = allEvents.find((event) => event.id === hexID);

  const opMentionRefs = useMemo(() => {
    return opEvent ? extractEventTagRefs(opEvent) : [];
  }, [opEvent]);

  const prevMentions = useNostrSubscription(
    (onEvent) => subReferencedEventsOnce(opMentionRefs, onEvent),
    [JSON.stringify(opMentionRefs)],
    Boolean(opEvent && opMentionRefs.length > 0),
  );

  const replyEvents = useMemo(() => {
    if (!opEvent) return [];

    const visibleMentions = filterModeratedEvents(prevMentions, moderationManifest);
    const uniqMentions = uniqBy(visibleMentions, "id");
    const earlierIds = new Set(
      uniqMentions
        .filter((e) => e.created_at < opEvent.created_at)
        .map((e) => e.id),
    );
    const posts = uniqBy(allEvents, "id").filter(
      (event) => !earlierIds.has(event.id) && opEvent.id !== event.id,
    );

    return posts
      .map((postEvent) => scoreThreadPost(postEvent, allEvents))
      .sort((a, b) => a.postEvent.created_at - b.postEvent.created_at);
  }, [opEvent, prevMentions, allEvents, moderationManifest]);

  const opScore = useMemo(() => {
    if (!opEvent) return undefined;
    return scoreThreadPost(opEvent, allEvents);
  }, [opEvent, allEvents]);

  const earlierEvents = useMemo(() => {
    if (!opEvent) return [];

    return uniqBy(filterModeratedEvents(prevMentions, moderationManifest), "id")
      .filter((e) => e.created_at < opEvent.created_at)
      .filter((event) => event.kind === 1)
      .sort((a, b) => a.created_at - b.created_at);
  }, [opEvent, prevMentions, moderationManifest]);

  const uniqMentions = useMemo(
    () => uniqBy(filterModeratedEvents(prevMentions, moderationManifest), "id"),
    [prevMentions, moderationManifest],
  );

  return {
    opEvent,
    opScore,
    earlierEvents,
    replyEvents,
    eventsById,
    showAllReplies,
    setShowAllReplies,
    uniqMentions,
    traversalCompletion,
  };
}
