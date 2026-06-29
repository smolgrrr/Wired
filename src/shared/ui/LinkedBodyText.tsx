import { normalizeUrl } from "@link/link";
import { HTTP_URL_PATTERN } from "@lib/url";

type LinkedBodyTextProps = {
  children: string;
  className?: string;
};

export function LinkedBodyText({ children, className }: LinkedBodyTextProps) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of children.matchAll(HTTP_URL_PATTERN)) {
    const rawUrl = match[0];
    const index = match.index ?? 0;
    const normalized = normalizeUrl(rawUrl);

    if (index > lastIndex) {
      parts.push(children.slice(lastIndex, index));
    }

    if (normalized) {
      parts.push(
        <a
          key={`${normalized}-${index}`}
          href={normalized}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-ghost underline-offset-2 hover:text-signal"
        >
          {rawUrl}
        </a>,
      );
    } else {
      parts.push(rawUrl);
    }

    lastIndex = index + rawUrl.length;
  }

  if (lastIndex < children.length) {
    parts.push(children.slice(lastIndex));
  }

  return <p className={className}>{parts}</p>;
}
