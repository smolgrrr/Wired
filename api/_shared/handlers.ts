import { normalizeUrl } from "../../lib/link.js";
import {
  getDefaultFeedBootstrapService,
  type FeedBootstrapCacheService,
} from "../../lib/feedBootstrapCache.js";
import { unfurlUrl } from "../../lib/unfurl.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const UNFURL_CACHE_HEADER = "public, max-age=3600";
export const FEED_BOOTSTRAP_CACHE_HEADER =
  "public, s-maxage=120, stale-while-revalidate=300";

export type ApiRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
};

export type ApiResult = {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
};

export type FeedApiOptions = {
  service?: FeedBootstrapCacheService;
};

function json(status: number, body: unknown, headers: Record<string, string> = {}): ApiResult {
  return {
    status,
    headers: { ...JSON_HEADERS, ...headers },
    body,
  };
}

function methodNotAllowed(): ApiResult {
  return json(405, { error: "method not allowed" }, { Allow: "GET" });
}

function firstQueryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function getQueryValue(req: ApiRequest, key: string): string {
  if (req.query && key in req.query) {
    return firstQueryValue(req.query[key]);
  }

  const requestUrl = new URL(req.url ?? "", "http://localhost");
  return requestUrl.searchParams.get(key) ?? "";
}

function isAuthorized(req: ApiRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const authorization = req.headers?.authorization;
  return authorization === `Bearer ${cronSecret}`;
}

function refreshSummary(snapshot: Awaited<ReturnType<FeedBootstrapCacheService["refresh"]>>) {
  return {
    ok: true,
    fetchedAt: snapshot.fetchedAt,
    postCount: snapshot.processedEvents.length,
    profileCount: Object.keys(snapshot.profiles).length,
  };
}

export async function handleUnfurlApi(req: ApiRequest): Promise<ApiResult> {
  if (req.method !== "GET") {
    return methodNotAllowed();
  }

  const target = normalizeUrl(getQueryValue(req, "url"));
  if (!target) {
    return json(400, { error: "invalid url" });
  }

  const metadata = await unfurlUrl(target);
  if (!metadata) {
    return json(502, { error: "fetch failed" });
  }

  return json(200, metadata, { "Cache-Control": UNFURL_CACHE_HEADER });
}

export async function handleFeedBootstrapApi(
  req: ApiRequest,
  { service = getDefaultFeedBootstrapService() }: FeedApiOptions = {},
): Promise<ApiResult> {
  if (req.method !== "GET") {
    return methodNotAllowed();
  }

  const snapshot = await service.get();
  if (!snapshot) {
    return json(503, {
      error: "bootstrap unavailable",
      lastRefreshError: service.getLastRefreshError(),
    });
  }

  return json(200, snapshot, { "Cache-Control": FEED_BOOTSTRAP_CACHE_HEADER });
}

export async function handleFeedRefreshApi(
  req: ApiRequest,
  { service = getDefaultFeedBootstrapService() }: FeedApiOptions = {},
): Promise<ApiResult> {
  if (req.method !== "GET") {
    return methodNotAllowed();
  }

  if (!isAuthorized(req)) {
    return json(401, { error: "unauthorized" });
  }

  try {
    return json(200, refreshSummary(await service.refresh()));
  } catch {
    return json(500, { error: service.getLastRefreshError() ?? "refresh failed" });
  }
}
