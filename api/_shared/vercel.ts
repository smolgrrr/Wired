import type { VercelResponse } from "@vercel/node";
import type { ApiResult } from "./handlers.js";

export function toApiRequest(req: {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
  body?: unknown;
}) {
  return {
    method: req.method,
    headers: req.headers,
    query: req.query,
    url: req.url,
    body: req.body,
  };
}

export function sendJson(res: VercelResponse, result: ApiResult) {
  for (const [name, value] of Object.entries(result.headers ?? {})) {
    res.setHeader(name, value);
  }

  return res.status(result.status).json(result.body);
}
