import { Event } from "nostr-tools";
import { useState } from "react";
import { parseContent } from "@lib/content";
import { getBodyEmojis } from "@lib/customEmoji";
import { useQuotedEvents } from "../hooks/useQuotedEvents";
import { AttachmentStack } from "./AttachmentStack";
import { QuotePreview } from "./QuotePreview";
import { QuotePreviewPlaceholder } from "./QuotePreviewPlaceholder";
import { Button } from "./Button";
import { LinkedBodyText } from "./LinkedBodyText";
import type { MediaPresentationVerdict } from "../lib/mediaModeration";

const COLLAPSED_LENGTH = 750;

export function TextContent({
  eventdata,
  imagePriority = false,
  mediaVerdicts,
}: {
  eventdata: Event;
  imagePriority?: boolean;
  mediaVerdicts?: ReadonlyMap<string, MediaPresentationVerdict>;
}) {
  const { comment, attachments } = parseContent(eventdata);
  const emojis = getBodyEmojis(eventdata.tags);
  const { quotedEvents, pendingRefs, failedRefs } = useQuotedEvents(eventdata);
  const [isExpanded, setIsExpanded] = useState(false);
  const displayedComment = isExpanded ? comment : comment.slice(0, COLLAPSED_LENGTH);

  return (
    <div className="gap-2 flex flex-col break-words text-body text-primary">
      {comment.length > 0 && (
        <LinkedBodyText className="whitespace-pre-wrap" emojis={emojis}>
          {displayedComment}
        </LinkedBodyText>
      )}
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
      {attachments.length > 0 && (
        <AttachmentStack
          attachments={attachments}
          imagePriority={imagePriority}
          mediaVerdicts={mediaVerdicts}
        />
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
    </div>
  );
}
