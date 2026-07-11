import { timeToGoEst } from "@lib/timeEstimate";
import type { SubmitStatus } from "../hooks/useSubmitForm";

interface PowTransmitStatusProps {
  active: boolean;
  difficulty: string | number;
  hashrate: number;
  bestPow?: number;
  status?: SubmitStatus;
  acceptedRelayCount?: number;
  className?: string;
}

export function PowTransmitStatus({
  active,
  difficulty,
  hashrate,
  bestPow = 0,
  status = "mining",
  acceptedRelayCount = 0,
  className,
}: PowTransmitStatusProps) {
  const classes = `text-meta text-secondary ${className ?? ""}`.trim();

  if (status === "published") {
    return (
      <p className={classes} role="status">
        posted to {acceptedRelayCount} relay{acceptedRelayCount === 1 ? "" : "s"}
      </p>
    );
  }

  if (!active) return null;

  if (status === "publishing") {
    return (
      <p className={classes} role="status">
        publishing to relays…
      </p>
    );
  }

  return (
    <p className={classes} role="status">
      mining signal… ETA ~{timeToGoEst(String(difficulty), hashrate)}
      {bestPow > 0 ? ` · best signal ${bestPow}` : ""}
    </p>
  );
}
