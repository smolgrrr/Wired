import { Event, nip19 } from "nostr-tools";
import { timeAgo } from "@lib/timeFormat";
import { verifyPow } from "../../shared/pow/core";
import { uniqBy } from "@lib/collections";
import { getDisplayName } from "@lib/profile";
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
  imagePriority?: boolean;
  avatarPriority?: boolean;
  totalWork?: number;
  replyCount?: number;
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
  imagePriority = false,
  avatarPriority = false,
  totalWork,
  replyCount,
}: PostCardProps) {
  const navigate = useNavigate();

  const relatedEvents = useMemo(() => [event, ...(replies || [])], [event, replies]);
  const authorLabel = getDisplayName(undefined, event.pubkey);

  const signal = totalWork ? Math.floor(Math.log2(totalWork)) : verifyPow(event);
  const displayedReplyCount = replyCount ?? replies.length;
  const timestamp = timeAgo(event.created_at);
  const isNavigable = role !== "threadOp";

  const handleNavigate = useCallback(() => {
    sessionStorage.setItem("cachedThread", JSON.stringify(relatedEvents));
    navigate(`/thread/${nip19.noteEncode(event.id)}`);
  }, [relatedEvents, navigate, event.id]);

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
        <TextContent eventdata={event} imagePriority={imagePriority} />
        {repliedTo && repliedTo.length > 0 && (
          <ReplyContext events={uniqBy(repliedTo, "pubkey")} />
        )}
      </div>

      <MetadataRow
        pubkey={event.pubkey}
        signal={signal}
        replyCount={displayedReplyCount}
        timestamp={timestamp}
        onOpenThread={isNavigable ? handleNavigate : undefined}
        forceSecondary={role === "threadOp"}
        avatarPriority={avatarPriority}
      />
    </article>
  );
}
