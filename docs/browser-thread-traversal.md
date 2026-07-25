# Complete browser-thread traversal

Issue: [wired-admin #107](https://github.com/smolgrrr/wired-admin/issues/107)

## Rollout contract

`VITE_COMPLETE_THREAD_TRAVERSAL_ENABLED` defaults to `false`. When enabled,
browser threads retain the existing configured and event-hinted relay coverage
while replacing the prior close-then-open, 50-parent, 100-result traversal.

The enabled path:

- opens live reply coverage before the finite root query;
- normalizes and deduplicates event IDs before the client callback;
- represents more than 50 parents as multiple exact `#e` filters, each at most
  50 IDs, in one subscription per relay;
- has no client reply-result limit;
- opens a successor before closing its predecessor and promotes only after
  all covered relays send EOSE;
- repeats until an EOSE pass discovers no new parent IDs;
- keeps peak live reply subscriptions at two per relay;
- reports completion only after both root and reply phases complete;
- reports deadline, cancellation, connection failure, relay closure, or the
  60-pass safety bound as incomplete.

An incomplete result never claims a fixpoint. Live coverage remains active
after a deadline or pass-bound status so a slow conversation can continue to
improve rather than trading completeness for the bound.

## Controlled evidence

The public `subNote` seam is driven by local relay transcripts; no public relay
load is measured or estimated.

Twenty isolated ordinary-thread samples produced:

| Path | Exact client callbacks | REQ | returned relay events | initial p95 | complete p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Rollback traversal | root + reply + nested | 8 | 12 | 12 ms | 35 ms |
| Complete traversal | root + reply + nested, once each | 8 | 12 | 6 ms | 36 ms |

The complete path met the approved 28/48 ms ordinary initial/complete ceiling.
Its final representative transcript used 1,258 request bytes and peaked at two
live reply subscriptions per relay.

Twenty-sample controlled large fixtures produced:

| Fixture | Exact IDs | REQ | request bytes | returned relay events | initial p95 | complete p95 | ceiling |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 60 direct + 60 children | 120/120 | 4 | 12,555 | 301 | 7 ms | 1,670 ms | 1,900 ms |
| 101 same-second replies | 101/101 | 3 | 7,137 | 203 | 7 ms | 1,117 ms | 1,500 ms |
| Live predecessor handoff | 2/2 | 4 | 633 | 6 | 6 ms | 49 ms | 60 ms |

The separate exact suite also covers five levels of legacy immediate-parent
`e` tags and relay closure before EOSE. All exact ID sets match. Every reply
filter has at most 50 parent IDs and no result limit. The handoff fixture
delivers two distinct replies through exactly two client callbacks despite
relay overlap duplicates.

Run `npm run test:thread-traversal-audit` to repeat both 20-sample gates
serially. The assertions are audit-only so wall-clock ceilings do not make the
ordinary test suite flaky.

## Stop and rollback

`useThreadEvents` and `useThreadViewModel` expose the bounded
`traversalCompletion` result for rollout instrumentation without recording
event content or claiming public-relay load. Stop rollout for any missing
expected ID, incomplete outcome labeled complete, configured or hinted
coverage change, duplicate client callback, result limit, filter wider than 50
parents, peak above two live reply subscriptions per relay, ordinary p95 above
28/48 ms, or approved large-fixture ceiling breach.

Set `VITE_COMPLETE_THREAD_TRAVERSAL_ENABLED=false` to restore the prior
traversal without changing relay coverage or the finite root-query seam. Keep
the exact fixtures and incomplete status evidence enabled after rollback.
Event publishing is unchanged and retains the separate #105 evidence.
