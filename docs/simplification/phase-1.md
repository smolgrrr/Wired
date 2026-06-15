# Phase 1 Plan

**Status:** Complete  
**Completed:** 2026-06-14  
**Scope:** P0 (#1–7) + P1 #8–10  
**Est. time:** ~1 hour

> See [code-simplifier-review.md](../code-simplifier-review.md) for full context.

## Items in scope

### P0 — Quick wins

- [x] #1 Use `totalWork()` in `feed.ts`
- [x] #2 Merge dual subscriptions in `notifications.ts`
- [x] #3 Extract `normalizeStrippedContent()` → `src/utils/textCleanup.ts`
- [x] #4 Shared `HTTP_URL_PATTERN` → `src/utils/url.ts`
- [x] #5 `getNoteBodyText(event)` helper → `pollUtils.ts`
- [x] #6 `PowTransmitStatus` component → `src/shared/ui/PowTransmitStatus.tsx`
- [x] #7 `domainFromUrl` in `url.ts`

### P1 — Included in Phase 1

- [x] #8 `isRootNote(event)` helper → `noteEvents.ts`
- [x] #9 `composeSubHandle()` helper → `subscriptions/utils.ts`
- [x] #10 `useFilteredNoteSubscription()` factory → `shared/hooks/`

## Verification

```sh
bun run test    # 36 passed
bun run typecheck
bun run lint    # 0 errors (4 pre-existing warnings)
```

## New files

- `src/utils/textCleanup.ts`
- `src/utils/url.ts`
- `src/nostr/subscriptions/utils.ts`
- `src/shared/ui/PowTransmitStatus.tsx`
- `src/shared/hooks/useFilteredNoteSubscription.ts`

## Notes

- `PowTransmitStatus` coerces `difficulty` to string for `timeToGoEst` (callers pass string state).
- Notifications now returns a single registry handle instead of a composite id.
- `PostForm` mutation bug (#20) intentionally deferred to Phase 3.