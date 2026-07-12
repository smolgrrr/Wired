import { Activity, Network } from "lucide-react";
import type { ReactNode } from "react";

type MetadataRowProps = {
  signal: number;
  replyCount: number;
  timestamp: string;
  forceSecondary?: boolean;
  trailing?: ReactNode;
};

function getReplyLabel(replyCount: number) {
  return `${replyCount} ${replyCount === 1 ? "reply" : "replies"}`;
}

export function MetadataRow({
  signal,
  replyCount,
  timestamp,
  forceSecondary = false,
  trailing,
}: MetadataRowProps) {
  return (
    <div
      className={[
        "metadata-row flex items-center justify-between gap-3 pt-3 text-meta",
        forceSecondary ? "metadata-row--secondary" : "",
      ]
        .filter(Boolean)
        .join(" ")}
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
      {trailing && <div className="flex shrink-0 items-center gap-3">{trailing}</div>}
    </div>
  );
}
