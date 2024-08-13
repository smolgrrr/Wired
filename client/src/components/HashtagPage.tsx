import { useEffect, useState, useCallback } from "react";
import PostCard from "./Modals/NoteCard";
import { uniqBy } from "../utils/otherUtils"; // Assume getPow is a correct import now
import { subHashtagFeed, subProfile} from "../utils/subscriptions";
import { verifyPow } from "../utils/mine";
import { Event, nip19 } from "nostr-tools";
import NewNoteCard from "./Forms/PostFormCard";
import RepostCard from "./Modals/RepostCard";
import OptionsBar from "./Modals/OptionsBar";
import { useParams } from "react-router-dom";

const DEFAULT_DIFFICULTY = 0;

const useUniqEvents = (hashtag: string) => {
  const [events, setEvents] = useState<Event[]>([]);
  const age = Number(localStorage.getItem("age")) || 24;

  useEffect(() => {
    const onEvent = (event: Event) => setEvents((prevEvents) => [...prevEvents, event]);
    console.log(events)
    const unsubscribe = subHashtagFeed(hashtag, onEvent, age);

    return unsubscribe;
  }, [hashtag]);

  const uniqEvents = uniqBy(events, "id");

  const noteEvents = uniqEvents.filter(event => event.kind === 1 || event.kind === 6);
  const metadataEvents = uniqEvents.filter(event => event.kind === 0);

  return { noteEvents, metadataEvents };
};

const HashtagPage = () => {
  const { id } = useParams();
  const filterDifficulty = localStorage.getItem("filterHashtagDifficulty") || DEFAULT_DIFFICULTY;
  const [sortByTime, setSortByTime] = useState<boolean>(localStorage.getItem('sortBy') !== 'true');
  const [setAnon, setSetAnon] = useState<boolean>(localStorage.getItem('anonMode') !== 'false');

  const {noteEvents, metadataEvents } = useUniqEvents(id as string);

  const [delayedSort, setDelayedSort] = useState(false)

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

  if (delayedSort) {
    sortedEvents = sortedEvents.filter(
      !setAnon ? (e) => !metadataEvents.some((metadataEvent) => metadataEvent.pubkey === e.pubkey) : () => true
    );
  } else {
    sortedEvents = sortedEvents.filter((e) => setAnon || e.tags.some((tag) => tag[0] === "client" && tag[1] === 'getwired.app'));
  }
  
  const toggleSort = useCallback(() => {
    setSortByTime(prev => {
      const newValue = !prev;
      localStorage.setItem('sortBy', String(newValue));
      return newValue;
    });
  }, []);

  const toggleAnon = useCallback(() => {
    setSetAnon(prev => {
      const newValue = !prev;
      localStorage.setItem('anonMode', String(newValue));
      return newValue;
    });
  }, []);

  const countReplies = (event: Event) => {
    return noteEvents.filter((e) => e.tags.some((tag) => tag[0] === "e" && tag[1] === event.id)).length;
  };

  // Render the component
  return (
    <main className="text-white mb-20">
      <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
        <NewNoteCard hashtag={id as string}/>
      </div>
      <OptionsBar sortByTime={sortByTime} setAnon={setAnon} toggleSort={toggleSort} toggleAnon={toggleAnon} />
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
        {sortedEvents.map((event) => (
          event.kind === 1 ?
            <PostCard
              event={event}
              metadata={metadataEvents.find((e) => e.pubkey === event.pubkey && e.kind === 0) || null}
              replyCount={countReplies(event)}
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

export default HashtagPage;