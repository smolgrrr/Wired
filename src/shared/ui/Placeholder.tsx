type PlaceholderProps = {
  message?: string;
};

export function Placeholder({ message = "acquiring signal…" }: PlaceholderProps) {
  return (
    <p className="text-meta text-muted text-center py-8" role="status">
      {message}
    </p>
  );
}
