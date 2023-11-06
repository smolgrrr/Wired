import { useEffect, useState } from "react";
import PostCard from "./PostCard/PostCard";
import NewThreadCard from "./PostCard/NewThreadCard";
import { getPow } from "../utils/mine";
import { Event } from "nostr-tools";
import { subGlobalFeed } from "../utils/subscriptions";
import { uniqBy } from "../utils/utils";
// import PWAInstallPopup from "./Modals/PWACheckModal"; // Removed as it's not being used

const Home = () => {
  // State declarations
  const [events, setEvents] = useState<Event[]>([]);
  const [filterDifficulty, setFilterDifficulty] = useState(localStorage.getItem("filterDifficulty") || "20");
  const [sortByPoW, setSortByPoW] = useState(true);
  // const [inBrowser, setInBrowser] = useState(false); // Removed as it's not being used

  // Function to handle new events
  const onEvent = (event: Event) => {
    setEvents((prevEvents) => [...prevEvents, event]);
  };

  useEffect(() => {
    // Subscribe to the global feed
    subGlobalFeed(onEvent);

    // Event listener to handle difficulty changes
    const handleDifficultyChange = (event: any) => {
      const { filterDifficulty } = event.detail;
      setFilterDifficulty(filterDifficulty);
    };

    // Attach event listener
    window.addEventListener("difficultyChanged", handleDifficultyChange);

    // Cleanup listener on component unmount
    return () => {
      window.removeEventListener("difficultyChanged", handleDifficultyChange);
    };
  }, []);

  // Get unique events based on id
  const uniqEvents = events.length > 0 ? uniqBy(events, "id") : [];

  // Filter and sort events
  const filteredEvents = uniqEvents
    .filter((event) =>
      getPow(event.id) > Number(filterDifficulty) &&
      event.kind === 1 &&
      !event.tags.some((tag) => tag[0] === "e")
    )

  const toggleSort = () => {
    setSortByPoW(prev => !prev);
  };

  // Events sorted by time
  const eventsSortedByTime = [...filteredEvents].sort((a, b) => b.created_at - a.created_at);

  // Events sorted by PoW (assuming `getPow` returns a numerical representation of the PoW)
  const eventsSortedByPow = [...filteredEvents].sort((a, b) => getPow(b.id) - getPow(a.id));

  const displayedEvents = sortByPoW ? eventsSortedByPow : eventsSortedByTime;

  // Get metadata for an event
  const getMetadataEvent = (event: Event) => {
    return uniqEvents.find((e) => e.pubkey === event.pubkey && e.kind === 0) || null;
  };

  // Count replies for an event
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
              checked={sortByPoW}
              onChange={toggleSort}
            />
            <div className="block bg-gray-600 w-10 h-6 rounded-full"></div>
            <div
              className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition ${sortByPoW ? 'transform translate-x-full bg-blue-400' : ''
                }`}
            ></div>
          </div>
          <div className={`ml-3 text-neutral-500 font-medium ${sortByPoW ? 'text-neutral-500' : ''}`}>
            {sortByPoW ? 'Sort by PoW' : 'Sort by recent'}
          </div>
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {displayedEvents.map((event) => (
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
