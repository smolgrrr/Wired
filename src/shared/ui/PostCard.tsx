import { Event, nip19 } from "nostr-tools";
import { getIconFromHash, timeAgo } from "../../utils/cardUtils";
import { verifyPow } from "../../shared/pow/core";
import { replyEquivalentDifficulty } from "../../nostr/processing/pow-score";
import { uniqBy } from "../../utils/otherUtils";
import { parseRepost } from "../../nostr/processing/repost";
import { TextContent } from "./TextContent";
import { CardContainer } from "./CardContainer";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface PostCardProps {
  event: Event;
  replies: Event[];
  repliedTo?: Event[];
  type?: "OP" | "Reply" | "Post";
}

export function PostCard({ event, replies, repliedTo, type }: PostCardProps) {
  const navigate = useNavigate();
  const icon = getIconFromHash(event.pubkey);
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

  const handleClick = () => {
    if (type !== "OP") {
      sessionStorage.setItem("cachedThread", JSON.stringify(relatedEvents));
      navigate(`/thread/${nip19.noteEncode(parsedEvent.id)}`);
    }
  };

  return (
    <CardContainer>
      <div className="flex flex-col gap-2">
        <div
          className={`flex flex-col break-words ${type !== "OP" ? "hover:cursor-pointer" : ""}`}
          onClick={handleClick}
        >
          <TextContent eventdata={parsedEvent} />
        </div>
        {repliedTo && (
          <div className="flex items-center mt-1">
            <span className="text-xs text-gray-500">Reply to: </span>
            {uniqBy(repliedTo, "pubkey").map((replyEvent) => (
              <span className="ml-1 font-mono text-neutral-400" key={replyEvent.pubkey}>
                {replyEvent.pubkey.slice(0, 8)}
              </span>
            ))}
          </div>
        )}
        <div
          className={`pt-3 flex justify-between items-center ${type !== "OP" ? "hover:cursor-pointer" : ""}`}
          onClick={handleClick}
        >
          <div className={`h-6 w-6 ${icon} rounded-full`} aria-label={`Author ${parsedEvent.pubkey.slice(0, 8)}`} />
          <div className="flex items-center ml-auto gap-2.5">
            <div className={`inline-flex text-xs ${verifyPow(parsedEvent) === 0 ? "text-neutral-600" : "text-sky-800"} gap-0.5`}>
              PoW {verifyPow(parsedEvent)}
            </div>
            {repostedEvent && (
              <div className={`inline-flex text-xs ${verifyPow(repostedEvent) === 0 ? "text-neutral-600" : "text-sky-800"}`}>
                + PoW {verifyPow(repostedEvent)}
              </div>
            )}
            <span className="text-neutral-700">·</span>
            <div className="min-w-20 inline-flex items-center text-neutral-600">
              <span className="text-xs">Replies {replies.length}</span>
              <span className={`text-xs pl-1 ${sumReplyPow === 0 ? "text-neutral-600" : "text-sky-800"}`}>
                (PoW {sumReplyPow.toFixed(0)})
              </span>
            </div>
            <span className="text-neutral-700">·</span>
            <div className="min-w-6 text-xs font-semibold text-neutral-600">
              {timeAgo(event.created_at)}
            </div>
          </div>
        </div>
      </div>
    </CardContainer>
  );
}