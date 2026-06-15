# Phase 2 Plan

**Status:** Complete  
**Completed:** 2026-06-14  
**Scope:** P1 #11–14 + P2 #15, #18, #19  
**Est. time:** ~2–3 hours

> See [code-simplifier-review.md](../code-simplifier-review.md) for full context.

## Items in scope

### P1

- [x] #11 Wire `closeAll()` via `closeAllSubscriptions()` in provider unmount
- [x] #12 `PostCard` variant cleanup → `role: "feed" | "threadOp" | "threadContext"`
- [x] #13 `PageShell` / `ContentColumn` layout
- [x] #14 Move `uniqBy` to `collections.ts`

### P2 — Nostr layer

- [x] #15 Collapse subscription DI wrappers
- [x] #16 _(deferred to Phase 3 — content pipeline)_
- [x] #17 _(deferred to Phase 3 — thread view model)_
- [x] #18 Merge `feed.ts` into `processEvents.ts`
- [x] #19 Fold `poll.ts` + `notes-once.ts` into `index.ts`

## Verification

```sh
bun run test    # 36 passed
bun run typecheck
bun run lint    # 0 errors (4 pre-existing warnings)
```

## New files

- `src/shared/utils/collections.ts`
- `src/shared/ui/PageShell.tsx`

## Deleted files

- `src/nostr/processing/feed.ts`
- `src/nostr/subscriptions/poll.ts`
- `src/nostr/subscriptions/notes-once.ts`
- `src/utils/otherUtils.ts`

## Notes

- Subscription modules call `getRegistry()` internally; `index.ts` re-exports domain modules and inlines thin `subPoll` / `subNotesOnce`.
- `emptySubHandle()` shared for empty-pubkey / empty-id subscription no-ops.
- `PostCard` derived state moved from `useEffect` to `useMemo`; only `ThreadPage` uses `role` prop.
- `PostForm` mutation bug (#20) still deferred to Phase 3.