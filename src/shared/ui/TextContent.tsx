import { Event } from "nostr-tools";
import { useState } from "react";
import { parseContent } from "../../utils/content";
import { PollResponder } from "./PollResponder";

const COLLAPSED_LENGTH = 750;

export function TextContent({ eventdata }: { eventdata: Event }) {
  const { comment } = parseContent(eventdata);
  const [isExpanded, setIsExpanded] = useState(false);
  const displayedComment = isExpanded ? comment : comment.slice(0, COLLAPSED_LENGTH);

  return (
    <div className="gap-2 flex flex-col break-words text-xs">
      <p className="whitespace-pre-wrap">{displayedComment}</p>
      {comment.length > COLLAPSED_LENGTH && (
        <button
          type="button"
          className="text-sm text-neutral-500"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? "...Read less" : "...Read more"}
        </button>
      )}
      {eventdata.kind === 1068 && <PollResponder eventdata={eventdata} />}
    </div>
  );
}