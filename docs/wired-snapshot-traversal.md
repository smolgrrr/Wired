# Complete Wired snapshot traversal

Issue: [wired-admin #109](https://github.com/smolgrrr/wired-admin/issues/109)

## Rollout contract

`COMPLETE_WIRED_SNAPSHOT_TRAVERSAL_ENABLED` defaults to `false`. The enabled
server path preserves activity, root resolution, configured and event-hinted
coverage, reference retrieval, newest-profile selection, and snapshot scoring
while replacing reply depth, parent, and result caps.

Both feed-root and referenced-event reply phases:

- query the cumulative known parent set in sequential exact `#e` chunks of at
  most 50 IDs;
- retain the existing snapshot age boundary and use no result limit;
- accumulate unique events and relay hints through every covered relay's EOSE;
- repeat until a complete cumulative pass discovers no new parent ID;
- keep at most one finite reply subscription open per relay;
- bound each traversal phase by its deadline and a 60-pass safety limit;
- report deadline, cancellation, connection failure, relay closure, and the
  pass bound as explicit incomplete outcomes.

`fetchFeedSnapshot` exposes activity, root-resolution, reference, profile,
feed-reply, and reference-reply completion targets through
`onTraversalComplete`. Any non-EOSE terminal target or incomplete traversal
throws `IncompleteFeedSnapshotTraversalError`; the cache service therefore
never writes the partial candidate and continues serving the prior snapshot.

## Controlled evidence

All evidence comes from local relay transcript fixtures. It does not measure
or estimate public-relay traffic.

The exact suite proves:

- flag-off and flag-on snapshots have identical events, processed threads,
  relay hints, profiles, and scoring for the approved ordinary fixture;
- 60 direct replies plus 60 children resolve as exactly 120 replies;
- 101 same-second replies resolve without a result cap;
- referenced context and newest metadata remain exact across configured and
  hinted coverage;
- every reply filter contains at most 50 parent IDs, has no result limit, and
  executes sequentially with a peak of one subscription per relay;
- a relay close before EOSE is incomplete and leaves the prior atomic cache
  object unchanged;
- activity closure and profile cancellation are explicit incomplete phases and
  likewise retain the prior cache.

Run `npm run test:wired-snapshot-traversal-audit` for the serial 20-sample
wide, limit, and incomplete-cache-handoff gates. The approved completion p95
ceilings are 2,100 ms, 1,550 ms, and 60 ms respectively.

| Fixture | Exact IDs | REQ | request bytes | returned relay events | complete p95 | ceiling |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 60 direct + 60 children | 120/120 | 7 | 12,651 | 301 | 1,187 ms | 2,100 ms |
| 101 same-second replies | 101/101 | 5 | 7,181 | 203 | 1,147 ms | 1,550 ms |
| Incomplete-cache handoff | prior snapshot retained | 2 | 182 | 1 | 13 ms | 60 ms |

## Stop and rollback

Stop rollout on any expected-ID miss, reference/profile difference, configured
or hinted coverage loss, incomplete outcome labeled complete, partial cache
write, filter wider than 50 parents, result limit, peak above one finite reply
subscription per relay, or controlled ceiling breach.

Set `COMPLETE_WIRED_SNAPSHOT_TRAVERSAL_ENABLED=false` to restore the prior
depth/result-bounded refresh implementation. Do not delete the last complete
cache during rollback; retain the failing exact fixture and incomplete status
evidence. Event publishing is unchanged and retains the separate #105
evidence.
