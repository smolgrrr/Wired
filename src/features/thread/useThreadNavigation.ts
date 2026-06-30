import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { nip19, type Event } from "nostr-tools";
import { writeThreadSeedEvents } from "./threadSeedCache";

export function useThreadNavigation() {
  const navigate = useNavigate();

  return useCallback(
    (event: Event, relatedEvents: Event[]) => {
      writeThreadSeedEvents(event.id, relatedEvents);
      navigate(`/thread/${nip19.noteEncode(event.id)}`);
    },
    [navigate],
  );
}
