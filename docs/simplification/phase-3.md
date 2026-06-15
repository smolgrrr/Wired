# Phase 3 Plan

**Status:** Complete  
**Completed:** 2026-06-14  
**Scope:** P2 #16–17, #20–24  
**Est. time:** ~3–4 hours

> See [code-simplifier-review.md](../code-simplifier-review.md) for full context.

## Items in scope

- [x] #16 Simplify `parseContent` attachment building
- [x] #17 Shared `toProcessedEvents()` for thread
- [x] #20 `PostForm` event-builder reducer + mutation fix
- [x] #21 `useThreadViewModel(hexID)`
- [x] #22 Fix `PollResponder` layer violation (moved transmit hooks to `shared/hooks/`)
- [x] #23 Align `QuotePreview` with `TextContent`
- [x] #24 Slim `ParsedContent` type

## Verification

```sh
bun run test    # 36 passed
bun run typecheck
bun run lint    # 0 errors (3 pre-existing warnings)
```

## New files

- `src/features/compose/buildUnsignedEvent.ts`
- `src/hooks/useThreadViewModel.ts`
- `src/shared/hooks/useSubmitForm.ts`
- `src/shared/hooks/usePowMining.ts`

## Deleted files

- `src/features/compose/useSubmit.ts`
- `src/features/compose/usePowMining.ts`

## Notes

- `buildAttachmentsInOrder` uses one content URL walk; classifies via pre-built media/link maps (no re-parse of imeta or bare media).
- `ParsedContent` is now `{ comment, attachments }`; tests assert attachments only.
- `processFeedEvents` and thread replies share `buildRepliesByParent` / `toProcessedEvents`.
- `PostForm` uses `useMemo` + `buildUnsignedEvent`; poll mode preserves ref tags.
- `useThreadViewModel` uses `useNostrSubscription` for prev-mention fetch.
- `MediaAttachment` gained optional `compact` prop for quote previews.