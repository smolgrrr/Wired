import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleFeedBootstrapApi } from "../_shared/handlers.js";
import { sendJson } from "../_shared/vercel.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return sendJson(res, await handleFeedBootstrapApi(req));
}
