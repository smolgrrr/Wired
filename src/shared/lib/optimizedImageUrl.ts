export const OPTIMIZED_IMAGE_HOSTS = [
  "nostr.build",
  "nostr.band",
  "cdn.nostrcheck.me",
  "blossom.band",
  "blossom.primal.net",
  "nostur.com",
  "sebastix.social",
  "girino.org",
] as const;

export const OPTIMIZED_IMAGE_SIZES = [48, 96, 384, 640, 828, 1080, 1200] as const;

const DEFAULT_QUALITY = 75;

const SKIP_EXTENSIONS = new Set(["gif", "svg"]);

function isDevEnvironment(): boolean {
  return import.meta.env.DEV;
}

function hostnameAllowed(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return OPTIMIZED_IMAGE_HOSTS.some(
    (allowed) => lower === allowed || lower.endsWith(`.${allowed}`),
  );
}

function extensionFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    return match?.[1].toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function isOptimizableImageUrl(url: string): boolean {
  if (isDevEnvironment()) return false;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;

    const extension = extensionFromUrl(url);
    if (extension && SKIP_EXTENSIONS.has(extension)) return false;

    return hostnameAllowed(parsed.hostname);
  } catch {
    return false;
  }
}

export function pickOptimizedWidth(
  naturalWidth?: number,
  maxDisplayPx = 828,
): number {
  const target = naturalWidth
    ? Math.min(naturalWidth, maxDisplayPx)
    : maxDisplayPx;

  let closest: (typeof OPTIMIZED_IMAGE_SIZES)[number] = OPTIMIZED_IMAGE_SIZES[0];
  let closestDistance = Math.abs(target - closest);

  for (const size of OPTIMIZED_IMAGE_SIZES) {
    const distance = Math.abs(target - size);
    if (distance < closestDistance) {
      closest = size;
      closestDistance = distance;
    }
  }

  return closest;
}

export function optimizedImageUrl(url: string, width: number): string {
  if (!isOptimizableImageUrl(url)) return url;

  const snappedWidth = pickOptimizedWidth(width, width);
  const params = new URLSearchParams({
    url,
    w: String(snappedWidth),
    q: String(DEFAULT_QUALITY),
  });

  return `/_vercel/image?${params.toString()}`;
}

export function optimizedImageSrcSet(
  url: string,
  widths: readonly number[],
): string | undefined {
  if (!isOptimizableImageUrl(url)) return undefined;

  const uniqueWidths = [...new Set(widths.map((width) => pickOptimizedWidth(width, width)))];
  return uniqueWidths
    .map((width) => `${optimizedImageUrl(url, width)} ${width}w`)
    .join(", ");
}

export function optimizedAvatarUrl(url: string, displayPx: number): string {
  const retinaWidth = displayPx * 2;
  return optimizedImageUrl(url, pickOptimizedWidth(retinaWidth, 96));
}