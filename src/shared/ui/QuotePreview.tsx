import { Event } from "nostr-tools";
import { parseContent } from "@lib/content";
import { getBodyEmojis } from "@lib/customEmoji";
import { getDisplayName } from "@lib/profile";
import { useProfile } from "../hooks/useProfiles";
import { AttachmentStack } from "./AttachmentStack";
import { LinkedBodyText } from "./LinkedBodyText";
import { SignalAvatar } from "./SignalAvatar";
import { useMediaModeration } from "../hooks/useMediaModeration";

const PREVIEW_LENGTH = 280;

export function QuotePreview({ event }: { event: Event }) {
  const profile = useProfile(event.pubkey);
  const authorLabel = getDisplayName(profile, event.pubkey);
  const { comment, attachments } = parseContent(event);
  const mediaItems = attachments.flatMap((attachment) =>
    attachment.kind === "media" ? [attachment.item] : [],
  );
  const mediaModeration = useMediaModeration(event, mediaItems);
  const emojis = getBodyEmojis(event.tags);
  const preview =
    comment.length > PREVIEW_LENGTH
      ? `${comment.slice(0, PREVIEW_LENGTH)}…`
      : comment;

  if (mediaModeration.blocked) return null;

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
        <LinkedBodyText className="whitespace-pre-wrap text-body text-secondary" emojis={emojis}>
          {preview}
        </LinkedBodyText>
      )}
      {attachments.length > 0 && (
        <div className="mt-2">
          <AttachmentStack
            attachments={attachments}
            compact
            mediaVerdicts={mediaModeration.verdicts}
          />
        </div>
      )}
    </div>
  );
}
