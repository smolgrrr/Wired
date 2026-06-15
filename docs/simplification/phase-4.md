# Phase 4 Plan

**Status:** Complete  
**Completed:** 2026-06-14  
**Scope:** P3 #25–30  
**Est. time:** ~3–4 hours

> See [code-simplifier-review.md](../code-simplifier-review.md) for full context.

## Items in scope

- [x] #25 Shared `normalizeUrl` + `LinkMetadata` across `src/` and `api/`
- [x] #26 Consolidate `src/utils` + `src/shared/utils` → `src/shared/lib/`
- [x] #27 `ThreadPage` → `useNostrSubscription` for prev-mentions _(done in Phase 3)_
- [x] #28 Dedupe at ingest in `useNostrSubscription`
- [x] #29 Rename `cardUtils.ts` → `timeFormat.ts`
- [x] #30 Barrel export policy for `shared/ui`

## Verification

```sh
bun run test    # 39 passed
bun run typecheck
bun run build
```

## New files

- `lib/link.ts` — cross-boundary `normalizeUrl` + `LinkMetadata` (`@link` alias)
- `lib/link.test.ts`
- `src/shared/lib/*` — all client utilities (`@lib` alias)

## Deleted directories

- `src/utils/`
- `src/shared/utils/`

## Path aliases

| Alias | Path | Purpose |
|-------|------|---------|
| `@link/*` | `lib/*` | Shared by Vite client, Vercel API, dev unfurl middleware |
| `@lib/*` | `src/shared/lib/*` | Content pipeline, nostr helpers, formatting |

## Notes

- `api/lib/unfurl.ts` imports from `lib/link.ts`; re-exports `normalizeUrl` for `api/unfurl.ts`.
- `mediaUtils.ts` imports `normalizeUrl` from `@link/link` (single source of truth).
- `useLinkMetadata` imports `LinkMetadata` type from `@link/link`.
- `useNostrSubscription` dedupes by `event.id` on ingest.
- `shared/ui/index.ts` documents direct-import convention; expanded exports for PostCard, PageShell, PowTransmitStatus, Placeholder. Feature code unchanged.
- Downstream `uniqBy` calls retained (no behavior change).