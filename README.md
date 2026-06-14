# The Wired

A browser-first, anonymous Nostr social feed that uses proof-of-work to reduce spam.

## Overview
- Nostr relay subscriptions provide feeds, threads, polls, and notifications.
- Posts are anonymous and signed with ephemeral browser-generated keys.
- Proof-of-work is calculated in Web Workers before events are published.
- Media URLs and `imeta` tags are rendered inline. Other URLs and Nostr identifiers remain non-clickable plain text.

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

The production image builds the Vite app and serves `dist/` through Nginx with an SPA route fallback.

## Structure

- `src/nostr`: relay pool, subscription registry, domain subscriptions, and pure event processing.
- `src/app`: React providers and route table.
- `src/workers`: browser proof-of-work worker.
- `src/hooks`: domain data hooks (`useFeed`, `useThreadEvents`, etc.).
- `src/shared`: reusable UI, hooks, and PoW utilities.
- `src/features`: page-level feature modules (feed, thread, compose, notifications, settings).

## Backup

https://git.getwired.app/doot/TAO