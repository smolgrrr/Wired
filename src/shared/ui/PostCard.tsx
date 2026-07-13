import { Event } from "nostr-tools";
import { timeAgo } from "@lib/timeFormat";
import { verifyPow } from "../../shared/pow/core";
import { uniqBy } from "@lib/collections";
import { getDisplayName } from "@lib/profile";
import { buildThreadPath } from "@lib/threadRefs";
import { TextContent } from "./TextContent";
import { MetadataRow } from "./MetadataRow";
import { ReplyContext } from "./ReplyContext";
import { SignalAvatar } from "./SignalAvatar";
import { useProfile } from "../hooks/useProfiles";
import { useMemo, useCallback, type KeyboardEvent, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ShareControl } from "./ShareControl";

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
  relayHints?: readonly string[];
  onOpenThread?: (
    event: Event,
    relatedEvents: Event[],
    relayHints?: readonly string[],
  ) => void;
}

const depthClasses: Record<number, string> = {
  0: "pl-0 opacity-100",
  1: "pl-4 opacity-[0.92]",
  2: "pl-8 opacity-[0.84]",
  3: "pl-12 opacity-[0.76]",
};
const EMPTY_RELAY_HINTS: readonly string[] = [];
const NESTED_INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "textarea",
  "select",
  "summary",
  "audio",
  "video",
  "img",
  "[aria-label='attachment']",
  "[aria-label$='attachments']",
  "[contenteditable='true']",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']",
  "[role='img']",
  "[data-post-card-interactive='true']",
].join(",");

function getDepthClass(depth?: number): string {
  if (depth === undefined) return "";
  return depthClasses[Math.min(depth, 3)] ?? depthClasses[3];
}

function getEventElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function isNestedInteractiveTarget(
  target: EventTarget | null,
  currentTarget: Element,
): boolean {
  const targetElement = getEventElement(target);
  const nestedTarget = targetElement?.closest(NESTED_INTERACTIVE_SELECTOR);

  return Boolean(
    nestedTarget &&
      nestedTarget !== currentTarget &&
      currentTarget.contains(nestedTarget),
  );
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
  relayHints = EMPTY_RELAY_HINTS,
  onOpenThread,
}: PostCardProps) {
  const navigate = useNavigate();

  const relatedEvents = useMemo(() => [event, ...(replies || [])], [event, replies]);
  const profile = useProfile(event.pubkey);
  const authorLabel = getDisplayName(profile, event.pubkey);

  const signal = totalWork ? Math.floor(Math.log2(totalWork)) : verifyPow(event);
  const displayedReplyCount = replyCount ?? replies.length;
  const timestamp = timeAgo(event.created_at);
  const isNavigable = role !== "threadOp";

  const handleNavigate = useCallback(() => {
    if (onOpenThread) {
      onOpenThread(event, relatedEvents, relayHints);
      return;
    }

    navigate(buildThreadPath(event.id, relayHints));
  }, [event, onOpenThread, relatedEvents, relayHints, navigate]);

  const handleCardClick = useCallback(
    (clickEvent: MouseEvent<HTMLElement>) => {
      if (!isNavigable) return;
      if (clickEvent.defaultPrevented || clickEvent.button !== 0) return;
      if (clickEvent.metaKey || clickEvent.altKey || clickEvent.ctrlKey || clickEvent.shiftKey) {
        return;
      }
      if (isNestedInteractiveTarget(clickEvent.target, clickEvent.currentTarget)) return;

      handleNavigate();
    },
    [handleNavigate, isNavigable],
  );

  const handleCardKeyDown = useCallback(
    (keyEvent: KeyboardEvent<HTMLElement>) => {
      if (!isNavigable || keyEvent.defaultPrevented || keyEvent.key !== "Enter") return;
      if (isNestedInteractiveTarget(keyEvent.target, keyEvent.currentTarget)) return;

      keyEvent.preventDefault();
      handleNavigate();
    },
    [handleNavigate, isNavigable],
  );

  const roleClass = role === "threadContext" ? "opacity-70" : "";
  const ariaLabel = isNavigable
    ? `Open thread by ${authorLabel}, signal ${signal}, ${timestamp}`
    : `Post by ${authorLabel}, signal ${signal}, ${timestamp}`;

  return (
    <article
      role={isNavigable ? "link" : "group"}
      tabIndex={isNavigable ? 0 : undefined}
      aria-label={ariaLabel}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      className={[
        "group py-4 border-b border-ghost",
        isNavigable ? "post-card--openable" : "",
        roleClass,
        getDepthClass(depth),
        animate ? "motion-safe:animate-resolve-in" : "",
        fadeIn ? "motion-safe:animate-fade-in" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={animate ? { animationDelay: `${animationIndex * 40}ms` } : undefined}
    >
      <header className="mb-2 flex min-w-0 items-center gap-2 text-meta text-secondary">
        <SignalAvatar
          pubkey={event.pubkey}
          pictureUrl={profile?.picture}
          label={`author ${authorLabel}`}
          size="sm"
          priority={avatarPriority}
        />
        <span className="min-w-0 truncate">{authorLabel}</span>
        {role === "threadOp" && (
          <span className="ml-auto shrink-0 text-muted" aria-label="Wired website">
            wiredsignal.online
          </span>
        )}
      </header>

      <div className="post-content flex flex-col gap-2 break-words">
        <TextContent eventdata={event} imagePriority={imagePriority} />
        {repliedTo && repliedTo.length > 0 && (
          <ReplyContext events={uniqBy(repliedTo, "pubkey")} />
        )}
      </div>

      <MetadataRow
        signal={signal}
        replyCount={displayedReplyCount}
        timestamp={timestamp}
        forceSecondary={role === "threadOp"}
        trailing={
          role === "threadOp" ? (
            <ShareControl
              eventId={event.id}
              relayHints={relayHints}
              excerpt={event.content}
            />
          ) : undefined
        }
      />
    </article>
  );
}
