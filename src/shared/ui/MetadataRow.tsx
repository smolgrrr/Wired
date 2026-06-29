import type { MouseEvent } from "react";
import { Activity, Network } from "lucide-react";
import { Button } from "./Button";

type MetadataRowProps = {
  signal: number;
  replyCount: number;
  timestamp: string;
  onOpenThread?: () => void;
  forceSecondary?: boolean;
};

function getReplyLabel(replyCount: number) {
  return `${replyCount} ${replyCount === 1 ? "reply" : "replies"}`;
}

export function MetadataRow({
  signal,
  replyCount,
  timestamp,
  onOpenThread,
  forceSecondary = false,
}: MetadataRowProps) {
  const handleRowClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onOpenThread) return;
    if (event.target === event.currentTarget) {
      onOpenThread();
    }
  };

  return (
    <div
      className={[
        "metadata-row flex items-center justify-between gap-3 pt-3 text-meta",
        forceSecondary ? "metadata-row--secondary" : "",
        onOpenThread ? "cursor-pointer" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={handleRowClick}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className="inline-flex items-center gap-1 whitespace-nowrap text-signal drop-shadow-[0_0_6px_var(--signal-dim)]"
          aria-label={`signal ${signal}`}
        >
          <Activity aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
          <span aria-hidden="true">{signal}</span>
        </span>
        <span
          className="inline-flex items-center gap-1 whitespace-nowrap"
          aria-label={getReplyLabel(replyCount)}
        >
          <Network aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
          <span aria-hidden="true">{replyCount}</span>
        </span>
        <span className="whitespace-nowrap">{timestamp}</span>
      </div>
      {onOpenThread && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onOpenThread}
          aria-label="open thread"
          className="shrink-0"
        >
          open
        </Button>
      )}
    </div>
  );
}
