import type { ThreadPreview } from "./threadPreview.js";

export const WIRED_SITE_NAME = "Wired";
export const WIRED_DEFAULT_DESCRIPTION =
  "Anonymous signals from people who live online.";

export type ThreadMetadata = {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
};

function replyLabel(replyCount: number): string {
  return `${replyCount} ${replyCount === 1 ? "reply" : "replies"}`;
}

export function buildThreadMetadata(
  preview: ThreadPreview | null,
  canonicalUrl: string,
  imageUrl: string,
): ThreadMetadata {
  if (!preview) {
    return {
      title: WIRED_SITE_NAME,
      description: WIRED_DEFAULT_DESCRIPTION,
      canonicalUrl,
      imageUrl,
    };
  }

  return {
    title: `${preview.excerpt} — Wired`,
    description: `Read this anonymous signal and ${replyLabel(preview.replyCount)} on Wired.`,
    canonicalUrl,
    imageUrl,
  };
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function metadataTags(metadata: ThreadMetadata): string {
  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metadata.description);
  const canonicalUrl = escapeHtml(metadata.canonicalUrl);
  const imageUrl = escapeHtml(metadata.imageUrl);

  return [
    `<link rel="canonical" href="${canonicalUrl}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="${WIRED_SITE_NAME}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${canonicalUrl}" />`,
    `<meta property="og:image" content="${imageUrl}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Wired thread preview" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${imageUrl}" />`,
  ].join("\n    ");
}

export function injectThreadMetadata(html: string, metadata: ThreadMetadata): string {
  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metadata.description);
  const withTitle = html.replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`);
  const withDescription = withTitle.replace(
    /<meta\s+name=["']description["']\s+content=["'][^"']*["']\s*\/?>/i,
    `<meta name="description" content="${description}" />`,
  );

  return withDescription.replace("</head>", `    ${metadataTags(metadata)}\n  </head>`);
}
