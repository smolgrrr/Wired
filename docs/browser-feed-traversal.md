# Complete browser-feed traversal

Issue: [wired-admin #108](https://github.com/smolgrrr/wired-admin/issues/108)

## Rollout contract

`VITE_COMPLETE_FEED_TRAVERSAL_ENABLED` defaults to `false`. The enabled path
keeps the existing activity, bootstrap, missing-root, configured relay, NIP-10
hint, and age-window behavior while replacing the depth-two, 50-parent,
100-result reply traversal.

The complete path:

- streams unique activity, root, and reply events immediately;
- prepares every configured reply relay without delaying already-connected
  coverage;
- represents more than 50 known parent IDs as exact `#e` filters of at most 50
  IDs each, with the existing `since` age boundary and no result limit;
- accumulates each reply batch through EOSE before opening the next cumulative
  pass;
- opens a successor before closing its predecessor and promotes only after all
  covered relays send EOSE;
- retains same-second predecessor arrivals and deduplicates overlap before
  parsing and before the feed callback;
- accepts roots discovered by both live activity and the bootstrap snapshot;
- reports fixpoint completion only after root discovery, reply-relay
  preparation, and reply traversal complete;
- reports deadline, cancellation, connection failure, relay closure, or the
  60-pass safety bound as incomplete.

Incomplete traversal remains live so the visible feed can continue to improve.
The result is exposed as `useFeed().traversalCompletion.live` and
`.bootstrap` for bounded rollout instrumentation.

## Controlled evidence

All values below come from local relay transcripts through `subGlobalFeed` or
`subRepliesForRootIds`. They do not measure or estimate public-relay load.

Twenty isolated ordinary samples:

| Path | Exact callbacks | REQ | returned relay events | initial p95 | complete p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Rollback traversal | root + reply + nested | 6 | 6 | 10 ms | 34 ms |
| Complete traversal | root + reply + nested, once each | 8 | 8 | 5 ms | 26 ms |

The complete path remains below the approved 26/50 ms feed guardrail. Its
extra two requests establish a cumulative no-gap live fixpoint rather than
ending after the configured finite depth.

Twenty-sample complete bootstrap fixtures:

| Fixture | Exact IDs | REQ | request bytes | returned relay events | initial p95 | complete p95 | ceiling |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 60 direct + 60 children | 120/120 | 3 | 12,549 | 300 | 7 ms | 1,622 ms | 1,900 ms |
| 101 same-second replies | 101/101 | 2 | 7,093 | 202 | 8 ms | 1,125 ms | 1,500 ms |
| Live predecessor handoff | 2/2 | 3 | 570 | 5 | 7 ms | 37 ms | 60 ms |

The exact suite additionally covers five levels of legacy immediate-parent
tags, live global-feed roots, configured/hinted missing-root recovery, bootstrap
roots, age-window preservation, filters no wider than 50 parents, no result
limit, and peak-two overlapping live subscriptions.

Run `npm run test:feed-traversal-audit` to repeat the ordinary and large
20-sample gates serially. Timing assertions are audit-only to keep normal CI
deterministic.

## Stop and rollback

Stop rollout for any missing expected ID, incomplete outcome labeled complete,
configured or hinted coverage change, bootstrap/live ordering change, age
window change, duplicate callback, result limit, filter wider than 50 parents,
peak above two live reply subscriptions per relay, ordinary p95 above 26/50
ms, or approved large-fixture ceiling breach.

Set `VITE_COMPLETE_FEED_TRAVERSAL_ENABLED=false` to restore the prior reply
depth, parent, and result bounds without changing activity/root coverage,
bootstrap behavior, or relay hints. Keep the failing fixture and incomplete
status evidence enabled after rollback. Event publishing is unchanged and
retains the separate #105 evidence.
