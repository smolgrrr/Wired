# Browser profile request joining

Issue: [wired-admin #111](https://github.com/smolgrrr/wired-admin/issues/111)

## Rollout contract

`VITE_PROFILE_REQUEST_JOIN_ENABLED` defaults to `false`. When enabled, the
profile cache owner tracks the pubkeys covered by each finite profile request
until aggregate completion. A later consumer of a covered pubkey joins that
request instead of starting a duplicate. Distinct pubkeys still start without
waiting for the live request.

The enabled path preserves:

- every configured profile relay and the exact kind-0 author filter;
- newest-`created_at` metadata selection across relay results;
- immediate positive-cache reads;
- retries by a later consumer after a completed miss; and
- request ownership when the first React consumer unmounts.

Aggregate settled, deadline, terminal, and cancelled completion all release
in-flight ownership. No missing pubkey is written to the positive profile
cache, and no negative cache is introduced.

## Controlled evidence

Evidence is client-observed from local fixtures only. It does not measure or
estimate public-relay traffic, bandwidth, cost, or ordinary duplicate
frequency.

Run:

```sh
npm run test:profile-request-audit
```

The final paired 20-sample cache-owner fixture reduced every controlled
staggered duplicate from two profile query calls to one while both flag-off
and flag-on consumers selected the same newest metadata. Enabled completion
p95 was 1.8 ms, below the 34 ms cache-owner guardrail. The unchanged two-relay
transport comparator retained
two exact REQ frames, four returned metadata events, newest metadata, and full
finite cleanup. Its local timing remains environment-sensitive; compare it as
a paired transport baseline rather than presenting it as public-relay load.

Targeted hook, rollback, finite-query, configuration, transcript, and
typechecking fixtures cover same-task, staggered, older/newer, missing,
terminal/cancelled, unmount, distinct-pubkey, positive-cache, and
retry-after-completion behavior.

## Staging and rollback

Enable `VITE_PROFILE_REQUEST_JOIN_ENABLED=true` in staging first. Compare the
bounded `wired.browser.profiles` query completion evidence and visible profile
selection with the flag-off baseline. Stop rollout for any missing or stale
metadata, relay/filter change, distinct-pubkey delay, retry failure after a
miss, cleanup regression, or paired completion-timing regression.

Set `VITE_PROFILE_REQUEST_JOIN_ENABLED=false` for immediate rollback. This
restores the legacy staggered second-query behavior without changing relay
coverage, filters, caches, notifications, feeds, threads, or event publishing.
