import { Event } from "nostr-tools";
import { parseContent } from "@lib/content";
import { getDisplayName } from "@lib/profile";
import { getNoteBodyText, getPollViewModel } from "@lib/pollUtils";
import { useProfile } from "../hooks/useProfiles";
import { AttachmentStack } from "./AttachmentStack";
import { LinkedBodyText } from "./LinkedBodyText";
import { PollSummary } from "./PollSummary";
import { SignalAvatar } from "./SignalAvatar";

const PREVIEW_LENGTH = 280;

export function QuotePreview({ event }: { event: Event }) {
  const profile = useProfile(event.pubkey);
  const authorLabel = getDisplayName(profile, event.pubkey);
  const { comment, attachments } = parseContent(event);
  const bodyText = getNoteBodyText(event, comment);
  const poll = getPollViewModel(event);
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
        <SignalAvatar
          pubkey={event.pubkey}
          pictureUrl={profile?.picture}
          label={`author ${authorLabel}`}
          size="sm"
        />
        <span>{authorLabel}</span>
      </div>
      {preview.length > 0 && (
        <LinkedBodyText className="whitespace-pre-wrap text-body text-secondary">
          {preview}
        </LinkedBodyText>
      )}
      {attachments.length > 0 && (
        <div className="mt-2">
          <AttachmentStack attachments={attachments} compact />
        </div>
      )}
      {poll && <PollSummary poll={poll} />}
    </div>
  );
}
