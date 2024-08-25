import { useState, useEffect } from 'react';
import { verifyPow } from '../utils/mine';
import { useFetchEvents } from './useFetchEvents';
import { Event } from 'nostr-tools';

type ProcessedEvent = {
  postEvent: Event;
  replies: Event[];
  totalWork: number;
  metadataEvent: Event | null; // Added metadataEvent to the type
};

const useProcessedEvents = (id?: string, filterDifficulty: number = 0) => {
  const { noteEvents, metadataEvents } = useFetchEvents(id, false); // Reintroduced metadataEvents
  const [processedEvents, setProcessedEvents] = useState<ProcessedEvent[]>([]);

  useEffect(() => {
    const processed = noteEvents
      .filter(event => verifyPow(event) >= filterDifficulty && event.kind !== 0)
      .filter(event => !(event.kind === 1 && event.tags.some(tag => tag[0] === 'e')))
      .map(event => {
        const replies = noteEvents.filter(e => e.tags.some(tag => tag[0] === 'e' && tag[1] === event.id));
        const totalWork = Math.pow(2, verifyPow(event)) + replies.reduce((acc, reply) => acc + Math.pow(2, verifyPow(reply)), 0);
        const metadataEvent = metadataEvents.find((e) => e.pubkey === event.pubkey && e.kind === 0) || null; // Find the corresponding metadataEvent
        return { postEvent: event, replies, totalWork, metadataEvent }; // Include metadataEvent in the returned object
      })
      .sort((a, b) => b.totalWork - a.totalWork || b.postEvent.created_at - a.postEvent.created_at);

    setProcessedEvents(processed);
  }, [noteEvents, metadataEvents, id, filterDifficulty]); // Include metadataEvents in the dependency array

  return { processedEvents };
};

export default useProcessedEvents;