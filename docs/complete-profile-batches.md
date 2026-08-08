# Complete browser profile batches

Issue: [wired-admin #114](https://github.com/smolgrrr/wired-admin/issues/114)

## Rollout contract

`VITE_COMPLETE_PROFILE_BATCHES_ENABLED` defaults to `false`. When enabled,
`subProfilesOnce` deduplicates requested pubkeys in insertion order, splits
them into chunks of at most 250 authors, and starts every chunk through the
existing finite profile-query owner.

All chunks keep the same configured profile relay coverage and exact kind-0
filter. Chunk queries start together so the first chunk and first visible
metadata are not delayed. The batch reports aggregate completion only after
every chunk settles. Any cancelled chunk makes the aggregate cancelled; any
deadline without cancellation makes it deadline; otherwise it is settled.

The existing profile cache still selects the greatest `created_at` metadata
event across covered relays. Missing pubkeys are not cached, so later
consumers remain retryable. With in-flight request joining independently
enabled, ownership covers every deduplicated pubkey until this aggregate chunk
completion.

## Controlled evidence

Evidence is client-observed from local fixtures only. It does not measure or
estimate public-relay load, bandwidth, cost, ordinary batch size, or profile
availability.

Run:

```sh
npm run test:profile-batch-audit
```

The final 20-sample fixture requested 252 inputs representing 251 unique
authors across two local relays. Every run produced exact 250+1 chunks per
relay: 4 REQ/EOSE/CLOSE, 502 competing metadata deliveries, all 251 profiles,
and newest metadata for all 251 authors.

- first metadata p50/p95: `12/21 ms` against the `<=34 ms` guardrail;
- full batch completion p50/p95: `1,819/2,156 ms` against the measured
  `<=2,500 ms` controlled ceiling;
- request bytes in the final sample: `16,804`, `119`, `16,804`, `119`;
- peak finite profile chunks: `2` per relay for the 251-author fixture; and
- no result limit below its chunk author count.

The single-query and rollback fixtures cover exact filters, pubkey
deduplication, aggregate completion, mixed terminal outcomes, cancellation,
and restoration of the legacy capped query.

## Staging and rollback

Enable `VITE_COMPLETE_PROFILE_BATCHES_ENABLED=true` in staging first. Compare
requested/unique author count, chunk count, relay targets, exact selected
profiles, first result, aggregate completion, terminal states, and peak finite
subscriptions with the flag-off fixture.

Stop rollout for any requested profile omission, stale profile selection,
changed relay coverage, chunk above 250 authors, premature aggregate
completion, non-retryable miss, first-content p95 above 34 ms, full 251-author
p95 above 2,500 ms, or leaked finite handle.

Set `VITE_COMPLETE_PROFILE_BATCHES_ENABLED=false` for immediate rollback to
the prior single profile filter capped at 250 results. Keep failing >250
fixtures and content-free evidence after rollback. Threads, feeds,
notifications, quotes, and event publishing are unchanged.
