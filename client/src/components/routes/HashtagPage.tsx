import PostCard from "../modals/PostCard";
import { verifyPow } from "../../utils/mine";
import { Event } from "nostr-tools";
import NewNoteCard from "../forms/PostFormCard";
import { useParams } from "react-router-dom";
import { useFetchEvents } from "../../hooks/useFetchEvents";

const DEFAULT_DIFFICULTY = 0;

const HashtagPage = () => {
  const { id } = useParams();
  const filterDifficulty = localStorage.getItem("filterHashtagDifficulty") || DEFAULT_DIFFICULTY;
  const { noteEvents, metadataEvents } = useFetchEvents(id as string, false);

  const postEvents: Event[] = noteEvents
    .filter((event) =>
      verifyPow(event) >= Number(filterDifficulty) &&
      event.kind !== 0 &&
      (event.kind !== 1 || !event.tags.some((tag) => tag[0] === "e"))
    )

  let sortedEvents = [...postEvents]
    .sort((a, b) => {
      // Sort by PoW in descending order
      const powDiff = verifyPow(b) - verifyPow(a);
      if (powDiff !== 0) return powDiff;

      // If PoW is the same, sort by created_at in descending order
      return b.created_at - a.created_at;
  });

  // Render the component
  return (
    <main className="text-white mb-20">
      <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
        <NewNoteCard hashtag={id as string} />
      </div>
      <div className="grid grid-cols-1 max-w-xl mx-auto gap-1 px-4">
        {sortedEvents.map((event) => 
            <PostCard
              event={event}
              metadata={metadataEvents.find((e) => e.pubkey === event.pubkey && e.kind === 0) || null}
              replies={sortedEvents.filter((e) => e.tags.some((tag) => tag[0] === "e" && tag[1] === event.id))}
            />
  
        )}
      </div>
    </main>
  );
};

export default HashtagPage;