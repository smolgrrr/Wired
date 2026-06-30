import type { PollViewModel } from "@lib/pollUtils";

export function PollSummary({ poll }: { poll: PollViewModel }) {
  if (poll.options.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-1">
      <ul className="flex flex-col gap-1">
        {poll.options.map((option) => (
          <li key={option.id} className="text-meta text-muted">
            · {option.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
