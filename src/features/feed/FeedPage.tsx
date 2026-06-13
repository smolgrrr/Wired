import { useEffect, useMemo, useState } from "react";
import { useFeed } from "../../hooks/useFeed";
import { useSettings } from "../../app/settings";
import { useInfiniteScroll } from "../../shared/hooks/useInfiniteScroll";
import { PostForm } from "../compose/PostForm";
import { PostCard } from "../../shared/ui/PostCard";
import { FeedSortToggle } from "./FeedSortToggle";

export default function FeedPage() {
  const { settings, updateSettings } = useSettings();
  const { processedEvents } = useFeed();
  const [isAnimating, setIsAnimating] = useState(true);
  const visibleCount = useInfiniteScroll();

  useEffect(() => {
    const timer = setTimeout(() => setIsAnimating(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  const sortedEvents = useMemo(() => {
    return [...processedEvents].sort((a, b) => {
      if (!settings.sortByPow) {
        return b.postEvent.created_at - a.postEvent.created_at;
      }
      return 0;
    });
  }, [processedEvents, settings.sortByPow]);

  return (
    <main id="main-content" className="text-primary mb-20">
      <div className="my-3">
        <div className="w-full px-3 sm:px-0 sm:max-w-4xl mx-auto flex">
          <FeedSortToggle
            sortByPow={settings.sortByPow}
            onToggle={() => updateSettings({ sortByPow: !settings.sortByPow })}
          />
          <div className="flex-grow">
            <PostForm />
          </div>
        </div>
      </div>
      <div className={`grid grid-cols-1 max-w-xl mx-auto gap-1 ${isAnimating ? "animate-pulse" : ""}`}>
        {sortedEvents.slice(0, visibleCount).map((event) => (
          <PostCard
            key={event.postEvent.id}
            event={event.postEvent}
            replies={event.replies}
          />
        ))}
      </div>
    </main>
  );
}