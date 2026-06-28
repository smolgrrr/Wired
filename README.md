# The Wired

A browser-first, anonymous Nostr social feed that uses proof-of-work to reduce spam.

## Overview
- Nostr relay subscriptions provide feeds, threads, polls, and notifications.
- Posts are anonymous and signed with ephemeral browser-generated keys.
- Proof-of-work is calculated in Web Workers before events are published.
- Media URLs and `imeta` tags render as inline attachments below text. Other URLs become link preview cards (stripped from body). Nostr identifiers linkify inline (note/nevent open in-app; npub/nprofile/naddr open via `nostr:` href).

## Development

React, TypeScript, Vite, Tailwind CSS, and Bun.

```sh
bun install
bun run dev
```

Verification commands:

```sh
bun run typecheck
bun run lint
bun run test
bun run build
```

## Deployment

Deploy on [Vercel](https://vercel.com). Connect the Git repo in the Vercel dashboard (Vite is auto-detected; build command: `bun run build`, output: `dist`).

[`vercel.json`](vercel.json) includes SPA rewrites so client-side routes work on refresh.

Optional feed snapshot bootstrap:

- Set `VITE_FEED_SNAPSHOT_URL` to a public JSON snapshot URL, such as an Umbrel service exposed through Cloudflare Tunnel.
- The client tries that snapshot first, falls back to `/api/feed/bootstrap`, then falls back to live Nostr relay subscriptions if both bootstrap sources fail.
- The snapshot response should match `/api/feed/bootstrap`: `{ "fetchedAt": number, "processedEvents": [], "profiles": {} }`.

Optional relay configuration:

- Set `VITE_POW_RELAYS` to a comma-separated list of public PoW relay WebSocket URLs, for example `wss://relay.wiredsignal.online`.
- Set `VITE_ENRICHMENT_RELAYS` to a comma-separated list of read/enrichment relay WebSocket URLs if the defaults should be replaced.
- If unset, the client uses the built-in relay defaults.

Optional moderation filtering:

- Set `VITE_MODERATION_MANIFEST_URL` to the public manifest endpoint exposed by the Wired relay app, for example `https://relay.wiredsignal.online/api/moderation/manifest`.
- The web client only consumes the manifest for client-side filtering. Moderation management and admin actions stay in the local Umbrel relay app and are not part of this Vercel deployment.
- If the manifest URL is unset or unavailable, moderation filtering fails open and the feed continues to use snapshots/live relays.

Run a durable local snapshot origin:

```sh
npm run snapshot:serve
```

The server listens on `0.0.0.0:5192` by default, serves `/api/feed/bootstrap`, persists its latest snapshot to `.cache/feed-bootstrap.json`, and refreshes every 5 minutes. Useful environment variables:

- `FEED_SNAPSHOT_PORT`: HTTP port, default `5192`
- `FEED_SNAPSHOT_HOST`: bind host, default `0.0.0.0`
- `FEED_SNAPSHOT_REFRESH_SECONDS`: refresh interval, default `300`
- `FEED_SNAPSHOT_CACHE_FILE`: persisted cache path, default `.cache/feed-bootstrap.json`
- `CRON_SECRET`: optional bearer token for `/api/cron/refresh-feed`

Local production check:

```sh
bun run build
bun run preview
```

## Structure

- `src/nostr`: relay pool, subscription registry, domain subscriptions, and pure event processing.
- `src/app`: React providers and route table.
- `src/workers`: browser proof-of-work worker.
- `src/hooks`: domain data hooks (`useFeed`, `useThreadEvents`, etc.).
- `src/shared`: reusable UI, hooks, and PoW utilities.
- `src/features`: page-level feature modules (feed, thread, compose, notifications, settings).

## Backup

https://git.getwired.app/doot/TAO
