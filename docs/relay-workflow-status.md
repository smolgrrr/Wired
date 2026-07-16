# Relay workflow status operations

Relay workflow status is bounded client-observed evidence. It does not measure public-relay load and must not be interpreted as relay receipt, bandwidth, or cost.

## Data boundary

The v1 ingest accepts only fixed aggregate owner/operation/outcome buckets and optional 96-bit daily preview-correlation tokens. Event content, event IDs, pubkeys, relay URLs, secrets, and arbitrary labels fail validation. Envelopes are limited to 32 KiB and 100 aggregates, or one correlation observation.

Accepted envelopes are immutable JSON objects in a **private** Vercel Blob store under `relay-workflow-status/v1/data/`. A conditional control object enforces these limits across instances before each append:

- 60 envelopes per source per minute;
- 1,000 rows per source per UTC day;
- a 1,000-token reservoir sample per UTC day. New tokens are sampled before storage once full, and sampled-out observations increment a separate bounded preview-overflow counter.

The daily `/api/cron/purge-workflow-status` job deletes data and control objects older than 14 days. There is no public read/list API.

## Deployment configuration

Create a private Vercel Blob store attached to the Wired project, then configure:

```text
BLOB_READ_WRITE_TOKEN=managed-by-vercel
CRON_SECRET=managed-by-vercel
RELAY_WORKFLOW_STATUS_INGEST_ENABLED=true
WORKFLOW_STATUS_ALLOWED_ORIGIN=https://wiredsignal.online
WORKFLOW_STATUS_ADMIN_TOKEN=<independent high-entropy operator token>
WORKFLOW_STATUS_PREVIEW_HMAC_SECRET=<at least 32 random bytes>
RELAY_WORKFLOW_PREVIEW_CORRELATION_ENABLED=true
VITE_RELAY_WORKFLOW_STATUS_ENABLED=true
VITE_RELAY_WORKFLOW_STATUS_PERCENT=10
```

`WORKFLOW_STATUS_PREVIEW_HMAC_SECRET` stays server-side. Every instance derives the same UTC-daily key, emits only a 96-bit HMAC token, and never stores either the daily key or event ID. Rotate the deployment secret at least quarterly; rotation intentionally breaks correlation across the boundary.

Browser writes require an exact `Origin` match with `WORKFLOW_STATUS_ALLOWED_ORIGIN`. The wired-admin source requires `WORKFLOW_STATUS_ADMIN_TOKEN`. The Blob token is available only to the Wired deployment. The current named deployment owner and wired-admin operator is the GitHub/Vercel account `smolgrrr` (`doot`); store browsing/deletion is limited to that account through project-scoped Vercel access until ownership is explicitly reassigned.

## Rollout and rollback

1. Leave browser export and ingest disabled while local aggregation is verified.
2. Enable ingest, then set browser export to 10% for one deployment window.
3. Verify accepted results and workflow p95 are unchanged, then set the percentage to 100.

Disable browser export with `VITE_RELAY_WORKFLOW_STATUS_ENABLED=false` or percentage `0`. Disable preview correlation with `RELAY_WORKFLOW_PREVIEW_CORRELATION_ENABLED=false`. Disable ingest independently with `RELAY_WORKFLOW_STATUS_INGEST_ENABLED=false`. Any switch leaves relay/query/publish operations unchanged; exporter, network, Blob, or purge failures drop evidence only.

To delete a run, disable its exporter first, then delete the private objects under `relay-workflow-status/v1/` using the Vercel Blob dashboard or CLI. Re-enable only after access, caps, and the purge cron are confirmed.
