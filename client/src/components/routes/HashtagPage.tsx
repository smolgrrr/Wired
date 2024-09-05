import PostCard from "../modals/PostCard";
import NewNoteCard from "../forms/PostFormCard";
import { useParams } from "react-router-dom";
import useProcessedEvents from "../../hooks/processedEvents";
import HashtagBar from "../modals/HashtagBar";
import { useState, useEffect } from "react";

const DEFAULT_DIFFICULTY = 0;

const HashtagPage = () => {
  const { id } = useParams();
  const filterDifficulty = DEFAULT_DIFFICULTY;
  const { processedEvents } = useProcessedEvents(id as string, filterDifficulty);
  const [visibleEvents, setVisibleEvents] = useState(10);
  const [isAnimating, setIsAnimating] = useState(true);

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

  // Render the component
  return (
    <main className="text-white mb-20">
      <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
        <NewNoteCard hashtag={id as string} />
        <HashtagBar />
      </div>
      <div className={`grid grid-cols-1 max-w-xl mx-auto gap-1 ${isAnimating ? 'animate-pulse' : ''}`}>
        {processedEvents.slice(0, visibleEvents).map((event) =>
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