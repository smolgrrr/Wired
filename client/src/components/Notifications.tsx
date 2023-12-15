import { useEffect, useState, useCallback } from "react";
import PostCard from "./Modals/NoteCard";
import { uniqBy } from "../utils/otherUtils"; // Assume getPow is a correct import now
import { subGlobalFeed } from "../utils/subscriptions";
import { verifyPow } from "../utils/mine";
import { Event } from "nostr-tools";
import NewNoteCard from "./Forms/PostFormCard";
import RepostCard from "./Modals/RepostCard";
import OptionsBar from "./Modals/OptionsBar";
import { subNotifications } from "../utils/subscriptions";

const useUniqEvents = () => {
  const [events, setEvents] = useState<Event[]>([]);
  let storedKeys = JSON.parse(localStorage.getItem('usedKeys') || '[]');
  let storedPubkeys = storedKeys.map((key: any[]) => key[1]);

  useEffect(() => {
    const onEvent = (event: Event) => setEvents((prevEvents) => [...prevEvents, event]);
    const unsubscribe = subNotifications(storedPubkeys, onEvent);

    return unsubscribe;
  }, []);

  const uniqEvents = uniqBy(events, "id");

  const noteEvents = uniqEvents.filter(event => event.kind === 1 || event.kind === 6);
  const metadataEvents = uniqEvents.filter(event => event.kind === 0);

  return { noteEvents, metadataEvents };
};

const Notifications = () => {
  const [sortByTime, setSortByTime] = useState<boolean>(localStorage.getItem('sortBy') !== 'false');
  const [setAnon, setSetAnon] = useState<boolean>(localStorage.getItem('anonMode') !== 'false');
  const { noteEvents, metadataEvents } = useUniqEvents();

  const postEvents = noteEvents
    .filter((event) =>
      event.kind !== 0 &&
      (event.kind !== 1)
    )

  const sortedEvents = [...postEvents]
  .sort((a, b) =>
    sortByTime ? b.created_at - a.created_at : verifyPow(b) - verifyPow(a)
  )
  .filter(
    !setAnon ? (e) => !metadataEvents.some((metadataEvent) => metadataEvent.pubkey === e.pubkey) : () => true
  );

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

export default Notifications;
