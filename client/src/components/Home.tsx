import { useEffect, useState, useCallback, useMemo } from "react";
import PostCard from "./Modals/NoteCard";
import { uniqBy } from "../utils/otherUtils"; // Assume getPow is a correct import now
import { subGlobalFeed } from "../utils/subscriptions";
import { verifyPow } from "../utils/mine";
import { Event } from "nostr-tools";
import NewNoteCard from "./Forms/PostFormCard";
import RepostCard from "./Modals/RepostCard";
import OptionsBar from "./Modals/OptionsBar";

const DEFAULT_DIFFICULTY = 20;

const useUniqEvents = () => {
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
          const existingEvent = prevMetadataEvents.find((e) => e.id === event.id || e.pubkey === event.pubkey)
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
    const unsubscribe = subGlobalFeed(onEvent, age);

    return unsubscribe;
  }, []);

  const uniqEvents = uniqBy(events, "id");

  const noteEvents = uniqEvents.filter(event => event.kind === 1 || event.kind === 6);
  const metadataEvents = [...cachedMetadataEvents, ...uniqEvents.filter(event => event.kind === 0)];

    // Save the cached metadataEvents to localStorage
    useEffect(() => {
      localStorage.setItem("cachedMetadataEvents", JSON.stringify(cachedMetadataEvents));
    }, [cachedMetadataEvents]);
  return { noteEvents, metadataEvents };
};

const Home = () => {
  const filterDifficulty = localStorage.getItem("filterDifficulty") || DEFAULT_DIFFICULTY;
  const [sortByTime, setSortByTime] = useState<boolean>(localStorage.getItem('sortBy') !== 'true');
  const [setAnon, setSetAnon] = useState<boolean>(localStorage.getItem('anonMode') !== 'true');
  const {noteEvents, metadataEvents } = useUniqEvents();
  const [delayedSort, setDelayedSort] = useState(false)

  const postEvents: Event[] = noteEvents
    .filter((event) =>
      verifyPow(event) >= Number(filterDifficulty) &&
      event.kind !== 0 &&
      (event.kind !== 1 || !event.tags.some((tag) => tag[0] === "e" || tag[0] === "a"))
    )
  
  // Delayed filtering
  useEffect(() => {
    const timer = setTimeout(() => {
      setDelayedSort(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  let sortedEvents = [...postEvents]
  .sort((a, b) =>
    sortByTime ? verifyPow(b) - verifyPow(a) : b.created_at - a.created_at
  )

  if (delayedSort) {
    sortedEvents = sortedEvents.filter(
      !setAnon ? (e) => !metadataEvents.some((metadataEvent) => metadataEvent.pubkey === e.pubkey) : () => true
    );
  } else {
    sortedEvents = sortedEvents.filter((e) => setAnon || e.tags.some((tag) => tag[0] === "client" && tag[1] === 'getwired.app'));
  }
  
  const toggleSort = useCallback(() => {
    setSortByTime(prev => {
      const newValue = !prev;
      localStorage.setItem('sortBy', String(newValue));
      return newValue;
    });
  }, []);

  const toggleAnon = useCallback(() => {
    setSetAnon(prev => {
      const newValue = !prev;
      localStorage.setItem('anonMode', String(newValue));
      return newValue;
    });
  }, []);

  const countReplies = (event: Event) => {
    return noteEvents.filter((e) => e.tags.some((tag) => tag[0] === "e" && tag[1] === event.id)).length;
  };

  // Render the component
  return (
    <main className="text-white mb-20">
      <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
        <NewNoteCard />
      </div>
      <OptionsBar sortByTime={sortByTime} setAnon={setAnon} toggleSort={toggleSort} toggleAnon={toggleAnon} />
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
        {sortedEvents.map((event) => (
          event.kind === 1 ?
            <PostCard
              event={event}
              metadata={metadataEvents.find((e) => e.pubkey === event.pubkey && e.kind === 0) || null}
              replyCount={countReplies(event)}
            />
            :
            <RepostCard
              event={event}
            />
        ))}
      </div>
    </main>
  );
};

export default Home;
