import type { Event } from "nostr-tools";
import { REVENUE_API_BASE } from "../../config";

export type RevenueConfig = {
  enabled: boolean;
  recipientPubkey: string;
  relayUrl: string;
  callbackUrl: string;
  walletBackend: string;
};

export type ValidatedLightningAddress = {
  ok: true;
  address: string;
  minSendableMsat: number;
  maxSendableMsat: number;
};

export type RevenueEnrollment = {
  ok: true;
  enrollmentId: string;
  eventId: string;
  state: "pending" | "active" | "failed";
};

function revenueUrl(path: string): string {
  return `${REVENUE_API_BASE}${path}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof value?.error === "string" ? value.error : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return value as T;
}

let configPromise: Promise<RevenueConfig> | null = null;

export function fetchRevenueConfig(options: { force?: boolean } = {}): Promise<RevenueConfig> {
  if (!configPromise || options.force) {
    configPromise = fetch(revenueUrl("/api/revenue/config"), { cache: "no-store" })
      .then((response) => readJson<RevenueConfig>(response))
      .catch((error) => {
        configPromise = null;
        throw error;
      });
  }
  return configPromise;
}

export async function validateLightningAddress(address: string): Promise<ValidatedLightningAddress> {
  const response = await fetch(revenueUrl("/api/revenue/address/validate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  return readJson<ValidatedLightningAddress>(response);
}

export async function enrollBrowserEvent(event: Event, address: string): Promise<RevenueEnrollment> {
  const response = await fetch(revenueUrl("/api/revenue/enroll"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, address }),
  });
  return readJson<RevenueEnrollment>(response);
}

async function updateEnrollment(enrollmentId: string, action: "activate" | "fail"): Promise<void> {
  const response = await fetch(
    revenueUrl(`/api/revenue/enroll/${encodeURIComponent(enrollmentId)}/${action}`),
    { method: "POST" },
  );
  await readJson(response);
}

export function activateRevenueEnrollment(enrollmentId: string): Promise<void> {
  return updateEnrollment(enrollmentId, "activate");
}

export function failRevenueEnrollment(enrollmentId: string): Promise<void> {
  return updateEnrollment(enrollmentId, "fail");
}

export function withRevenueZapTag<T extends { tags: string[][] }>(
  event: T,
  config: RevenueConfig,
): T {
  const tags = event.tags.filter((tag) => tag[0] !== "zap");
  return {
    ...event,
    tags: [...tags, ["zap", config.recipientPubkey, config.relayUrl]],
  };
}
