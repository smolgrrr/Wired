import { Event } from "nostr-tools";
import { useState } from "react";
import { parseContent } from "../../utils/content";
import { getPollLabel } from "../../utils/pollUtils";
import { NoteMedia } from "./NoteMedia";
import { PollResponder } from "./PollResponder";
import { Button } from "./Button";

const COLLAPSED_LENGTH = 750;

export function TextContent({ eventdata }: { eventdata: Event }) {
  const { comment, media } = parseContent(eventdata);
  const bodyText =
    eventdata.kind === 1068 ? comment.trim() || getPollLabel(eventdata) : comment;
  const [isExpanded, setIsExpanded] = useState(false);
  const displayedComment = isExpanded ? bodyText : bodyText.slice(0, COLLAPSED_LENGTH);

  return (
    <div className="gap-2 flex flex-col break-words text-body text-primary">
      {bodyText.length > 0 && (
        <p className="whitespace-pre-wrap">{displayedComment}</p>
      )}
      {bodyText.length > COLLAPSED_LENGTH && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? "collapse" : "continue"}
        </Button>
      )}
      {media.length > 0 && <NoteMedia items={media} />}
      {eventdata.kind === 1068 && <PollResponder eventdata={eventdata} />}
    </div>
  );
}