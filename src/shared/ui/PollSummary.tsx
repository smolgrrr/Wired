import { Event } from "nostr-tools";
import { getPollOptions } from "../../utils/pollUtils";

export function PollSummary({ eventdata }: { eventdata: Event }) {
  const options = getPollOptions(eventdata);

  if (options.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-1">
      <ul className="flex flex-col gap-1">
        {options.map(([id, text]) => (
          <li key={id} className="text-meta text-muted">
            · {text}
          </li>
        ))}
      </ul>
    </div>
  );
}