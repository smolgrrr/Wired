import { timeToGoEst } from "@lib/timeEstimate";
import type { SubmitStatus } from "../hooks/useSubmitForm";

interface PowTransmitStatusProps {
  active: boolean;
  difficulty: string | number;
  hashrate: number;
  bestPow?: number;
  status?: SubmitStatus;
  className?: string;
}

export function PowTransmitStatus({
  active,
  difficulty,
  hashrate,
  bestPow = 0,
  status = "mining",
  className,
}: PowTransmitStatusProps) {
  if (!active) return null;

  if (status === "publishing") {
    return (
      <p className={`text-meta text-secondary ${className ?? ""}`.trim()} role="status">
        publishing to relays…
      </p>
    );
  }

  return (
    <p className={`text-meta text-secondary ${className ?? ""}`.trim()} role="status">
      computing signal… ~{timeToGoEst(String(difficulty), hashrate)}
      {bestPow > 0 ? ` · pb:${bestPow}` : ""}
    </p>
  );
}
