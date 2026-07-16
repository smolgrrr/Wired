export type MediaVerdictStatus =
  | "allowed"
  | "blocked"
  | "pending"
  | "review-required"
  | "unavailable"
  | "stale";

export type MediaPresentationVerdict = {
  status: MediaVerdictStatus;
  reason: string;
  enforced: boolean;
  expiresAt?: number | null;
  sha256?: string;
  perceptualHash?: string;
};

export const ALLOWED_MEDIA_VERDICT: MediaPresentationVerdict = {
  status: "allowed",
  reason: "moderation_disabled",
  enforced: false,
};

export function isMediaCovered(verdict?: MediaPresentationVerdict): boolean {
  return Boolean(verdict?.enforced && verdict.status === "review-required");
}
