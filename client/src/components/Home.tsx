import { useEffect, useState } from "react";
import PostCard from "./PostCard/PostCard";
import NewThreadCard from "./PostCard/NewThreadCard";
import { getPow } from "../utils/mine";
import { Event } from "nostr-tools";
import { subGlobalFeed } from "../utils/subscriptions";
import { uniqBy } from "../utils/utils";
import PWAInstallPopup from "./Modals/PWACheckModal";

const Home = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [filterDifficulty, setFilterDifficulty] = useState(
    localStorage.getItem("filterDifficulty") || "20"
  );
  const [inBrowser, setInBrowser] = useState(false);

  const onEvent = (event: Event) => {
    setEvents((prevEvents) => [...prevEvents, event]);
  };

  useEffect(() => {
    subGlobalFeed(onEvent);
    // If you eventually need a cleanup function, put it here

    const handleDifficultyChange = (event: any) => {
      const customEvent = event as CustomEvent;
      const { difficulty, filterDifficulty } = customEvent.detail;
      setFilterDifficulty(filterDifficulty);
    };

    // if ((window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches) {
    //   console.log('App is running in standalone mode.');
    // } else {
    //   console.log('App is running in a browser.');
    //   setInBrowser(true)
    // }

    window.addEventListener("difficultyChanged", handleDifficultyChange);

    return () => {
      window.removeEventListener("difficultyChanged", handleDifficultyChange);
    };
  }, []);

  const uniqEvents = events.length > 0 ? uniqBy(events, "id") : [];

  const filteredAndSortedEvents = uniqEvents
    .filter(
      (event) =>
        getPow(event.id) > Number(filterDifficulty) &&
        event.kind === 1 &&
        !event.tags.some((tag) => tag[0] === "e")
    )
    .sort((a, b) => (b.created_at as any) - (a.created_at as any));

  const getMetadataEvent = (event: Event) => {
    const metadataEvent = uniqEvents.find(
      (e) => e.pubkey === event.pubkey && e.kind === 0
    );
    if (metadataEvent) {
      return metadataEvent;
    }
    return null;
  };

  const countReplies = (event: Event) => {
    return uniqEvents.filter((e) =>
      e.tags.some((tag) => tag[0] === "e" && tag[1] === event.id)
    ).length;
  };

  return (
    <main className="text-white mb-20">
      {/* {inBrowser && <PWAInstallPopup onClose={() => setInBrowser(false)} />} */}
      <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
        <NewThreadCard />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {filteredAndSortedEvents.map((event) => (
          <PostCard
            key={event.id}
            event={event}
            metadata={getMetadataEvent(event)}
            replyCount={countReplies(event)}
          />
        ))}
      </div>
    </main>
  );
};

export default Home;
