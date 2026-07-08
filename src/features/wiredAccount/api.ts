import type { Event, UnsignedEvent } from "nostr-tools";
import { WIRED_ACCOUNT_API_BASE } from "../../config";

export type WiredAccountAdmissionEvent = UnsignedEvent & Pick<Event, "id">;

export type WiredAccountStatus = {
  configured: boolean;
  pubkey: string;
  minimumPow: number;
  closed?: boolean;
  day?: string;
  count?: number;
  limit?: number;
  remaining?: number;
  nextResetAt?: string;
};

export type WiredAccountPostResponse = {
  ok?: true;
  event: Event;
  acceptedRelays: string[];
  minimumPow?: number;
  count?: number;
  remaining?: number;
  nextResetAt?: string;
};

let cachedStatus: WiredAccountStatus | null = null;
let pendingStatus: Promise<WiredAccountStatus> | null = null;

function wiredAccountUrl(path: string): string {
  return `${WIRED_ACCOUNT_API_BASE}${path}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data?.error === "string" ? data.error : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

export async function fetchWiredAccountStatus(options: { force?: boolean } = {}): Promise<WiredAccountStatus> {
  if (!options.force && cachedStatus) {
    return cachedStatus;
  }

  if (!options.force && pendingStatus) {
    return pendingStatus;
  }

  pendingStatus = fetch(wiredAccountUrl("/api/wired-account/status"), {
    cache: "no-store",
  })
    .then((response) => readJson<WiredAccountStatus>(response))
    .then((status) => {
      cachedStatus = status;
      return status;
    })
    .finally(() => {
      pendingStatus = null;
    });

  return pendingStatus;
}

export function primeWiredAccountStatus(status: WiredAccountStatus): void {
  cachedStatus = status;
}

export function clearWiredAccountStatusCache(): void {
  cachedStatus = null;
  pendingStatus = null;
}

export async function submitWiredAccountPost(
  event: WiredAccountAdmissionEvent,
): Promise<WiredAccountPostResponse> {
  const response = await fetch(wiredAccountUrl("/api/wired-account/posts"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event }),
  });
  const result = await readJson<WiredAccountPostResponse>(response);
  cachedStatus = {
    configured: true,
    pubkey: result.event.pubkey,
    minimumPow: result.minimumPow ?? cachedStatus?.minimumPow ?? 0,
    count: result.count ?? cachedStatus?.count,
    remaining: result.remaining ?? cachedStatus?.remaining,
    nextResetAt: result.nextResetAt ?? cachedStatus?.nextResetAt,
  };
  return result;
}
