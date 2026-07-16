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

function hasContentWarning(event: Event): boolean {
  return event.tags.some((tag) => tag[0] === "content-warning");
}

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
  const moderationKey = `${event.id}|${itemKey}`;
  const initialVerdicts = useMemo(
    () => new Map(
      moderatedItems.map((item) => [
        item.url,
        client?.initialVerdict(item) ?? ALLOWED_MEDIA_VERDICT,
      ] as const),
    ),
    // itemKey represents every moderation-relevant item field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, moderationKey],
  );
  const [verdictState, setVerdictState] = useState<{
    key: string;
    verdicts: Map<string, MediaPresentationVerdict>;
  }>(() => ({ key: moderationKey, verdicts: initialVerdicts }));
  const verdicts = verdictState.key === moderationKey
    ? verdictState.verdicts
    : initialVerdicts;

  useEffect(() => {
    setVerdictState({ key: moderationKey, verdicts: initialVerdicts });
    if (!client) {
      return;
    }
    const stops = moderatedItems.map((item) =>
      client.watch(event, item, (verdict) => {
        setVerdictState((current) => {
          const next = new Map(
            current.key === moderationKey ? current.verdicts : initialVerdicts,
          );
          next.set(item.url, verdict);
          return { key: moderationKey, verdicts: next };
        });
      }),
    );
    return () => stops.forEach((stop) => stop());
    // itemKey represents every moderation-relevant item field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, event.id, initialVerdicts, itemKey, moderationKey]);

  const blocked = [...verdicts.values()].some(
    (verdict) => verdict.enforced && verdict.status === "blocked",
  );
  const eventRequiresReview = hasContentWarning(event) || [...verdicts.values()].some(
    (verdict) => verdict.enforced && verdict.status === "review-required",
  );
  const presentationVerdicts = useMemo(() => {
    if (!eventRequiresReview) return verdicts;
    const reason = hasContentWarning(event)
      ? "event_content_warning"
      : "event_attachment_review_required";
    return new Map(
      [...verdicts].map(([url, verdict]) => [
        url,
        verdict.enforced && verdict.status !== "blocked"
          ? { ...verdict, status: "review-required" as const, reason }
          : verdict,
      ]),
    );
  }, [event, eventRequiresReview, verdicts]);

  return { blocked, verdicts: presentationVerdicts };
}
