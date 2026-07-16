import { ImageResponse } from "@vercel/og";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolveThreadPreview } from "../lib/threadPreview.js";
import { waitUntil } from "@vercel/functions";
import { createPreviewResolutionObserver } from "../lib/relayWorkflowPreviewCorrelation.js";

export const config = { runtime: "nodejs" };

function replyLabel(count: number): string {
  return `${count} ${count === 1 ? "reply" : "replies"}`;
}

export function renderThreadCard(
  preview: Awaited<ReturnType<typeof resolveThreadPreview>>,
) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 82px",
          color: "#e8e8ec",
          background: "#050508",
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div
            style={{
              display: "flex",
              width: "18px",
              height: "18px",
              borderRadius: "50%",
              background: "#5eead4",
              boxShadow: "0 0 30px rgba(94,234,212,.55)",
            }}
          />
          <div style={{ display: "flex", fontSize: "25px", color: "#8a8a96" }}>
            WIRED / ANONYMOUS SIGNAL
          </div>
        </div>

        <div
          style={{
            display: "flex",
            maxWidth: "1040px",
            fontSize: preview ? "50px" : "58px",
            lineHeight: 1.25,
            letterSpacing: "-0.025em",
          }}
        >
          {preview?.excerpt ?? "Say what you cannot say on main."}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255,255,255,.12)",
            paddingTop: "28px",
            fontSize: "25px",
          }}
        >
          <div style={{ display: "flex", color: "#5eead4" }}>
            {preview ? replyLabel(preview.replyCount) : "the anonymous backchannel"}
          </div>
          <div style={{ display: "flex", color: "#8a8a96" }}>wiredsignal.online</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function requestOrigin(req: VercelRequest): string {
  const protocol = first(req.headers["x-forwarded-proto"]) || "https";
  const host = first(req.headers["x-forwarded-host"]) || first(req.headers.host);
  return `${protocol}://${host}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("method not allowed");
  }

  const ref = first(req.query.id) || undefined;
  const preview = await resolveThreadPreview(ref, {
    origin: requestOrigin(req),
    onResolution: createPreviewResolutionObserver({
      endpoint: "thread-card",
      defer: waitUntil,
    }),
  });
  const image = renderThreadCard(preview);
  const body = Buffer.from(await image.arrayBuffer());

  image.headers.forEach((value, name) => res.setHeader(name, value));
  return res.status(image.status).send(body);
}
