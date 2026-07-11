import { useState } from "react";
import { Link } from "react-router-dom";
import { PostCard } from "../../shared/ui/PostCard";
import { Event } from "nostr-tools";
import {
  useNotificationEvents,
  type NotificationSyncState,
} from "../../hooks/useNotificationEvents";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import { PageShell } from "../../shared/ui/PageShell";
import { useThreadNavigation } from "../thread/useThreadNavigation";

type NotificationSection = "yours" | "mentions";

type ActivityStateProps = {
  actionHref?: string;
  actionLabel?: string;
  message: string;
  title: string;
  tone?: "normal" | "warning";
};

function ActivityState({
  actionHref,
  actionLabel,
  message,
  title,
  tone = "normal",
}: ActivityStateProps) {
  return (
    <div
      className={[
        "rounded-sm border px-4 py-5",
        tone === "warning"
          ? "border-danger-dim bg-surface"
          : "border-ghost bg-surface",
      ].join(" ")}
      role={tone === "warning" ? "status" : undefined}
    >
      <p className="text-body text-primary">{title}</p>
      <p className="mt-1 text-meta text-muted">{message}</p>
      {actionHref && actionLabel ? (
        <Link
          to={actionHref}
          className="mt-4 inline-flex min-h-[24px] items-center rounded-sm border border-ghost bg-surface-raised px-3 py-1.5 text-meta text-primary transition-colors duration-hover hover:border-signal/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-ghost focus-visible:ring-offset-2 focus-visible:ring-offset-void"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

function ActivityLoadingState({ label }: { label: string }) {
  return (
    <div
      className="rounded-sm border border-ghost bg-surface px-4 py-5"
      role="status"
      aria-live="polite"
    >
      <p className="text-body text-primary">syncing {label}</p>
      <p className="mt-1 text-meta text-muted">Checking relays for saved signal keys.</p>
      <div className="mt-4 grid gap-2" aria-hidden="true">
        <div className="h-3 w-3/4 rounded bg-surface-raised" />
        <div className="h-3 w-full rounded bg-surface-raised" />
        <div className="h-3 w-1/2 rounded bg-surface-raised" />
      </div>
    </div>
  );
}

type NotificationColumnProps = {
  countReplies: (event: Event) => Event[];
  emptyMessage: string;
  emptyTitle: string;
  events: Event[];
  hasLocalKeys: boolean;
  label: string;
  onOpenThread: ReturnType<typeof useThreadNavigation>;
  section: NotificationSection;
  syncState: NotificationSyncState;
};

function NotificationColumn({
  countReplies,
  emptyMessage,
  emptyTitle,
  events,
  hasLocalKeys,
  label,
  onOpenThread,
  section,
  syncState,
}: NotificationColumnProps) {
  const showLoading = hasLocalKeys && syncState === "syncing" && events.length === 0;
  const showDegraded = hasLocalKeys && syncState === "degraded";
  const showEmpty = !showLoading && !showDegraded && events.length === 0;
  const actionHref = hasLocalKeys ? "/" : "/settings";
  const actionLabel = hasLocalKeys ? "start a transmission" : "add a signal key";

  return (
    <>
      <span className="text-meta text-muted">{label}</span>
      {showLoading ? <ActivityLoadingState label={label} /> : null}
      {showDegraded ? (
        <ActivityState
          title="activity sync delayed"
          message={`Relay sync is taking longer than expected. Showing ${
            section === "yours" ? "local transmissions" : "mentions"
          } received so far.`}
          tone="warning"
        />
      ) : null}
      {showEmpty ? (
        <ActivityState
          title={hasLocalKeys ? emptyTitle : "no local signal keys"}
          message={
            hasLocalKeys
              ? emptyMessage
              : "This device has no saved signal keys to check for activity."
          }
          actionHref={actionHref}
          actionLabel={actionLabel}
        />
      ) : null}
      {events.map((event) => (
        <PostCard
          key={event.id}
          event={event}
          replies={countReplies(event)}
          onOpenThread={onOpenThread}
        />
      ))}
    </>
  );
}

export default function NotificationsPage() {
  const [notifsView, setNotifsView] = useState<NotificationSection>("yours");
  const { noteEvents, pubkeys, syncState } = useNotificationEvents();
  const openThread = useThreadNavigation();
  const hasLocalKeys = pubkeys.length > 0;

  const postEvents = noteEvents.filter(
    (event) => event.kind !== 0 && pubkeys.includes(event.pubkey),
  );

  const sortedEvents = [...postEvents].sort((a, b) => b.created_at - a.created_at);

  const mentions = noteEvents.filter(
    (event) =>
      event.kind !== 0 &&
      event.tags.some((tag) => tag[0] === "p" && pubkeys.includes(tag[1])),
  );

  const sortedMentions = [...mentions].sort((a, b) => b.created_at - a.created_at);

  const countReplies = (event: Event) =>
    noteEvents.filter((e) => e.tags.some((tag) => tag[0] === "e" && tag[1] === event.id));

  return (
    <PageShell className="max-w-content mx-auto px-4">
      <div className="block sm:hidden mb-4">
        <SegmentedControl
          aria-label="Notification view"
          options={[
            { value: "yours", label: "yours" },
            { value: "mentions", label: "mentions" },
          ]}
          value={notifsView}
          onChange={setNotifsView}
        />
      </div>
      <div className="flex gap-8">
        <div className={`grid grid-cols-1 gap-4 flex-grow ${notifsView === "mentions" ? "hidden sm:grid" : ""}`}>
          <NotificationColumn
            countReplies={countReplies}
            emptyMessage="Transmit from the main feed to build this local history."
            emptyTitle="no local transmissions yet"
            events={sortedEvents}
            hasLocalKeys={hasLocalKeys}
            label="your transmissions"
            onOpenThread={openThread}
            section="yours"
            syncState={syncState}
          />
        </div>
        <div className={`grid grid-cols-1 gap-4 flex-grow ${notifsView === "yours" ? "hidden sm:grid" : ""}`}>
          <NotificationColumn
            countReplies={countReplies}
            emptyMessage="Post from the main feed so other signals can mention you."
            emptyTitle="no mentions yet"
            events={sortedMentions}
            hasLocalKeys={hasLocalKeys}
            label="mentions"
            onOpenThread={openThread}
            section="mentions"
            syncState={syncState}
          />
        </div>
      </div>
    </PageShell>
  );
}
