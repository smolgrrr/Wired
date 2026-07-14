import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Event } from "nostr-tools";
import {
  MEDIA_MODERATION_API_BASE,
  MEDIA_MODERATION_COHORT_PERCENT,
  MEDIA_MODERATION_MODE,
  MEDIA_MODERATION_SURFACES,
} from "../../config";
import {
  createMediaModerationClient,
  type MediaModerationClient,
} from "../lib/mediaModerationClient";
import {
  ALLOWED_MEDIA_VERDICT,
  type MediaPresentationVerdict,
} from "../lib/mediaModeration";
import type { MediaItem } from "../lib/mediaUtils";

const MediaModerationContext = createContext<MediaModerationClient | null>(null);
const COHORT_STORAGE_KEY = "wiredMediaModerationCohort";

function selectedForMediaModerationCohort(): boolean {
  if (MEDIA_MODERATION_COHORT_PERCENT >= 100) return true;
  if (MEDIA_MODERATION_COHORT_PERCENT <= 0) return false;
  try {
    const existing = Number(window.localStorage.getItem(COHORT_STORAGE_KEY));
    const bucket = Number.isInteger(existing) && existing >= 0 && existing < 100
      ? existing
      : Math.floor(Math.random() * 100);
    window.localStorage.setItem(COHORT_STORAGE_KEY, String(bucket));
    return bucket < MEDIA_MODERATION_COHORT_PERCENT;
  } catch {
    return false;
  }
}

export function MediaModerationProvider({
  children,
  client,
}: {
  children: ReactNode;
  client?: MediaModerationClient;
}) {
  const ownedClient = useMemo(
    () =>
      client ??
      createMediaModerationClient({
        baseUrl: MEDIA_MODERATION_API_BASE,
        mode: selectedForMediaModerationCohort() ? MEDIA_MODERATION_MODE : "off",
        enabledMediaTypes: MEDIA_MODERATION_SURFACES,
      }),
    [client],
  );

  useEffect(
    () => () => {
      if (!client) ownedClient.close();
    },
    [client, ownedClient],
  );

  return (
    <MediaModerationContext.Provider value={ownedClient}>
      {children}
    </MediaModerationContext.Provider>
  );
}

export function useMediaModeration(event: Event, items: MediaItem[]) {
  const client = useContext(MediaModerationContext);
  const moderatedItems = useMemo(
    () => items.filter((item) => item.type === "image" || item.type === "video"),
    [items],
  );
  const itemKey = moderatedItems
    .map((item) => `${item.type}:${item.url}:${item.sha256 || ""}`)
    .join("|");
  const [verdicts, setVerdicts] = useState<Map<string, MediaPresentationVerdict>>(
    () =>
      new Map(
        moderatedItems.map((item) => [item.url, ALLOWED_MEDIA_VERDICT] as const),
      ),
  );

  useEffect(() => {
    if (!client) {
      setVerdicts(
        new Map(
          moderatedItems.map((item) => [item.url, ALLOWED_MEDIA_VERDICT] as const),
        ),
      );
      return;
    }
    const stops = moderatedItems.map((item) =>
      client.watch(event, item, (verdict) => {
        setVerdicts((current) => {
          const next = new Map(current);
          next.set(item.url, verdict);
          return next;
        });
      }),
    );
    return () => stops.forEach((stop) => stop());
    // itemKey represents every moderation-relevant item field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, event.id, itemKey]);

  const blocked = [...verdicts.values()].some(
    (verdict) => verdict.enforced && verdict.status === "blocked",
  );
  return { blocked, verdicts };
}
