import type { VercelRequest, VercelResponse } from "@vercel/node";
import { refreshFeedBootstrapSnapshot } from "../../lib/feedBootstrapCache.js";

function isAuthorized(req: VercelRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return process.env.NODE_ENV !== "production";
  }

  return req.headers.authorization === `Bearer ${cronSecret}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method not allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const snapshot = await refreshFeedBootstrapSnapshot();
    return res.status(200).json({
      ok: true,
      fetchedAt: snapshot.fetchedAt,
      postCount: snapshot.processedEvents.length,
      profileCount: Object.keys(snapshot.profiles).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "refresh failed";
    return res.status(500).json({ error: message });
  }
}