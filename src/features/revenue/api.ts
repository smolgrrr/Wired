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
const ACTIVATION_QUEUE_KEY = "wired:pending-revenue-activations";

function pendingActivations(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(ACTIVATION_QUEUE_KEY) || "[]") as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
      : [];
  } catch {
    return [];
  }
}

function storePendingActivations(enrollmentIds: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVATION_QUEUE_KEY, JSON.stringify([...new Set(enrollmentIds)]));
}

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
  storePendingActivations([...pendingActivations(), enrollmentId]);
  return updateEnrollment(enrollmentId, "activate").then(() => {
    storePendingActivations(pendingActivations().filter((candidate) => candidate !== enrollmentId));
  });
}

export async function retryPendingRevenueActivations(): Promise<void> {
  for (const enrollmentId of pendingActivations()) {
    await activateRevenueEnrollment(enrollmentId).catch(() => {});
  }
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
