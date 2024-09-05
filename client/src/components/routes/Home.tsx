import NewNoteCard from "../forms/PostFormCard";
import { DEFAULT_DIFFICULTY } from "../../config";
import PostCard from "../modals/PostCard";
import { useState, useEffect, useMemo } from "react";
import useProcessedEvents from "../../hooks/processedEvents";
import HashtagBar from "../modals/HashtagBar";

const Home = () => {
  const filterDifficulty = useMemo(() => {
    return Number(localStorage.getItem('filterDifficulty')) || DEFAULT_DIFFICULTY;
  }, []);

  const { processedEvents } = useProcessedEvents(undefined, filterDifficulty);
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAnimating(false);
    }, 4000);

    return () => clearTimeout(timer);
  }, []);

  // Render the component
  return (
    <main className="text-white mb-20">
      <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
        <NewNoteCard />
        <HashtagBar />
      </div>
      <div className={`grid grid-cols-1 max-w-xl mx-auto gap-1 ${isAnimating ? 'animate-pulse' : ''}`}>
        {processedEvents.map((event) => (
            <PostCard
              key={event.postEvent.id}
              event={event.postEvent}
              metadata={event.metadataEvent}
              replies={event.replies}
            />
        ))}
      </div>
    </main>
  );
};

export default Home;
