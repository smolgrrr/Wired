import { useState } from "react";
import { PostCard } from "../../shared/ui/PostCard";
import { Event } from "nostr-tools";
import { useNotificationEvents } from "../../hooks/useNotificationEvents";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import { PageShell } from "../../shared/ui/PageShell";

export default function NotificationsPage() {
  const [notifsView, setNotifsView] = useState<"yours" | "mentions">("yours");
  const { noteEvents, pubkeys } = useNotificationEvents();

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
          <span className="text-meta text-muted">your transmissions</span>
          {sortedEvents.map((event) => (
            <PostCard key={event.id} event={event} replies={countReplies(event)} />
          ))}
        </div>
        <div className={`grid grid-cols-1 gap-4 flex-grow ${notifsView === "yours" ? "hidden sm:grid" : ""}`}>
          <span className="text-meta text-muted">mentions</span>
          {sortedMentions.map((event) => (
            <PostCard key={event.id} event={event} replies={countReplies(event)} />
          ))}
        </div>
      </div>
    </PageShell>
  );
}