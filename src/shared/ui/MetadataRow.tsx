import { Button } from "./Button";
import { SignalAvatar } from "./SignalAvatar";

type MetadataRowProps = {
  pubkey: string;
  signal: number;
  replySignal?: number;
  replyCount: number;
  timestamp: string;
  repostSignal?: number;
  onOpenThread?: () => void;
  forceSecondary?: boolean;
};

function formatTelemetry({
  pubkey,
  signal,
  replySignal = 0,
  replyCount,
  timestamp,
  repostSignal,
}: Omit<MetadataRowProps, "onOpenThread" | "forceSecondary">) {
  const parts: string[] = [pubkey.slice(0, 8)];

  if (signal > 0) {
    parts.push(`signal ${signal}`);
  }

  if (repostSignal && repostSignal > 0) {
    parts.push(`signal +${repostSignal}`);
  }

  const replyLabel = `${replyCount} ${replyCount === 1 ? "reply" : "replies"}`;
  parts.push(
    replySignal > 0
      ? `${replyLabel} · signal ${Math.round(replySignal)}`
      : replyLabel,
  );

  parts.push(timestamp);

  return parts.join(" · ");
}

export function MetadataRow({
  pubkey,
  signal,
  replySignal = 0,
  replyCount,
  timestamp,
  repostSignal,
  onOpenThread,
  forceSecondary = false,
}: MetadataRowProps) {
  const telemetry = formatTelemetry({
    pubkey,
    signal,
    replySignal,
    replyCount,
    timestamp,
    repostSignal,
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
      <SignalAvatar pubkey={pubkey} size="sm" />
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