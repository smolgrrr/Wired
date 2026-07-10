import { useState } from "react";
import { normalizeUrl } from "@link/link";
import { buildEmojiMap, getEmojiDisplayUrls, type BodyEmoji } from "@lib/customEmoji";
import { getDisplayName } from "@lib/profile";
import { decodeProfileRef, NOSTR_PROFILE_REF_PATTERN } from "@lib/quotedEvents";
import { HTTP_URL_PATTERN } from "@lib/url";
import { useProfile } from "../hooks/useProfiles";

type LinkedBodyTextProps = {
  children: string;
  className?: string;
  emojis?: BodyEmoji[];
};

const EMOJI_SHORTCODE_PATTERN = /:([A-Za-z0-9_+-]+):/g;

type BodyToken = {
  kind: "url" | "emoji" | "profile";
  raw: string;
  index: number;
  url?: string;
  shortcode?: string;
  pubkey?: string;
};

function InlineCustomEmoji({
  shortcode,
  raw,
  url,
}: {
  shortcode: string;
  raw: string;
  url: string;
}) {
  const urls = getEmojiDisplayUrls(url);
  const [urlIndex, setUrlIndex] = useState(0);
  const src = urls[urlIndex];

  if (!src) {
    return <>{raw}</>;
  }

  return (
    <span className="inline-flex min-w-[1.35em] align-[-0.25em]" data-custom-emoji={shortcode}>
      <img
        src={src}
        alt={raw}
        title={raw}
        className="mx-0.5 inline-block h-[1.35em] w-[1.35em] object-contain"
        onError={() => {
          setUrlIndex((current) => current + 1);
        }}
      />
    </span>
  );
}

function InlineProfileMention({ raw, pubkey }: { raw: string; pubkey: string }) {
  const profile = useProfile(pubkey);

  return (
    <a
      href={raw}
      className="font-medium text-signal hover:underline"
    >
      @{getDisplayName(profile, pubkey)}
    </a>
  );
}

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

  for (const match of content.matchAll(NOSTR_PROFILE_REF_PATTERN)) {
    const raw = match[0];
    const profileRef = decodeProfileRef(raw);

    if (!profileRef) continue;

    tokens.push({
      kind: "profile",
      raw,
      index: match.index ?? 0,
      pubkey: profileRef.pubkey,
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
        <InlineCustomEmoji
          key={`${token.shortcode}-${token.index}`}
          shortcode={token.shortcode}
          raw={token.raw}
          url={token.url}
        />,
      );
    } else if (token.kind === "profile" && token.pubkey) {
      parts.push(
        <InlineProfileMention
          key={`${token.pubkey}-${token.index}`}
          raw={token.raw}
          pubkey={token.pubkey}
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
