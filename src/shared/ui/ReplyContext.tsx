import { Event } from "nostr-tools";
import { uniqBy } from "@lib/collections";
import { getDisplayName } from "@lib/profile";
import { useProfile } from "../hooks/useProfiles";

type ReplyContextProps = {
  events: Event[];
};

function ReplyAuthorLabel({ event }: { event: Event }) {
  const profile = useProfile(event.pubkey);
  return <>{getDisplayName(profile, event.pubkey)}</>;
}

export function ReplyContext({ events }: ReplyContextProps) {
  const uniqueAuthors = uniqBy(events, "pubkey");
  if (uniqueAuthors.length === 0) return null;

  const [first, ...rest] = uniqueAuthors;
  const additionalCount = rest.length;

  return (
    <p className="text-meta text-muted mt-1">
      re <ReplyAuthorLabel event={first} />
      {additionalCount > 0 ? ` +${additionalCount}` : ""}
    </p>
  );
}