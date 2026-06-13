import { Event } from "nostr-tools";
import { uniqBy } from "../../utils/otherUtils";

type ReplyContextProps = {
  events: Event[];
};

export function ReplyContext({ events }: ReplyContextProps) {
  const uniqueAuthors = uniqBy(events, "pubkey");
  if (uniqueAuthors.length === 0) return null;

  const [first, ...rest] = uniqueAuthors;
  const additionalCount = rest.length;

  return (
    <p className="text-meta text-muted mt-1">
      re {first.pubkey.slice(0, 8)}
      {additionalCount > 0 ? ` +${additionalCount}` : ""}
    </p>
  );
}