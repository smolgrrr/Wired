import { timeToGoEst } from "@lib/timeEstimate";

interface PowTransmitStatusProps {
  active: boolean;
  difficulty: string | number;
  hashrate: number;
  bestPow?: number;
  className?: string;
}

export function PowTransmitStatus({
  active,
  difficulty,
  hashrate,
  bestPow = 0,
  className,
}: PowTransmitStatusProps) {
  if (!active) return null;

  return (
    <p className={`text-meta text-secondary ${className ?? ""}`.trim()} role="status">
      computing signal… ~{timeToGoEst(String(difficulty), hashrate)}
      {bestPow > 0 ? ` · pb:${bestPow}` : ""}
    </p>
  );
}