import { Event } from "nostr-tools";
import { useState } from "react";
import { parseContent } from "@lib/content";
import { getNoteBodyText } from "@lib/pollUtils";
import { useQuotedEvents } from "../hooks/useQuotedEvents";
import { AttachmentStack } from "./AttachmentStack";
import { PollResponder } from "./PollResponder";
import { QuotePreview } from "./QuotePreview";
import { QuotePreviewPlaceholder } from "./QuotePreviewPlaceholder";
import { Button } from "./Button";
import { LinkedBodyText } from "./LinkedBodyText";

const COLLAPSED_LENGTH = 750;

export function TextContent({
  eventdata,
  imagePriority = false,
}: {
  eventdata: Event;
  imagePriority?: boolean;
}) {
  const { comment, attachments } = parseContent(eventdata);
  const bodyText = getNoteBodyText(eventdata, comment);
  const { quotedEvents, pendingRefs, failedRefs } = useQuotedEvents(eventdata);
  const [isExpanded, setIsExpanded] = useState(false);
  const displayedComment = isExpanded ? bodyText : bodyText.slice(0, COLLAPSED_LENGTH);

  return (
    <div className="gap-2 flex flex-col break-words text-body text-primary">
      {bodyText.length > 0 && (
        <LinkedBodyText className="whitespace-pre-wrap">
          {displayedComment}
        </LinkedBodyText>
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
      {quotedEvents.map((quoted) => (
        <QuotePreview key={quoted.id} event={quoted} />
      ))}
      {pendingRefs.map((ref) => (
        <QuotePreviewPlaceholder key={ref.id} message="resolving quote…" />
      ))}
      {failedRefs.map((ref) => (
        <QuotePreviewPlaceholder key={ref.id} message="quoted post unavailable" />
      ))}
      {attachments.length > 0 && (
        <AttachmentStack attachments={attachments} imagePriority={imagePriority} />
      )}
      {eventdata.kind === 1068 && <PollResponder eventdata={eventdata} />}
    </div>
  );
}
