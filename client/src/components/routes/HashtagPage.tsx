import PostCard from "../modals/PostCard";
import NewNoteCard from "../forms/PostFormCard";
import { useParams } from "react-router-dom";
import useProcessedEvents from "../../hooks/processedEvents";

const DEFAULT_DIFFICULTY = 0;

const HashtagPage = () => {
  const { id } = useParams();
  const filterDifficulty = DEFAULT_DIFFICULTY;
  const { processedEvents } = useProcessedEvents(id as string, filterDifficulty);

  // Render the component
  return (
    <main className="text-white mb-20">
      <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
        <NewNoteCard hashtag={id as string} />
      </div>
      <div className="grid grid-cols-1 max-w-xl mx-auto gap-1 px-4">
        {processedEvents.map((event) =>
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