import PostCard from "../modals/PostCard";
import NewNoteCard from "../forms/PostFormCard";
import { useParams } from "react-router-dom";
import useProcessedEvents from "../../hooks/processedEvents";
import HashtagBar from "../modals/HashtagBar";
import { useState, useEffect, useMemo } from "react";
import { Event } from "nostr-tools";
import { CpuChipIcon } from '@heroicons/react/24/outline';

const DEFAULT_DIFFICULTY = 0;

const HashtagPage = () => {
  const { id } = useParams();
  const filterDifficulty = DEFAULT_DIFFICULTY;
  const { processedEvents } = useProcessedEvents(id as string, filterDifficulty);
  const [visibleEvents, setVisibleEvents] = useState(10);
  const [isAnimating, setIsAnimating] = useState(true);
  const [sortOrder, setSortOrder] = useState<boolean>(localStorage.getItem('sortBy') !== 'false');

  const handleScroll = () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight) {
      setVisibleEvents((prev) => prev + 10);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAnimating(false);
    }, 4000);

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const sortedEvents = useMemo(() => {
    return [...processedEvents].sort((a, b) => {
      if (!sortOrder) {
        return b.postEvent.created_at - a.postEvent.created_at;
      } else {
        return 0; // Keep original order if not sorting by ascending time
      }
    });
  }, [processedEvents, sortOrder]);

  const toggleSortOrder = () => {
    setSortOrder(prev => {
      const newValue = !prev;
      localStorage.setItem('sortBy', String(newValue));
      return newValue;
    });
  };

  return (
    <main className="text-white mb-20">
      <div className="my-3">
      <div className="w-full px-3 sm:px-0 sm:max-w-4xl mx-auto flex">
        <label htmlFor="toggleA" className="flex flex-col items-center cursor-pointer mr-1">
          <div className="mb-2 text-neutral-500 text-sm">
            <CpuChipIcon className="h-4 w-4" />
          </div>
          <div className="relative">
            <input
              id="toggleA"
              type="checkbox"
              className="sr-only"
              checked={!sortOrder}
              onChange={toggleSortOrder}
            />
            <div className="block bg-gray-600 w-4 h-8 rounded-full"></div>
            <div className={`dot absolute left-0.5 top-1 bg-white w-3 h-3 rounded-full transition ${!sortOrder ? 'transform translate-y-full bg-blue-400' : ''}`}></div>
          </div>
          <div className="mt-2 text-neutral-500 text-xs">
            Time
          </div>
        </label>
        <div className="flex-grow">
          <NewNoteCard />
        </div>
      </div>
      <HashtagBar />
      </div>
      <div className={`grid grid-cols-1 max-w-xl mx-auto gap-1 ${isAnimating ? 'animate-pulse' : ''}`}>
        {sortedEvents.slice(0, visibleEvents).map((event) =>
          <PostCard
            key={event.postEvent.id}
            event={event.postEvent}
            metadata={event.metadataEvent}
            replies={event.replies}
          />
        )}
      </div>
    </main>
  );
};

export default HashtagPage;