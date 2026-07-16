import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleWorkflowStatusIngestApi } from "./_shared/handlers.js";
import { sendJson, toApiRequest } from "./_shared/vercel.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return sendJson(res, await handleWorkflowStatusIngestApi(toApiRequest(req)));
}

