import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import type { ApiRequest, ApiResult } from "./handlers.js";

export function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

export function toApiRequest(req: IncomingMessage): ApiRequest {
  return {
    method: req.method,
    headers: normalizeHeaders(req.headers),
    url: req.url,
  };
}

export function writeJson(res: ServerResponse, result: ApiResult): void {
  res.statusCode = result.status;

  for (const [name, value] of Object.entries(result.headers ?? {})) {
    res.setHeader(name, value);
  }

  res.end(JSON.stringify(result.body));
}

export function handleOptions(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method !== "OPTIONS") {
    return false;
  }

  res.statusCode = 204;
  res.end();
  return true;
}

function normalizeHeaders(headers: IncomingHttpHeaders): Record<string, string | string[] | undefined> {
  return Object.fromEntries(
    Object.entries(headers).filter((entry): entry is [string, string | string[]] => {
      const [, value] = entry;
      return typeof value === "string" || Array.isArray(value);
    }),
  );
}
