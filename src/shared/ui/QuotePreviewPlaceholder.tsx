export function QuotePreviewPlaceholder({ message }: { message: string }) {
  return (
    <div
      className="mt-3 rounded border border-[var(--border-ghost)] bg-[var(--surface)] px-3 py-2"
      aria-label="quoted note"
    >
      <p className="text-meta text-muted">{message}</p>
    </div>
  );
}