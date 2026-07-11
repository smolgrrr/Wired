import { useEffect, useMemo, useState } from "react";
import { useFeed } from "../../hooks/useFeed";
import { useSettings } from "../../app/settings";
import { useInfiniteScroll } from "../../shared/hooks/useInfiniteScroll";
import { PostForm } from "../compose/PostForm";
import { PostCard } from "../../shared/ui/PostCard";
import { FeedSortToggle } from "./FeedSortToggle";
import { ContentColumn, PageShell } from "../../shared/ui/PageShell";
import { useThreadNavigation } from "../thread/useThreadNavigation";
import { Placeholder } from "../../shared/ui/Placeholder";
import type { FeedStatus, FeedStatusKind } from "../../hooks/useFeed";

const SKIP_RESOLVE_COUNT = 3;
const INITIAL_RESOLVE_COUNT = 20;
const RESOLVE_DURATION_MS = 600;
const STAGGER_MS = 40;

type FeedPageProps = {
  mode?: "default" | "raw";
};

const statusToneClass: Record<FeedStatusKind, string> = {
  snapshot: "border-ghost text-secondary",
  live: "border-signal-ghost text-signal",
  syncing: "border-ghost text-secondary",
  degraded: "border-danger-dim text-danger",
  empty: "border-ghost text-muted",
};

function FeedStatusBanner({ status }: { status: FeedStatus }) {
  return (
    <div
      className={[
        "mb-3 flex min-h-9 items-center justify-between gap-3 border px-3 py-2 text-meta",
        statusToneClass[status.kind],
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      <span className="uppercase [letter-spacing:var(--letter-spacing-meta)]">
        {status.label}
      </span>
      <span className="min-w-0 truncate text-right text-muted">
        {status.detail}
      </span>
    </div>
  );
}

export default function FeedPage({ mode = "default" }: FeedPageProps) {
  const { settings, updateSettings } = useSettings();
  const { processedEvents, feedStatus } = useFeed({ mode });
  const visibleCount = useInfiniteScroll();
  const openThread = useThreadNavigation();
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
    <PageShell>
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
      <ContentColumn>
        <FeedStatusBanner status={feedStatus} />
        {sortedEvents.length === 0 ? (
          <Placeholder message={feedStatus.detail} />
        ) : sortedEvents.slice(0, visibleCount).map((event, index) => {
          const shouldResolve =
            resolveWindowOpen &&
            index >= SKIP_RESOLVE_COUNT &&
            index < INITIAL_RESOLVE_COUNT;
          const shouldFadeIn =
            !resolveWindowOpen && index >= INITIAL_RESOLVE_COUNT;

          return (
            <PostCard
              key={event.postEvent.id}
              event={event.postEvent}
              replies={event.replies}
              totalWork={event.totalWork}
              replyCount={event.threadReplyCount}
              relayHints={event.relayHints}
              animate={shouldResolve}
              animationIndex={index - SKIP_RESOLVE_COUNT}
              fadeIn={shouldFadeIn}
              imagePriority={index < SKIP_RESOLVE_COUNT}
              avatarPriority={index < SKIP_RESOLVE_COUNT}
              onOpenThread={openThread}
            />
          );
        })}
      </ContentColumn>
    </PageShell>
  );
}
