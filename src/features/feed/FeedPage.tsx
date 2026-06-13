import { useEffect, useMemo, useState } from "react";
import { useFeed } from "../../hooks/useFeed";
import { useSettings } from "../../app/settings";
import { useInfiniteScroll } from "../../shared/hooks/useInfiniteScroll";
import { PostForm } from "../compose/PostForm";
import { PostCard } from "../../shared/ui/PostCard";
import { FeedSortToggle } from "./FeedSortToggle";

const INITIAL_RESOLVE_COUNT = 20;
const RESOLVE_DURATION_MS = 600;
const STAGGER_MS = 40;

export default function FeedPage() {
  const { settings, updateSettings } = useSettings();
  const { processedEvents } = useFeed();
  const visibleCount = useInfiniteScroll();
  const [resolveWindowOpen, setResolveWindowOpen] = useState(true);

  useEffect(() => {
    const timer = setTimeout(
      () => setResolveWindowOpen(false),
      RESOLVE_DURATION_MS + INITIAL_RESOLVE_COUNT * STAGGER_MS,
    );
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
      <div className="my-3 px-3 sm:px-0">
        <div className="mx-auto flex max-w-content flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <FeedSortToggle
            sortByPow={settings.sortByPow}
            onToggle={() => updateSettings({ sortByPow: !settings.sortByPow })}
          />
          <div className="min-w-0 flex-1">
            <PostForm />
          </div>
        </div>
      </div>
      <div className="mx-auto flex max-w-content flex-col px-3 sm:px-0">
        {sortedEvents.slice(0, visibleCount).map((event, index) => {
          const shouldResolve = resolveWindowOpen && index < INITIAL_RESOLVE_COUNT;
          const shouldFadeIn =
            !resolveWindowOpen && index >= INITIAL_RESOLVE_COUNT;

          return (
            <PostCard
              key={event.postEvent.id}
              event={event.postEvent}
              replies={event.replies}
              animate={shouldResolve}
              animationIndex={index}
              fadeIn={shouldFadeIn}
            />
          );
        })}
      </div>
    </main>
  );
}