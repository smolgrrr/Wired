import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { Event, nip19 } from "nostr-tools";
import { subNotesOnce } from "../../nostr/subscriptions";
import { uniqBy } from "../../utils/otherUtils";
import { getThreadDepth } from "../../utils/getThreadDepth";
import { Placeholder } from "../../shared/ui/Placeholder";
import { Button } from "../../shared/ui/Button";
import { PostCard } from "../../shared/ui/PostCard";
import { useThreadEvents } from "../../hooks/useThreadEvents";
import { ThreadComposer } from "../compose/ThreadComposer";
import { totalWork } from "../../nostr/processing/pow-score";
import type { ProcessedEvent } from "../../nostr/types";
import { useInfiniteScroll } from "../../shared/hooks/useInfiniteScroll";

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
  const [prevMentions, setPrevMentions] = useState<Event[]>([]);
  const [showAllReplies, setShowAllReplies] = useState(false);
  const visibleReplyEvents = useInfiniteScroll();
  const { noteEvents } = useThreadEvents(hexID);
  const allEvents = useMemo(() => {
    const threadCache = JSON.parse(sessionStorage.getItem("cachedThread") || "[]");
    return [...noteEvents, ...threadCache];
  }, [noteEvents]);

  const eventsById = useMemo(
    () => new Map(allEvents.map((event) => [event.id, event])),
    [allEvents],
  );

  const repliedList = (event: Event): Event[] =>
    allEvents.filter((e) => event.tags.some((tag) => tag[0] === "p" && tag[1] === e.pubkey));

  const OPEvent = allEvents.find((event) => event.id === hexID);

  useEffect(() => {
    if (!OPEvent || prevMentions.length > 0) return;

    const OPMentionIDs = OPEvent.tags
      .filter((tag: string[]) => tag[0] === "e")
      .map((tag: string[]) => tag[1]);

    const onEvent = (event: Event) => {
      setPrevMentions((prevEvents) => [...prevEvents, event]);
    };

    const subscription = subNotesOnce(OPMentionIDs, onEvent);
    return () => subscription.close();
  }, [OPEvent, prevMentions.length]);

  const replyEvents = useMemo(() => {
    if (!OPEvent) return [];

    const uniqEvents = uniqBy(prevMentions, "id");
    const earlierEvents = uniqEvents.filter((e) => e.created_at < OPEvent.created_at);
    const earlierIds = new Set(earlierEvents.map((e) => e.id));
    const uniqReplyEvents = uniqBy(allEvents, "id");

    return [...uniqReplyEvents]
      .filter((event) => !earlierIds.has(event.id) && OPEvent.id !== event.id)
      .map((event): ProcessedEvent => {
        const replies = noteEvents.filter((e) =>
          e.tags.some((tag) => tag[0] === "e" && tag[1] === event.id),
        );
        return { postEvent: event, replies, totalWork: totalWork(event, replies) };
      })
      .sort((a, b) => b.totalWork - a.totalWork || b.postEvent.created_at - a.postEvent.created_at);
  }, [OPEvent, prevMentions, allEvents, noteEvents]);

  if (OPEvent) {
    const uniqEvents = uniqBy(prevMentions, "id");
    const earlierEvents = uniqEvents
      .filter((e) => e.created_at < OPEvent.created_at)
      .filter((event) => event.kind === 1)
      .sort((a, b) => a.created_at - b.created_at);

    return (
      <main id="main-content" className="text-primary mb-20 min-h-screen">
        <div className="mx-auto my-2 max-w-content px-3 sm:px-0">
          {earlierEvents.map((event) => (
            <PostCard
              key={event.id}
              event={event}
              variant="context"
              replies={uniqEvents.filter((e: Event) =>
                e.tags.some((tag) => tag[0] === "e" && tag[1] === event.id),
              )}
            />
          ))}
          <PostCard
            event={OPEvent}
            replies={replyEvents.flatMap((event) => event.replies)}
            type="OP"
            variant="op"
          />
        </div>
        <ThreadComposer OPEvent={OPEvent} />
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
        <div className="mx-auto flex max-w-content flex-col px-3 sm:px-0">
          {replyEvents
            .slice(0, visibleReplyEvents)
            .filter(
              (event) =>
                (showAllReplies || Math.log2(event.totalWork) > 10) &&
                event.postEvent.tags.some((tag) => tag[0] === "e" && tag[1] === OPEvent.id),
            )
            .map((event) => (
              <PostCard
                key={event.postEvent.id}
                event={event.postEvent}
                replies={event.replies}
                repliedTo={repliedList(event.postEvent)}
                depth={getThreadDepth(event.postEvent, OPEvent.id, eventsById)}
              />
            ))}
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="text-primary mb-20">
      <Placeholder />
      <div className="mx-auto h-px max-w-content bg-[var(--border-ghost)]" />
    </main>
  );
}

export default function ThreadPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const hexID = decodeNoteId(id);

  if (!hexID) {
    return (
      <main
        id="main-content"
        className="bg-void text-primary min-h-screen flex flex-col items-center justify-center gap-4"
      >
        <p className="text-secondary text-body">invalid signal ref</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/")}>
          return
        </Button>
      </main>
    );
  }

  return <ThreadView hexID={hexID} />;
}