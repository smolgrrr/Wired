import { Event } from "nostr-tools";
import { getPollLabel, getPollOptions } from "../../utils/pollUtils";

export function PollSummary({ eventdata }: { eventdata: Event }) {
  const options = getPollOptions(eventdata);
  const label = getPollLabel(eventdata);

  if (options.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-1">
      {label && <p className="text-meta text-secondary">{label}</p>}
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