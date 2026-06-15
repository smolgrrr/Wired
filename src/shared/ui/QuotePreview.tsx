import { Event } from "nostr-tools";
import { parseContent } from "@lib/content";
import { getNoteBodyText } from "@lib/pollUtils";
import { AttachmentStack } from "./AttachmentStack";
import { PollSummary } from "./PollSummary";
import { SignalAvatar } from "./SignalAvatar";

const PREVIEW_LENGTH = 280;

export function QuotePreview({ event }: { event: Event }) {
  const { comment, attachments } = parseContent(event);
  const bodyText = getNoteBodyText(event, comment);
  const preview =
    bodyText.length > PREVIEW_LENGTH
      ? `${bodyText.slice(0, PREVIEW_LENGTH)}…`
      : bodyText;

  return (
    <div
      className="mt-3 rounded border border-[var(--border-ghost)] bg-[var(--surface)] px-3 py-2"
      aria-label="quoted note"
    >
      <div className="mb-2 flex items-center gap-2 text-meta text-muted">
        <SignalAvatar pubkey={event.pubkey} size="sm" />
        <span>{event.pubkey.slice(0, 8)}</span>
      </div>
      {preview.length > 0 && (
        <p className="whitespace-pre-wrap text-body text-secondary">{preview}</p>
      )}
      {attachments.length > 0 && (
        <div className="mt-2">
          <AttachmentStack attachments={attachments} compact />
        </div>
      )}
      {event.kind === 1068 && <PollSummary eventdata={event} />}
    </div>
  );
}