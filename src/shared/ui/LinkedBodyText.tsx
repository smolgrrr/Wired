import { normalizeUrl } from "@link/link";
import { buildEmojiMap, type BodyEmoji } from "@lib/customEmoji";
import { HTTP_URL_PATTERN } from "@lib/url";

type LinkedBodyTextProps = {
  children: string;
  className?: string;
  emojis?: BodyEmoji[];
};

const EMOJI_SHORTCODE_PATTERN = /:([A-Za-z0-9_+-]+):/g;

type BodyToken = {
  kind: "url" | "emoji";
  raw: string;
  index: number;
  url?: string;
  shortcode?: string;
};

function getBodyTokens(content: string, emojiMap: Map<string, string>): BodyToken[] {
  const tokens: BodyToken[] = [];

  for (const match of content.matchAll(HTTP_URL_PATTERN)) {
    const raw = match[0];
    const index = match.index ?? 0;
    const normalized = normalizeUrl(raw);

    tokens.push({
      kind: "url",
      raw,
      index,
      url: normalized || undefined,
    });
  }

  for (const match of content.matchAll(EMOJI_SHORTCODE_PATTERN)) {
    const raw = match[0];
    const shortcode = match[1];
    const url = emojiMap.get(shortcode);

    if (!url) continue;

    tokens.push({
      kind: "emoji",
      raw,
      index: match.index ?? 0,
      shortcode,
      url,
    });
  }

  return tokens.sort((left, right) => left.index - right.index);
}

export function LinkedBodyText({ children, className, emojis = [] }: LinkedBodyTextProps) {
  const parts: React.ReactNode[] = [];
  const emojiMap = buildEmojiMap(emojis);
  const tokens = getBodyTokens(children, emojiMap);
  let lastIndex = 0;

  for (const token of tokens) {
    if (token.index < lastIndex) continue;

    if (token.index > lastIndex) {
      parts.push(children.slice(lastIndex, token.index));
    }

    if (token.kind === "url" && token.url) {
      parts.push(
        <a
          key={`${token.url}-${token.index}`}
          href={token.url}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-ghost underline-offset-2 hover:text-signal"
        >
          {token.raw}
        </a>,
      );
    } else if (token.kind === "emoji" && token.url && token.shortcode) {
      parts.push(
        <img
          key={`${token.shortcode}-${token.index}`}
          src={token.url}
          alt={`:${token.shortcode}:`}
          title={`:${token.shortcode}:`}
          className="mx-0.5 inline-block h-[1.35em] w-[1.35em] align-[-0.25em] object-contain"
          onError={(event) => {
            event.currentTarget.replaceWith(document.createTextNode(token.raw));
          }}
        />,
      );
    } else if (token.kind === "url") {
      parts.push(token.raw);
    }

    lastIndex = token.index + token.raw.length;
  }

  if (lastIndex < children.length) {
    parts.push(children.slice(lastIndex));
  }

  return <p className={className}>{parts}</p>;
}
