import { useState, useEffect, useMemo } from 'react'; // Import useMemo
import { verifyPow } from '../utils/mine';
import { useFetchEvents } from './useFetchEvents';
import { Event } from 'nostr-tools';

type ProcessedEvent = {
  postEvent: Event;
  replies: Event[];
  totalWork: number;
  metadataEvent: Event | null;
};

const useProcessedEvents = (id?: string, filterDifficulty: number = 0) => {
  const { noteEvents, metadataEvents } = useFetchEvents(id, false);
  const [processedEvents, setProcessedEvents] = useState<ProcessedEvent[]>([]);

  // Use useMemo to memoize the processed events
  const processed = useMemo(() => {
    // Create a map for replies to optimize lookup
    const repliesMap = new Map<string, Event[]>();
    noteEvents.forEach(event => {
      if (event.kind === 1) { // Only consider kind 1 events as replies
        event.tags.forEach(tag => {
          if (tag[0] === 'e') {
            const replyToId = tag[1];
            if (!repliesMap.has(replyToId)) {
              repliesMap.set(replyToId, []);
            }
            repliesMap.get(replyToId)?.push(event);
          }
        });
      }
    });

    // Create a Set to keep track of seen pubkeys
    const seenPubkeys = new Set<string>();

    return noteEvents
      .filter(event => {
        const pow = verifyPow(event);
        // Check if the pubkey has been seen before
        if (seenPubkeys.has(event.pubkey)) {
          return false;
        }
        // Add the pubkey to the set if it passes the filter
        if ((event.kind === 0 || pow >= filterDifficulty) && !(event.kind === 1 && event.tags.some(tag => tag[0] === 'e'))) {
          seenPubkeys.add(event.pubkey);
          return true;
        }
        return false;
      })
      .map(event => {
        const pow = verifyPow(event); // Calculate once and reuse

        if (event.kind === 6) {
          const parsedEvent = JSON.parse(event.content);
          const replies = repliesMap.get(parsedEvent.id) || [];
          const totalWork = Math.pow(2, pow) + replies.reduce((acc, reply) => acc + Math.pow(2, verifyPow(reply)), 0);
          const metadataEvent = metadataEvents.find(e => e.pubkey === parsedEvent.pubkey && e.kind === 0) || null;

          return { postEvent: event, replies, totalWork, metadataEvent };
        }

        const replies = repliesMap.get(event.id) || [];
        const totalWork = Math.pow(2, pow) + replies.reduce((acc, reply) => acc + Math.pow(2, verifyPow(reply)), 0);
        const metadataEvent = metadataEvents.find(e => e.pubkey === event.pubkey && e.kind === 0) || null;
        return { postEvent: event, replies, totalWork, metadataEvent };
      })
      .sort((a, b) => b.totalWork - a.totalWork || b.postEvent.created_at - a.postEvent.created_at);
  }, [noteEvents, metadataEvents, id, filterDifficulty]); // Dependencies for useMemo

  useEffect(() => {
    setProcessedEvents(processed);
  }, [processed]); // Depend on the memoized processed events

  return { processedEvents };
};

export default useProcessedEvents;