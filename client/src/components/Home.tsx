import { useEffect, useState, useCallback } from "react";
import PostCard from "./Modals/NoteCard";
import { uniqBy } from "../utils/otherUtils"; // Assume getPow is a correct import now
import { subGlobalFeed } from "../utils/subscriptions";
import { verifyPow } from "../utils/mine";
import { Event } from "nostr-tools";
import NewNoteCard from "./Forms/PostFormCard";
import RepostCard from "./Modals/RepostCard";

const DEFAULT_DIFFICULTY = 20;

const useUniqEvents = () => {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    const onEvent = (event: Event) => setEvents((prevEvents) => [...prevEvents, event]);
    const unsubscribe = subGlobalFeed(onEvent);

    return unsubscribe;
  }, []);

  const uniqEvents = uniqBy(events, "id");

  const noteEvents = uniqEvents.filter(event => event.kind === 1 || event.kind === 6);
  const metadataEvents = uniqEvents.filter(event => event.kind === 0);

  return { noteEvents, metadataEvents };
};

const Home = () => {
  const filterDifficulty = localStorage.getItem("filterDifficulty") || DEFAULT_DIFFICULTY;
  const [sortByTime, setSortByTime] = useState<boolean>(localStorage.getItem('sortBy') !== 'false');
  const [setAnon, setSetAnon] = useState<boolean>(localStorage.getItem('anonMode') !== 'false');
  const { noteEvents, metadataEvents } = useUniqEvents();

  const postEvents = noteEvents
    .filter((event) =>
      verifyPow(event) >= Number(filterDifficulty) &&
      event.kind !== 0 &&
      (event.kind !== 1 || !event.tags.some((tag) => tag[0] === "e"))
    )

  const sortedEvents = [...postEvents]
  .sort((a, b) =>
    sortByTime ? b.created_at - a.created_at : verifyPow(b) - verifyPow(a)
  )
  .filter(
    !setAnon ? (e) => !metadataEvents.some((metadataEvent) => metadataEvent.pubkey === e.pubkey) : () => true
  );

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
      <div className="flex w-full px-8 z-2">
        <label htmlFor="toggleA" className="flex items-center cursor-pointer">
          <div className="relative">
            <input
              id="toggleA"
              type="checkbox"
              className="sr-only"
              checked={sortByTime}
              onChange={toggleSort}
            />
            <div className="block bg-gray-600 w-8 h-4 rounded-full"></div>
            <div className={`dot absolute left-1 top-0.5 bg-white w-3 h-3 rounded-full transition ${sortByTime ? 'transform translate-x-full bg-blue-400' : ''}`} ></div>
          </div>
          <div className={`ml-2 text-neutral-500 text-sm ${sortByTime ? 'text-neutral-500' : ''}`}>
            {sortByTime ? 'Time' : 'PoW'}
          </div>
        </label>
        <label htmlFor="toggleB" className="flex items-center cursor-pointer ml-4"> {/* Add margin-left here */}
          <div className="relative">
            <input
              id="toggleB"
              type="checkbox"
              className="sr-only"
              checked={setAnon}
              onChange={toggleAnon}
            />
            <div className="block bg-gray-600 w-8 h-4 rounded-full"></div>
            <div className={`dot absolute left-1 top-0.5 bg-white w-3 h-3 rounded-full transition ${setAnon ? 'transform translate-x-full bg-blue-400' : ''}`} ></div>
          </div>
          <div className={`ml-2 text-neutral-500 text-sm ${setAnon ? 'text-neutral-500' : ''}`}>
            {setAnon ? 'Namefags' : 'Anon'}
          </div>
        </label>
      </div>
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
