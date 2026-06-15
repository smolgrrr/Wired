import { Event, nip19 } from "nostr-tools";
import { timeAgo } from "@lib/timeFormat";
import { verifyPow } from "../../shared/pow/core";
import { replyEquivalentDifficulty } from "../../nostr/processing/pow-score";
import { uniqBy } from "@lib/collections";
import { parseRepost } from "../../nostr/processing/repost";
import { getDisplayName } from "@lib/profile";
import { useProfile } from "../hooks/useProfiles";
import { TextContent } from "./TextContent";
import { MetadataRow } from "./MetadataRow";
import { ReplyContext } from "./ReplyContext";
import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";

interface PostCardProps {
  event: Event;
  replies: Event[];
  repliedTo?: Event[];
  role?: "feed" | "threadOp" | "threadContext";
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
  role = "feed",
  depth,
  animate = false,
  animationIndex = 0,
  fadeIn = false,
}: PostCardProps) {
  const navigate = useNavigate();

  const relatedEvents = useMemo(() => [event, ...(replies || [])], [event, replies]);
  const repostedEvent = useMemo(() => (event.kind === 6 ? event : undefined), [event]);
  const parsedEvent = useMemo(() => {
    if (event.kind === 6) {
      return parseRepost(event) ?? event;
    }
    return event;
  }, [event]);
  const replySumPow = useMemo(() => replyEquivalentDifficulty(replies), [replies]);
  const profile = useProfile(parsedEvent.pubkey);
  const authorLabel = getDisplayName(profile, parsedEvent.pubkey);

  const signal = verifyPow(parsedEvent);
  const repostSignal = repostedEvent ? verifyPow(repostedEvent) : undefined;
  const timestamp = timeAgo(event.created_at);
  const isNavigable = role !== "threadOp";

  const handleNavigate = useCallback(() => {
    sessionStorage.setItem("cachedThread", JSON.stringify(relatedEvents));
    navigate(`/thread/${nip19.noteEncode(parsedEvent.id)}`);
  }, [relatedEvents, navigate, parsedEvent.id]);

  const roleClass = role === "threadContext" ? "opacity-70" : "";

  return (
    <article
      role="group"
      aria-label={`Post by ${authorLabel}, signal ${signal}, ${timestamp}`}
      className={[
        "group py-4 border-b border-ghost",
        roleClass,
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
        replySignal={replySumPow}
        replyCount={replies.length}
        timestamp={timestamp}
        repostSignal={repostSignal}
        onOpenThread={isNavigable ? handleNavigate : undefined}
        forceSecondary={role === "threadOp"}
      />
    </article>
  );
}