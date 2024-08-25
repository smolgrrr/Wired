import { verifyPow } from "../../utils/mine";
import { Event } from "nostr-tools";
import NewNoteCard from "../forms/PostFormCard";
import { DEFAULT_DIFFICULTY } from "../../config";
import PostCard from "../modals/PostCard";
import { useFetchEvents } from "../../hooks/useFetchEvents";
import { useState, useEffect } from "react";

const Home = () => {
  const filterDifficulty = localStorage.getItem("filterDifficulty") || DEFAULT_DIFFICULTY;
  const { noteEvents, metadataEvents } = useFetchEvents();
  const [isAnimating, setIsAnimating] = useState(true);

  // Step 3: Use useEffect to remove the animation class after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAnimating(false);
    }, 3000); // 3000 milliseconds = 3 seconds

    return () => clearTimeout(timer); // Cleanup the timer
  }, []); // Empty dependency array means this effect runs once on mount


  const postEvents: Event[] = noteEvents
    .filter((event) =>
      verifyPow(event) >= Number(filterDifficulty) &&
      event.kind !== 0 &&
      (event.kind !== 1 || !event.tags.some((tag) => tag[0] === "e"))
    )

  const postEventsWithReplies = postEvents.map((event) => {
    const totalWork = Math.pow(2, verifyPow(event)) 
      + noteEvents.filter((e) => e.tags.some((tag) => tag[0] === "e" && tag[1] === event.id))
      .reduce((acc, reply) => acc + Math.pow(2, verifyPow(reply)), 0);
    return {
      postEvent: event,
      replies: noteEvents.filter((e) => e.tags.some((tag) => tag[0] === "e" && tag[1] === event.id)),
      totalWork: totalWork, // Add total work here
    };
  });

  const sortedEvents = postEventsWithReplies
  .sort((a, b) => {
    // Sort by total work in descending order
    const workDiff = b.totalWork - a.totalWork;
    if (workDiff !== 0) return workDiff;
  
    // If total work is the same, sort by created_at in descending order
    return b.postEvent.created_at - a.postEvent.created_at;
  });

  // Render the component
  return (
    <main className="text-white mb-20">
      <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
        <NewNoteCard />
      </div>
      <div className={`grid grid-cols-1 max-w-xl mx-auto gap-1 px-4 ${isAnimating ? 'animate-pulse' : ''}`}>
        {sortedEvents.map((event) => (
            <PostCard
              key={event.postEvent.id}
              event={event.postEvent}
              metadata={metadataEvents.find((e) => e.pubkey === event.postEvent.pubkey && e.kind === 0) || null}
              replies={event.replies}
            />
        ))}
      </div>
    </main>
  );
};

export default Home;
