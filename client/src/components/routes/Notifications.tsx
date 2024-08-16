import { useState, useCallback } from "react";
import PostCard from "../modals/NoteCard";
import { Event } from "nostr-tools";
import RepostCard from "../modals/RepostCard";
import { useUniqEvents } from "../../hooks/useUniqEvents";

const Notifications = () => {
  const [notifsView, setNotifsView] = useState(false);
  const { noteEvents, metadataEvents } = useUniqEvents(undefined,true);
  const storedKeys = JSON.parse(localStorage.getItem('usedKeys') || '[]');
  const storedPubkeys = storedKeys.map((key: any[]) => key[1]);

  const postEvents = noteEvents
    .filter((event) =>
      event.kind !== 0 &&
      storedPubkeys.includes(event.pubkey)
    )

  const sortedEvents = [...postEvents]
    .sort((a, b) =>
      b.created_at - a.created_at
    )

  const mentions = noteEvents
    .filter((event) =>
      event.kind !== 0 &&
      event.tags.some((tag) => tag[0] === "p" && storedPubkeys.includes(tag[1]))
    )

  const sortedMentions = [...mentions]
    .sort((a, b) =>
     b.created_at - a.created_at
    )

  const toggleNotifs = useCallback(() => {
    setNotifsView(prev => !prev);
  }, []);

  const countReplies = (event: Event) => {
    return noteEvents.filter((e) => e.tags.some((tag) => tag[0] === "e" && tag[1] === event.id));
  };

  // Render the component
  return (
    <main className="text-white mb-20">
      <div className="block sm:hidden">
        <label htmlFor="toggleC" className="p-4 flex items-center cursor-pointer">
          <div className="relative">
            <input
              id="toggleC"
              type="checkbox"
              className="sr-only"
              checked={notifsView}
              onChange={toggleNotifs}
            />
            <div className="block bg-gray-600 w-8 h-4 rounded-full"></div>
            <div className={`dot absolute left-1 top-0.5 bg-white w-3 h-3 rounded-full transition ${notifsView ? 'transform translate-x-full bg-blue-400' : ''}`} ></div>
          </div>
          <div className={`ml-2 text-neutral-500 text-sm ${notifsView ? 'text-neutral-500' : ''}`}>
            {notifsView ? 'Mentions' : 'Prev Posts'}
          </div>
        </label>
      </div>
      <div className="flex">
        <div className={`grid grid-cols-1 gap-4 px-4 flex-grow ${notifsView ? 'hidden sm:block' : ''}`}>
          <span>Your Recent Posts</span>
          {sortedEvents.map((event) => (
            event.kind === 1 ?
              <PostCard
                event={event}
                metadata={metadataEvents.find((e) => e.pubkey === event.pubkey && e.kind === 0) || null}
                replies={countReplies(event)}
              />
              :
              <RepostCard
                event={event}
              />
          ))}
        </div>
        <div className={`grid grid-cols-1 gap-4 px-4 flex-grow ${notifsView ? '' : 'hidden sm:block'}`}>
          <span>Mentions</span>
          {sortedMentions.map((event) => (
            event.kind === 1 ?
              <PostCard
                event={event}
                metadata={metadataEvents.find((e) => e.pubkey === event.pubkey && e.kind === 0) || null}
                replies={countReplies(event)}
              />
              :
              <RepostCard
                event={event}
              />
          ))}
        </div>
      </div>
    </main>
  );
};

export default Notifications;
