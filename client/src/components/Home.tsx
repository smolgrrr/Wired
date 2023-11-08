import { useEffect, useState, useCallback } from "react";
import PostCard from "./Modals/Card";
import NewThreadCard from "./Forms/NewThreadCard";
import { uniqBy } from "../utils/utils"; // Assume getPow is a correct import now
import { subGlobalFeed } from "../utils/subscriptions";
import { verifyPow } from "../utils/mine";
import { Event } from "nostr-tools";

const DEFAULT_DIFFICULTY = 20;

const useUniqEvents = () => {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    const onEvent = (event: Event) => setEvents((prevEvents) => [...prevEvents, event]);
    const unsubscribe = subGlobalFeed(onEvent);

    return unsubscribe;
  }, []);

  return uniqBy(events, "id");
};

const Home = () => {
  const filterDifficulty = localStorage.getItem("filterDifficulty") || DEFAULT_DIFFICULTY;
  const [sortByTime, setSortByTime] = useState(true);
  const uniqEvents = useUniqEvents();

  const postEvents = uniqEvents
    .filter((event) =>
      verifyPow(event) >= Number(filterDifficulty) &&
      event.kind === 1 &&
      !event.tags.some((tag) => tag[0] === "e")
    )

  const sortedEvents = [...postEvents].sort((a, b) =>
    sortByTime ? b.created_at - a.created_at : verifyPow(b) - verifyPow(a)
  );

  const toggleSort = useCallback(() => {
    setSortByTime(prev => !prev);
  }, []);

  const getMetadataEvent = (event: Event) => {
    return uniqEvents.find((e) => e.pubkey === event.pubkey && e.kind === 0) || null;
  };

  const countReplies = (event: Event) => {
    return uniqEvents.filter((e) => e.tags.some((tag) => tag[0] === "e" && tag[1] === event.id)).length;
  };

  // Render the component
  return (
    <main className="text-white mb-20">
      <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
        <NewThreadCard />
      </div>
      <div className="flex items-center justify-center w-full py-4">
        <label htmlFor="toggleB" className="flex items-center cursor-pointer">
          <div className="relative">
            <input
              id="toggleB"
              type="checkbox"
              className="sr-only"
              checked={sortByTime}
              onChange={toggleSort}
            />
            <div className="block bg-gray-600 w-10 h-6 rounded-full"></div>
            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition ${sortByTime ? 'transform translate-x-full bg-blue-400' : '' }`} ></div>
          </div>
          <div className={`ml-3 text-neutral-500 font-medium ${sortByTime ? 'text-neutral-500' : ''}`}>
            {sortByTime ? 'Sort by recent' : 'Sort by PoW'}
          </div>
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {sortedEvents.map((event) => (
          <PostCard
            key={event.id}
            event={event}
            metadata={getMetadataEvent(event)}
            replyCount={countReplies(event)}
          />
        ))}
      </div>
    </main>
  );
};

export default Home;
