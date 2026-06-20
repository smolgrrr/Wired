import { useParams, useNavigate } from "react-router-dom";
import { Event, nip19 } from "nostr-tools";
import { getThreadDepth } from "@lib/getThreadDepth";
import { Placeholder } from "../../shared/ui/Placeholder";
import { Button } from "../../shared/ui/Button";
import { PostCard } from "../../shared/ui/PostCard";
import { ContentColumn, PageShell } from "../../shared/ui/PageShell";
import { ThreadComposer } from "../compose/ThreadComposer";
import { useInfiniteScroll } from "../../shared/hooks/useInfiniteScroll";
import { useThreadViewModel } from "../../hooks/useThreadViewModel";

function decodeNoteId(id: string | undefined): string | null {
  if (!id) return null;
  try {
    const decodeResult = nip19.decode(id);
    return decodeResult.type === "note" ? (decodeResult.data as string) : null;
  } catch {
    return null;
  }
}

function ThreadView({ hexID }: { hexID: string }) {
  const visibleReplyEvents = useInfiniteScroll();
  const {
    opEvent,
    earlierEvents,
    replyEvents,
    eventsById,
    showAllReplies,
    setShowAllReplies,
    uniqMentions,
  } = useThreadViewModel(hexID);

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
            />
          ))}
          <PostCard
            event={opEvent}
            replies={replyEvents.flatMap((event) => event.replies)}
            role="threadOp"
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
                depth={getThreadDepth(event.postEvent, opEvent.id, eventsById)}
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
  const hexID = decodeNoteId(id);

  if (!hexID) {
    return (
      <PageShell className="bg-void min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-secondary text-body">invalid signal ref</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/")}>
          return
        </Button>
      </PageShell>
    );
  }

  return <ThreadView hexID={hexID} />;
}