import { Event, nip19 } from "nostr-tools";
import { timeAgo } from "../../utils/cardUtils";
import { verifyPow } from "../../shared/pow/core";
import { replyEquivalentDifficulty } from "../../nostr/processing/pow-score";
import { uniqBy } from "../../utils/otherUtils";
import { parseRepost } from "../../nostr/processing/repost";
import { TextContent } from "./TextContent";
import { MetadataRow } from "./MetadataRow";
import { ReplyContext } from "./ReplyContext";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

interface PostCardProps {
  event: Event;
  replies: Event[];
  repliedTo?: Event[];
  type?: "OP" | "Reply" | "Post";
  variant?: "default" | "context" | "op";
  depth?: number;
  animate?: boolean;
  animationIndex?: number;
  fadeIn?: boolean;
}

const depthClasses: Record<number, string> = {
  0: "pl-0 opacity-100",
  1: "pl-4 opacity-[0.92]",
  2: "pl-8 opacity-[0.84]",
  3: "pl-12 opacity-[0.76]",
};

function getDepthClass(depth?: number): string {
  if (depth === undefined) return "";
  return depthClasses[Math.min(depth, 3)] ?? depthClasses[3];
}

export function PostCard({
  event,
  replies,
  repliedTo,
  type,
  variant = "default",
  depth,
  animate = false,
  animationIndex = 0,
  fadeIn = false,
}: PostCardProps) {
  const navigate = useNavigate();
  const [relatedEvents, setRelatedEvents] = useState<Event[]>([]);
  const [sumReplyPow, setReplySumPow] = useState(0);
  const [repostedEvent, setRepostedEvent] = useState<Event>();
  const [parsedEvent, setParsedEvent] = useState<Event>(event);

  useEffect(() => {
    const allRelatedEvents = [event, ...(replies || [])];
    setRelatedEvents(allRelatedEvents);

    if (event.kind === 6) {
      setRepostedEvent(event);
      const reposted = parseRepost(event);
      if (reposted) {
        setParsedEvent(reposted);
      }
    } else {
      setParsedEvent(event);
    }

    setReplySumPow(replyEquivalentDifficulty(replies));
  }, [event, replies]);

  const signal = verifyPow(parsedEvent);
  const repostSignal = repostedEvent ? verifyPow(repostedEvent) : undefined;
  const timestamp = timeAgo(event.created_at);
  const isNavigable = type !== "OP" && variant !== "op";

  const handleNavigate = useCallback(() => {
    sessionStorage.setItem("cachedThread", JSON.stringify(relatedEvents));
    navigate(`/thread/${nip19.noteEncode(parsedEvent.id)}`);
  }, [relatedEvents, navigate, parsedEvent.id]);

  const variantClass =
    variant === "context"
      ? "opacity-70"
      : variant === "op"
        ? ""
        : "";

  const resolvedVariant = type === "OP" ? "op" : variant;

  return (
    <article
      role="group"
      aria-label={`Post by ${parsedEvent.pubkey.slice(0, 8)}, signal ${signal}, ${timestamp}`}
      className={[
        "group py-4 border-b border-ghost",
        variantClass,
        getDepthClass(depth),
        animate ? "motion-safe:animate-resolve-in" : "",
        fadeIn ? "motion-safe:animate-fade-in" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={animate ? { animationDelay: `${animationIndex * 40}ms` } : undefined}
    >
      <div className="post-content flex flex-col gap-2 break-words">
        <TextContent eventdata={parsedEvent} />
        {repliedTo && repliedTo.length > 0 && (
          <ReplyContext events={uniqBy(repliedTo, "pubkey")} />
        )}
      </div>

      <MetadataRow
        pubkey={parsedEvent.pubkey}
        signal={signal}
        replySignal={sumReplyPow}
        replyCount={replies.length}
        timestamp={timestamp}
        repostSignal={repostSignal}
        onOpenThread={isNavigable ? handleNavigate : undefined}
        forceSecondary={resolvedVariant === "op"}
      />
    </article>
  );
}