import type { Event, UnsignedEvent } from "nostr-tools";
import { CONFESS_API_BASE } from "../../config";

export type ConfessAdmissionEvent = UnsignedEvent & Pick<Event, "id">;

export type ConfessStatus = {
  configured: boolean;
  pubkey: string;
  day: string;
  count: number;
  limit: number;
  remaining: number;
  minimumPow: number;
  closed: boolean;
  nextResetAt: string;
};

export type ConfessSubmitResponse = {
  ok: true;
  event: Event;
  acceptedRelays: string[];
  count: number;
  remaining: number;
  minimumPow: number;
  nextResetAt: string;
};

function confessUrl(path: string): string {
  return `${CONFESS_API_BASE}${path}`;
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

export async function fetchConfessStatus(): Promise<ConfessStatus> {
  const response = await fetch(confessUrl("/api/confess/status"), {
    cache: "no-store",
  });
  return readJson<ConfessStatus>(response);
}

export async function submitConfession(event: ConfessAdmissionEvent): Promise<ConfessSubmitResponse> {
  const response = await fetch(confessUrl("/api/confess"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event }),
  });
  return readJson<ConfessSubmitResponse>(response);
}
