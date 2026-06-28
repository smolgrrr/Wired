import { useMemo, useState } from "react";
import { subNotesOnce } from "../nostr/subscriptions";
import { toProcessedEvents } from "../nostr/processEvents";
import { uniqBy } from "@lib/collections";
import { useThreadEvents } from "./useThreadEvents";
import { useNostrSubscription } from "../shared/hooks/useNostrSubscription";
import { useModerationManifest } from "../shared/hooks/useModerationManifest";
import { filterModeratedEvents } from "../shared/lib/moderation";

export function useThreadViewModel(hexID: string) {
  const [showAllReplies, setShowAllReplies] = useState(true);
  const moderationManifest = useModerationManifest();
  const { noteEvents } = useThreadEvents(hexID);

  const allEvents = useMemo(() => {
    const threadCache = JSON.parse(sessionStorage.getItem("cachedThread") || "[]");
    return filterModeratedEvents([...noteEvents, ...threadCache], moderationManifest);
  }, [noteEvents, moderationManifest]);

  const eventsById = useMemo(
    () => new Map(allEvents.map((event) => [event.id, event])),
    [allEvents],
  );

  const opEvent = allEvents.find((event) => event.id === hexID);

  const opMentionIds = useMemo(() => {
    if (!opEvent) return [];
    return opEvent.tags
      .filter((tag: string[]) => tag[0] === "e")
      .map((tag: string[]) => tag[1])
      .filter(Boolean);
  }, [opEvent]);

  const prevMentions = useNostrSubscription(
    (onEvent) => subNotesOnce(opMentionIds, onEvent),
    [opMentionIds.join(",")],
    Boolean(opEvent && opMentionIds.length > 0),
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

    return toProcessedEvents(
      posts,
      filterModeratedEvents(noteEvents, moderationManifest),
    );
  }, [opEvent, prevMentions, allEvents, noteEvents, moderationManifest]);

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
    earlierEvents,
    replyEvents,
    eventsById,
    showAllReplies,
    setShowAllReplies,
    uniqMentions,
  };
}
