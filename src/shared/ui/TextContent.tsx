import { Event } from "nostr-tools";
import { useState } from "react";
import { parseContent } from "@lib/content";
import { getNoteBodyText } from "@lib/pollUtils";
import { AttachmentStack } from "./AttachmentStack";
import { PollResponder } from "./PollResponder";
import { Button } from "./Button";

const COLLAPSED_LENGTH = 750;

export function TextContent({ eventdata }: { eventdata: Event }) {
  const { comment, attachments } = parseContent(eventdata);
  const bodyText = getNoteBodyText(eventdata, comment);
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
      {attachments.length > 0 && <AttachmentStack attachments={attachments} />}
      {eventdata.kind === 1068 && <PollResponder eventdata={eventdata} />}
    </div>
  );
}