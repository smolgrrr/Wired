import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildThreadMetadata, injectThreadMetadata } from "../lib/threadMetadata.js";
import { resolveThreadPreview } from "../lib/threadPreview.js";
import { waitUntil } from "@vercel/functions";
import { createPreviewResolutionObserver } from "../lib/relayWorkflowPreviewCorrelation.js";

const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function requestOrigin(req: VercelRequest): string {
  const protocol = first(req.headers["x-forwarded-proto"]) || "https";
  const host = first(req.headers["x-forwarded-host"]) || first(req.headers.host);
  return `${protocol}://${host}`;
}

async function loadHtmlShell(origin: string): Promise<string | null> {
  try {
    return await readFile(path.join(process.cwd(), "dist/index.html"), "utf8");
  } catch {
    try {
      const response = await fetch(new URL("/", origin), {
        headers: { Accept: "text/html", "x-wired-thread-shell": "1" },
      });
      return response.ok ? await response.text() : null;
    } catch {
      return null;
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("method not allowed");
  }

  const ref = first(req.query.id);
  const origin = requestOrigin(req);
  const canonicalUrl = new URL(`/thread/${encodeURIComponent(ref)}`, origin).toString();

  const [shell, preview] = await Promise.all([
    loadHtmlShell(origin),
    resolveThreadPreview(ref, {
      origin,
      onResolution: createPreviewResolutionObserver({
        endpoint: "thread-html",
        defer: waitUntil,
      }),
    }),
  ]);

  if (!shell) {
    return res.status(502).send("Wired is temporarily unavailable");
  }

  const imageUrl = new URL(
    `/api/thread-card?id=${encodeURIComponent(ref)}&replies=${preview?.replyCount ?? 0}`,
    origin,
  ).toString();

  const html = injectThreadMetadata(
    shell,
    buildThreadMetadata(preview, canonicalUrl, imageUrl),
  );

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", CACHE_CONTROL);
  return res.status(200).send(html);
}
