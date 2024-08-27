import { useState, useEffect } from "react";
import { subGlobalFeed, subHashtagFeed, subNote, subNotifications, subNotesOnce} from "../utils/subscriptions";
import { uniqBy } from "../utils/otherUtils";
import { Event } from "nostr-tools";

export const useFetchEvents = (hashtag?: string, notifications?: boolean, OP_eventID?: string) => {
    const [events, setEvents] = useState<Event[]>([]);
    const age = Number(localStorage.getItem("age")) || 24;
  
    // Load cached metadataEvents from localStorage
    const [cachedMetadataEvents, setCachedMetadataEvents] = useState<Event[]>(
      JSON.parse(localStorage.getItem("cachedMetadataEvents") || "[]")
    );
  
    useEffect(() => {
      const onEvent = (event: Event) => {
        setEvents((prevEvents) => [...prevEvents, event]);
  
        // If the new event is a metadata event, add it to the cached metadata events
        if (event.kind === 0) {
          setCachedMetadataEvents((prevMetadataEvents) => {
            // Check if the event already exists in the cached metadata events
            const existingEvent = prevMetadataEvents.find(
              (e) => e.id === event.id || e.pubkey === event.pubkey
            );
            if (!existingEvent) {
              // If the event doesn't exist, add it to the cached metadata events
              return [...prevMetadataEvents, event];
            } else if (existingEvent && existingEvent.created_at < event.created_at) {
              // Remove any existing metadata event with the same pubkey and id
              const updatedMetadataEvents = prevMetadataEvents.filter(
                (e) => e.id !== existingEvent.id
              );
              // Add the new metadata event
              return [...updatedMetadataEvents, event];
            }
            // If the event already exists, return the previous cached metadata events
            return prevMetadataEvents;
          });
        }
      };
  
      let unsubscribe;
      if (hashtag) {
        // Code from the second function
        unsubscribe = subHashtagFeed(hashtag, onEvent, age);
      } else if (OP_eventID) {
        unsubscribe = subNote(OP_eventID, onEvent);
      } else if (notifications) {
        // Code from the third function
        let storedKeys = JSON.parse(localStorage.getItem("usedKeys") || "[]");
        let storedPubkeys = storedKeys.map((key: any[]) => key[1]);
        unsubscribe = subNotifications(storedPubkeys, onEvent);
      } else {
        // Code from the first function
        unsubscribe = subGlobalFeed(onEvent, age);
      }
  
      return unsubscribe;
    }, []);
  
    const uniqEvents = uniqBy(events, "id");
  
    const noteEvents = uniqEvents.filter((event) => event.kind === 1 || event.kind === 6);
    const metadataEvents = [...cachedMetadataEvents, ...uniqEvents.filter((event) => event.kind === 0)];
  
    // Save the cached metadataEvents to localStorage
    useEffect(() => {
      localStorage.setItem("cachedMetadataEvents", JSON.stringify(cachedMetadataEvents));
    }, [cachedMetadataEvents]);
  
    return { noteEvents, metadataEvents };
  };