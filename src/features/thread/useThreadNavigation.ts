import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { type Event } from "nostr-tools";
import { writeThreadSeedEvents } from "./threadSeedCache";
import { buildThreadPath } from "@lib/threadRefs";

export function useThreadNavigation() {
  const navigate = useNavigate();

  return useCallback(
    (
      event: Event,
      relatedEvents: Event[],
      relayHints: readonly string[] = [],
    ) => {
      writeThreadSeedEvents(event.id, relatedEvents);
      navigate(buildThreadPath(event.id, relayHints));
    },
    [navigate],
  );
}
