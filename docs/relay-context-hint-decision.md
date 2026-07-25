# Browser referenced-context hint decision

Date: 2026-07-25

Decision: **GO** for dynamic event-tag relay hints behind
`VITE_DYNAMIC_CONTEXT_HINTS_ENABLED`.

This is controlled client-observed evidence from local relay transcript
fixtures. It does not measure or estimate public-relay load, bandwidth, or
cost.

## Coverage finding

The browser thread view retained referenced event IDs from the displayed
event's `e` tags but discarded their relay-hint fields. A controlled configured
relay miss therefore returned no referenced context even when the exact event
was available at its advertised hint.

The implemented path:

- starts the unchanged exact-ID configured-relay query immediately;
- prepares normalized, non-configured hints concurrently;
- queries a successfully connected hint only after configured coverage
  completes and only for IDs still missing;
- rejects unrelated and duplicate event deliveries;
- does not retry a failed hint preparation;
- cancels preparation and any owned finite query on navigation.

## Controlled measurements

Twenty isolated samples were run with one configured relay and one advertised
hint. Both requests used the exact filter
`{ids:[requiredId], kinds:[1], limit:1}`.

| Fixture | Result | Initial p95 | Complete p95 |
| --- | --- | ---: | ---: |
| `origin/main` configured-only comparator | configured reachable event preserved; exact two-ID filter | n/a | 19 ms |
| branch configured miss → hinted hit | 1 discovered, connected, and queried hint; 1 required context event resolved | 6 ms | 7 ms |

The hinted-hit evidence recorded one 115-byte request per relay, one returned
event, matching EOSE/CLOSE ownership, no retry, and no leaked subscription.
The existing configured-only delayed fixture remained behaviorally identical;
observed p95 across branch audit runs was 19–20 ms, reflecting its intentional
10 ms delayed response and local scheduler jitter. The ticket's ≤19 ms gate is
applied to the new hint path, which passed.

Publishing remains a separate workflow: all 5 publish transcript tests passed,
partial acknowledgement completed at 8 ms p95, and evidence
disabled/enabled/export-scheduled/full/failing variants completed at 8–9 ms
p95.

## Rollout and rollback

Roll out with `VITE_DYNAMIC_CONTEXT_HINTS_ENABLED=true`. Stop on missing or
duplicate context, configured-query delay, unexpected retries, cleanup
failures, or hinted-path p95 above 19 ms.

Set `VITE_DYNAMIC_CONTEXT_HINTS_ENABLED=false` to return immediately to
configured-only referenced-context coverage. This switch does not change
configured filters, replies, feed behavior, metadata queries, or publishing.
