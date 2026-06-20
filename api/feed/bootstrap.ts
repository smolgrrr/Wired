import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getFeedBootstrapSnapshot } from "../../lib/feedBootstrapCache.js";

const CACHE_HEADER = "public, s-maxage=120, stale-while-revalidate=300";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method not allowed" });
  }

  const snapshot = await getFeedBootstrapSnapshot();
  if (!snapshot) {
    return res.status(503).json({ error: "bootstrap unavailable" });
  }

  res.setHeader("Cache-Control", CACHE_HEADER);
  return res.status(200).json(snapshot);
}