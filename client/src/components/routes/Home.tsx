import NewNoteCard from "../forms/PostFormCard";
import { DEFAULT_DIFFICULTY } from "../../config";
import PostCard from "../modals/PostCard";
import { useState, useEffect } from "react";
import useProcessedEvents from "../../hooks/processedEvents";

const Home = () => {
  const filterDifficulty = Number(localStorage.getItem('filterDifficulty')) || DEFAULT_DIFFICULTY;
  const { processedEvents } = useProcessedEvents(undefined, filterDifficulty);
  const [isAnimating, setIsAnimating] = useState(true);

  // Step 3: Use useEffect to remove the animation class after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAnimating(false);
    }, 4000); // 3000 milliseconds = 3 seconds

    return () => clearTimeout(timer); // Cleanup the timer
  }, []); // Empty dependency array means this effect runs once on mount

  // Render the component
  return (
    <main className="text-white mb-20">
      <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
        <NewNoteCard />
      </div>
      <div className={`grid grid-cols-1 max-w-xl mx-auto gap-1 px-4 ${isAnimating ? 'animate-pulse' : ''}`}>
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
