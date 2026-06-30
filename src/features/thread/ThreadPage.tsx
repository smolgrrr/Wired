import { useParams, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { Event } from "nostr-tools";
import { getThreadDepth } from "@lib/getThreadDepth";
import { Placeholder } from "../../shared/ui/Placeholder";
import { Button } from "../../shared/ui/Button";
import { PostCard } from "../../shared/ui/PostCard";
import { ContentColumn, PageShell } from "../../shared/ui/PageShell";
import { ThreadComposer } from "../compose/ThreadComposer";
import { useInfiniteScroll } from "../../shared/hooks/useInfiniteScroll";
import { useThreadViewModel } from "../../hooks/useThreadViewModel";
import { eventWork } from "../../nostr/processing/pow-score";
import { readThreadSeedEvents } from "./threadSeedCache";
import { useThreadNavigation } from "./useThreadNavigation";
import { decodeThreadRef } from "@lib/threadRefs";

function ThreadView({ hexID, relayHints }: { hexID: string; relayHints: string[] }) {
  const visibleReplyEvents = useInfiniteScroll();
  const seedEvents = useMemo(() => readThreadSeedEvents(hexID), [hexID]);
  const openThread = useThreadNavigation();
  const {
    opEvent,
    earlierEvents,
    replyEvents,
    eventsById,
    showAllReplies,
    setShowAllReplies,
    uniqMentions,
  } = useThreadViewModel(hexID, seedEvents, relayHints);
  const directReplyEvents = replyEvents.filter((event) =>
    event.postEvent.tags.some((tag) => tag[0] === "e" && tag[1] === hexID),
  );
  const opTotalWork = opEvent
    ? eventWork(opEvent) +
      directReplyEvents.reduce((total, event) => total + event.totalWork, 0)
    : undefined;

  if (opEvent) {
    return (
      <PageShell className="min-h-screen">
        <ContentColumn className="my-2">
          {earlierEvents.map((event) => (
            <PostCard
              key={event.id}
              event={event}
              role="threadContext"
              replies={uniqMentions.filter((e: Event) =>
                e.tags.some((tag) => tag[0] === "e" && tag[1] === event.id),
              )}
              onOpenThread={openThread}
            />
          ))}
          <PostCard
            event={opEvent}
            replies={replyEvents.flatMap((event) => event.replies)}
            role="threadOp"
            totalWork={opTotalWork || undefined}
            replyCount={directReplyEvents.length}
          />
        </ContentColumn>
        <ThreadComposer OPEvent={opEvent} />
        <div className="mx-auto mb-2 h-px max-w-content bg-[var(--border-ghost)]" />
        <div className="flex justify-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAllReplies(!showAllReplies)}
          >
            {showAllReplies ? "hide low-signal" : "reveal low-signal"}
          </Button>
        </div>
        <ContentColumn>
          {replyEvents
            .slice(0, visibleReplyEvents)
            .filter(
              (event) =>
                (showAllReplies || Math.log2(event.totalWork) > 10) &&
                event.postEvent.tags.some((tag) => tag[0] === "e" && tag[1] === opEvent.id),
            )
            .map((event) => (
              <PostCard
                key={event.postEvent.id}
                event={event.postEvent}
                replies={event.replies}
                totalWork={event.totalWork}
                replyCount={event.threadReplyCount}
                depth={getThreadDepth(event.postEvent, opEvent.id, eventsById)}
                onOpenThread={openThread}
              />
            ))}
        </ContentColumn>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Placeholder />
      <div className="mx-auto h-px max-w-content bg-[var(--border-ghost)]" />
    </PageShell>
  );
}

export default function ThreadPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const threadRef = decodeThreadRef(id);

  if (!threadRef) {
    return (
      <PageShell className="bg-void min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-secondary text-body">invalid signal ref</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/")}>
          return
        </Button>
      </PageShell>
    );
  }

  return <ThreadView hexID={threadRef.id} relayHints={threadRef.relays} />;
}
