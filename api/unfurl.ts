import type { VercelRequest, VercelResponse } from "@vercel/node";
import { normalizeUrl } from "../lib/link.js";
import { unfurlUrl } from "../lib/unfurl.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method not allowed" });
  }

  const rawUrl = req.query.url;
  const target = typeof rawUrl === "string" ? normalizeUrl(rawUrl) : "";

  if (!target) {
    return res.status(400).json({ error: "invalid url" });
  }

  const metadata = await unfurlUrl(target);
  if (!metadata) {
    return res.status(502).json({ error: "fetch failed" });
  }

  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).json(metadata);
}