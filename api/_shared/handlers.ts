import { normalizeUrl } from "../../lib/link.js";
import {
  getDefaultFeedBootstrapService,
  type FeedBootstrapCacheService,
} from "../../lib/feedBootstrapCache.js";
import { unfurlUrl } from "../../lib/unfurl.js";
import {
  getDefaultRelayWorkflowStatusIngestService,
  type RelayWorkflowStatusIngestService,
} from "../../lib/relayWorkflowStatusIngest.js";
import { RELAY_WORKFLOW_STATUS_LIMITS } from "../../src/contracts/relay-workflow-status.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const UNFURL_CACHE_HEADER =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600";
export const FEED_BOOTSTRAP_CACHE_HEADER =
  "public, s-maxage=120, stale-while-revalidate=300";

export type ApiRequest = {
  body?: unknown;
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
  waitUntil?: (promise: Promise<unknown>) => void;
};

export type WorkflowStatusApiOptions = {
  service?: RelayWorkflowStatusIngestService;
};

function json(status: number, body: unknown, headers: Record<string, string> = {}): ApiResult {
  return {
    status,
    headers: { ...JSON_HEADERS, ...headers },
    body,
  };
}

function methodNotAllowed(allow = "GET"): ApiResult {
  return json(405, { error: "method not allowed" }, { Allow: allow });
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

function getHeaderValue(req: ApiRequest, key: string): string {
  const headers = req.headers;
  if (!headers) return "";

  const lowerKey = key.toLowerCase();
  for (const [headerKey, value] of Object.entries(headers)) {
    if (headerKey.toLowerCase() !== lowerKey) continue;
    return firstQueryValue(value);
  }

  return "";
}

function isAuthorized(req: ApiRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const authorization = getHeaderValue(req, "authorization");
  return authorization === `Bearer ${cronSecret}`;
}

function requestOrigin(req: ApiRequest): string {
  const protocol = getHeaderValue(req, "x-forwarded-proto") || "https";
  const host = getHeaderValue(req, "x-forwarded-host") || getHeaderValue(req, "host");
  return host ? `${protocol}://${host}` : "";
}

function isWorkflowStatusAuthorized(req: ApiRequest): boolean {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) || !("source" in body)) {
    return true;
  }
  const source = (body as { source?: unknown }).source;
  if (source === "wired-browser") {
    const origin = getHeaderValue(req, "origin");
    const configuredOrigin = String(process.env.WORKFLOW_STATUS_ALLOWED_ORIGIN ?? "")
      .trim().replace(/\/$/, "");
    const allowedOrigin = configuredOrigin ||
      (process.env.NODE_ENV === "production" ? "" : requestOrigin(req));
    return Boolean(origin && allowedOrigin && origin === allowedOrigin);
  }
  if (source === "wired-admin") {
    const token = String(process.env.WORKFLOW_STATUS_ADMIN_TOKEN ?? "");
    return Boolean(token && getHeaderValue(req, "authorization") === `Bearer ${token}`);
  }
  return false;
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
      cache: {
        hit: false,
        refreshOnRead: service.canRefreshOnRead(),
        refreshing: service.isRefreshing(),
      },
      lastRefreshError: service.getLastRefreshError(),
    });
  }

  return json(200, snapshot, { "Cache-Control": FEED_BOOTSTRAP_CACHE_HEADER });
}

export async function handleFeedRefreshApi(
  req: ApiRequest,
  { service = getDefaultFeedBootstrapService(), waitUntil }: FeedApiOptions = {},
): Promise<ApiResult> {
  if (req.method !== "GET") {
    return methodNotAllowed();
  }

  if (!isAuthorized(req)) {
    return json(401, { error: "unauthorized" });
  }

  if (waitUntil) {
    const wasRefreshing = service.isRefreshing();
    waitUntil(service.refresh().catch(() => undefined));
    return json(202, {
      ok: true,
      refresh: wasRefreshing ? "already-running" : "started",
    });
  }

  try {
    return json(200, refreshSummary(await service.refresh()));
  } catch {
    return json(500, { error: service.getLastRefreshError() ?? "refresh failed" });
  }
}

export async function handleWorkflowStatusIngestApi(
  req: ApiRequest,
  { service = getDefaultRelayWorkflowStatusIngestService() }: WorkflowStatusApiOptions = {},
): Promise<ApiResult> {
  if (req.method !== "POST") return methodNotAllowed("POST");
  const contentType = getHeaderValue(req, "content-type").toLowerCase();
  if (contentType && !contentType.startsWith("application/json")) {
    return json(415, { error: "content type must be application/json" }, {
      "Cache-Control": "no-store",
    });
  }
  if (!isWorkflowStatusAuthorized(req)) {
    return json(401, { error: "unauthorized" }, { "Cache-Control": "no-store" });
  }
  const contentLength = Number(getHeaderValue(req, "content-length") || 0);
  if (Number.isFinite(contentLength) &&
    contentLength > RELAY_WORKFLOW_STATUS_LIMITS.envelopeBytes) {
    return json(413, { error: "envelope too large" }, { "Cache-Control": "no-store" });
  }

  try {
    const result = await service.ingest(req.body);
    const headers = { "Cache-Control": "no-store" };
    switch (result) {
      case "stored": return json(202, { ok: true }, headers);
      case "disabled": return { status: 204, headers, body: null };
      case "oversized": return json(413, { error: "envelope too large" }, headers);
      case "stale": return json(422, { error: "envelope outside retention window" }, headers);
      case "rate-limited":
      case "daily-limit":
      case "preview-key-limit":
        return json(429, { error: result }, { ...headers, "Retry-After": "60" });
      default: return json(400, { error: "invalid envelope" }, headers);
    }
  } catch {
    return json(503, { error: "workflow status unavailable" }, {
      "Cache-Control": "no-store",
      "Retry-After": "60",
    });
  }
}

export async function handleWorkflowStatusPurgeApi(
  req: ApiRequest,
  { service = getDefaultRelayWorkflowStatusIngestService() }: WorkflowStatusApiOptions = {},
): Promise<ApiResult> {
  if (req.method !== "GET") return methodNotAllowed();
  if (!isAuthorized(req)) return json(401, { error: "unauthorized" });
  try {
    return json(200, { ok: true, deleted: await service.purgeExpired() }, {
      "Cache-Control": "no-store",
    });
  } catch {
    return json(503, { error: "workflow status purge unavailable" }, {
      "Cache-Control": "no-store",
    });
  }
}
