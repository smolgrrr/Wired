import { useMemo, useState } from "react";
import { subNotesOnce } from "../nostr/subscriptions";
import { toProcessedEvents } from "../nostr/processEvents";
import { uniqBy } from "@lib/collections";
import { useThreadEvents } from "./useThreadEvents";
import { useNostrSubscription } from "../shared/hooks/useNostrSubscription";

export function useThreadViewModel(hexID: string) {
  const [showAllReplies, setShowAllReplies] = useState(true);
  const { noteEvents } = useThreadEvents(hexID);

  const allEvents = useMemo(() => {
    const threadCache = JSON.parse(sessionStorage.getItem("cachedThread") || "[]");
    return [...noteEvents, ...threadCache];
  }, [noteEvents]);

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

    const uniqMentions = uniqBy(prevMentions, "id");
    const earlierIds = new Set(
      uniqMentions
        .filter((e) => e.created_at < opEvent.created_at)
        .map((e) => e.id),
    );
    const posts = uniqBy(allEvents, "id").filter(
      (event) => !earlierIds.has(event.id) && opEvent.id !== event.id,
    );

    return toProcessedEvents(posts, noteEvents);
  }, [opEvent, prevMentions, allEvents, noteEvents]);

  const earlierEvents = useMemo(() => {
    if (!opEvent) return [];

    return uniqBy(prevMentions, "id")
      .filter((e) => e.created_at < opEvent.created_at)
      .filter((event) => event.kind === 1)
      .sort((a, b) => a.created_at - b.created_at);
  }, [opEvent, prevMentions]);

  const uniqMentions = useMemo(() => uniqBy(prevMentions, "id"), [prevMentions]);

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
