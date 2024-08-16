import PostCard from "../modals/NoteCard";
import { verifyPow } from "../../utils/mine";
import { Event } from "nostr-tools";
import NewNoteCard from "../forms/PostFormCard";
import RepostCard from "../modals/RepostCard";
import { DEFAULT_DIFFICULTY } from "../../config";
import { useUniqEvents } from "../../hooks/useUniqEvents";

const Home = () => {
  const filterDifficulty = localStorage.getItem("filterDifficulty") || DEFAULT_DIFFICULTY;
  const { noteEvents, metadataEvents } = useUniqEvents();

  const postEvents: Event[] = noteEvents
    .filter((event) =>
      verifyPow(event) >= Number(filterDifficulty) &&
      event.kind !== 0 &&
      (event.kind !== 1 || !event.tags.some((tag) => tag[0] === "e" || tag[0] === "a"))
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
        <NewNoteCard />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
        {sortedEvents.map((event) => (
          event.kind === 1 ?
            <PostCard
              event={event}
              metadata={metadataEvents.find((e) => e.pubkey === event.pubkey && e.kind === 0) || null}
              replies={sortedEvents.filter((e) => e.tags.some((tag) => tag[0] === "e" && tag[1] === event.id))}
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
