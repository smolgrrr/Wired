import type { VercelResponse } from "@vercel/node";
import type { ApiResult } from "./handlers.js";

export function sendJson(res: VercelResponse, result: ApiResult) {
  for (const [name, value] of Object.entries(result.headers ?? {})) {
    res.setHeader(name, value);
  }

  return res.status(result.status).json(result.body);
}
