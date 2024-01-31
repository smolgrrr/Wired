import { useEffect, useState, useCallback } from "react";
import PostCard from "./Modals/NoteCard";
import { uniqBy } from "../utils/otherUtils"; // Assume getPow is a correct import now
import { subBoardFeed, subProfile} from "../utils/subscriptions";
import { verifyPow } from "../utils/mine";
import { Event, nip19 } from "nostr-tools";
import NewNoteCard from "./Forms/PostFormCard";
import RepostCard from "./Modals/RepostCard";
import OptionsBar from "./Modals/OptionsBar";
import { useParams } from "react-router-dom";

const DEFAULT_DIFFICULTY = 20;

const useUniqEvents = (pubkey: string) => {
  const [events, setEvents] = useState<Event[]>([]);
  const age = Number(localStorage.getItem("age")) || 24;

  useEffect(() => {
    const onEvent = (event: Event) => setEvents((prevEvents) => [...prevEvents, event]);
    console.log(events)
    const unsubscribe = subBoardFeed(pubkey, onEvent, age);

    return unsubscribe;
  }, [pubkey]);

  const uniqEvents = uniqBy(events, "id");

  const noteEvents = uniqEvents.filter(event => event.kind === 1 || event.kind === 6);
  const metadataEvents = uniqEvents.filter(event => event.kind === 0);
  const pinnedEvents = uniqEvents.filter(event => event.pubkey === pubkey && !event.tags.some((tag) => tag[0] === "e"));

  return { pinnedEvents, noteEvents, metadataEvents };
};

const Board = () => {
  const { id } = useParams();
  const filterDifficulty = localStorage.getItem("filterDifficulty") || DEFAULT_DIFFICULTY;
  const [sortByTime, setSortByTime] = useState<boolean>(localStorage.getItem('sortBy') !== 'false');
  const [setAnon, setSetAnon] = useState<boolean>(localStorage.getItem('anonMode') !== 'false');

  let decodeResult = nip19.decode(id as string);
  let pubkey = decodeResult.data as string;
  const {pinnedEvents, noteEvents, metadataEvents } = useUniqEvents(pubkey);

  const [delayedSort, setDelayedSort] = useState(false)

  const postEvents: Event[] = noteEvents
    .filter((event) =>
      verifyPow(event) >= Number(filterDifficulty) &&
      event.kind !== 0 &&
      (event.kind !== 1 || !event.tags.some((tag) => tag[0] === "e"))
    )
  
  // Delayed filtering
  useEffect(() => {
    const timer = setTimeout(() => {
      setDelayedSort(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  let sortedEvents = [...postEvents]
  .sort((a, b) =>
    sortByTime ? b.created_at - a.created_at : verifyPow(b) - verifyPow(a)
  )

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
        <NewNoteCard board={id}/>
      </div>
      <OptionsBar sortByTime={sortByTime} setAnon={setAnon} toggleSort={toggleSort} toggleAnon={toggleAnon} />
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
        {pinnedEvents.map((event) => (
          <div className="rounded-lg border border-red-900">
          <PostCard
            event={event}
            metadata={metadataEvents.find((e) => e.pubkey === event.pubkey && e.kind === 0) || null}
            replyCount={countReplies(event)}
          />
          </div>
        ))}
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

export default Board;
