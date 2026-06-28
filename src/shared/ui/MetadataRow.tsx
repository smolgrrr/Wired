import { getDisplayName } from "@lib/profile";
import { useProfile } from "../hooks/useProfiles";
import { Button } from "./Button";
import { SignalAvatar } from "./SignalAvatar";

type MetadataRowProps = {
  pubkey: string;
  signal: number;
  replyCount: number;
  timestamp: string;
  onOpenThread?: () => void;
  forceSecondary?: boolean;
  avatarPriority?: boolean;
};

function formatTelemetry({
  authorLabel,
  signal,
  replyCount,
  timestamp,
}: {
  authorLabel: string;
  signal: number;
  replyCount: number;
  timestamp: string;
}) {
  const parts: string[] = [authorLabel];

  if (signal > 0) {
    parts.push(`signal ${signal}`);
  }

  const replyLabel = `${replyCount} ${replyCount === 1 ? "reply" : "replies"}`;
  parts.push(replyLabel);

  parts.push(timestamp);

  return parts.join(" · ");
}

export function MetadataRow({
  pubkey,
  signal,
  replyCount,
  timestamp,
  onOpenThread,
  forceSecondary = false,
  avatarPriority = false,
}: MetadataRowProps) {
  const profile = useProfile(pubkey);
  const authorLabel = getDisplayName(profile, pubkey);

  const telemetry = formatTelemetry({
    authorLabel,
    signal,
    replyCount,
    timestamp,
  });

  const handleRowClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onOpenThread) return;
    if (event.target === event.currentTarget) {
      onOpenThread();
    }
  };

  return (
    <div
      className={[
        "metadata-row flex items-center gap-2 pt-3 text-meta",
        forceSecondary ? "metadata-row--secondary" : "",
        onOpenThread ? "cursor-pointer" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={handleRowClick}
    >
      <SignalAvatar
        pubkey={pubkey}
        pictureUrl={profile?.picture}
        label={`author ${authorLabel}`}
        size="sm"
        priority={avatarPriority}
      />
      <span className="flex-1 min-w-0 truncate">{telemetry}</span>
      {onOpenThread && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onOpenThread}
          aria-label="open thread"
        >
          open
        </Button>
      )}
    </div>
  );
}
