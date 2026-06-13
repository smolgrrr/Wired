import { Event } from "nostr-tools";
import { useState } from "react";
import { parseContent } from "../../utils/content";
import { PollResponder } from "./PollResponder";
import { PollSummary } from "./PollSummary";
import { Button } from "./Button";

const COLLAPSED_LENGTH = 750;

export function TextContent({
  eventdata,
  interactivePoll = false,
}: {
  eventdata: Event;
  interactivePoll?: boolean;
}) {
  const { comment } = parseContent(eventdata);
  const [isExpanded, setIsExpanded] = useState(false);
  const displayedComment = isExpanded ? comment : comment.slice(0, COLLAPSED_LENGTH);

  return (
    <div className="gap-2 flex flex-col break-words text-body text-primary">
      <p className="whitespace-pre-wrap">{displayedComment}</p>
      {comment.length > COLLAPSED_LENGTH && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? "collapse" : "continue"}
        </Button>
      )}
      {eventdata.kind === 1068 &&
        (interactivePoll ? (
          <PollResponder eventdata={eventdata} />
        ) : (
          <PollSummary eventdata={eventdata} />
        ))}
    </div>
  );
}