# Notification history cursor decision

Issue: [wired-admin #112](https://github.com/smolgrrr/wired-admin/issues/112)

Decision: **NO-GO under the current NIP-01 relay contract**

Do not implement #113’s complete notification-history cursor. A client using
the current authored/mentioned filters cannot prove stable exhaustion without
either silently omitting reachable events or relying on non-standard relay
behavior. The current bounded first page remains unchanged.

This is a protocol/correctness decision, not a relay-efficiency claim. No
public relay was load-tested, and this document does not estimate public-relay
traffic, volume, latency, bandwidth, or cost.

## Required product contract

#112 asked for complete authored and mentioned history with:

- more than 25 authored and 50 tagged events;
- duplicates across filters, relays, and pages;
- stable cursors when many events share a timestamp;
- explicit exhaustion;
- delayed or missing EOSE handling;
- unchanged configured relay coverage; and
- no regression from the controlled first-page p95 of 39 ms.

The no-UX-tradeoff rule forbids treating an arbitrary result limit, time
window, first relay, or incomplete terminal outcome as proof of completeness.

## Blocking NIP-01 facts

The pinned NIP-01 revision used by the relay-efficiency audit defines:

- `since` and `until` as inclusive Unix timestamps in seconds;
- `limit` as guidance for the maximum initial stored-event response;
- fewer returned events as acceptable;
- EOSE as the end of the relay's stored response for that subscription; and
- `ids`, `authors`, `#e`, and `#p` filter values as exact 64-character
  lowercase hexadecimal values.

Source: [NIP-01 at the audit-pinned commit](https://github.com/nostr-protocol/nips/blob/8f8444d05a8842c40211ded5d10af3521541f865/01.md#communication-between-clients-and-relays).

NIP-01 supplies no exclusive `(created_at, id)` cursor and does not permit
event-ID prefix filters at this pinned revision.

## Counterexample

Assume one covered relay stores 26 matching authored events at second `T` and
the authored query requests limit 25.

1. The relay may return 25 events and EOSE.
2. Advancing to `until: T - 1` loses the 26th event.
3. Repeating inclusive `until: T` may return the same ordered 25 forever.
4. Querying exact second `T` has the same limit/default-limit ambiguity.
5. The client does not know the omitted event ID, so it cannot request it
   exactly.

The same failure exists for 51 tagged events at one second. Splitting by local
pubkey can reduce a multi-key set but cannot solve more-than-limit events for
one key. Recursively bisecting time cannot split one second.

A page shorter than the requested limit also cannot prove exhaustion because
the protocol explicitly allows fewer events. Missing EOSE, CLOSED,
connect-failed, timeout, and cancellation make the result visibly incomplete
and cannot advance a completeness cursor.

## Prototype verdict

The throwaway state-machine branch
[`prototype/notification-history-cursor`](https://github.com/smolgrrr/Wired/tree/prototype/notification-history-cursor/src/features/notifications)
validated independent stream state, global ID deduplication, incomplete retry,
and cursor non-advancement. It then falsified its own proposed same-second
escape hatch: adaptive event-ID prefixes are not legal under the pinned
NIP-01 exact-value rule.

The prototype remains off `main` as a primary source for the rejected design.
Its prefix partition must not be copied into production.

## Rejected implementations

- **Advance to `T - 1`:** can omit unseen events at `T`.
- **Repeat inclusive `until: T`:** has no stable progress key and may loop.
- **Omit or enlarge `limit`:** relays may apply defaults or constraints, and
  the client still cannot prove exhaustion.
- **Use event-ID prefixes:** non-standard at the pinned NIP-01 revision, so it
  cannot preserve configured-relay coverage.
- **Use arbitrary `since` or “recent only”:** redefines complete history and
  silently loses older activity.
- **Treat short pages or first EOSE as exhausted:** contradicts the pinned
  protocol and the audit rubric.
- **Infinite scroll:** changes triggering/UI but does not create a valid
  cursor.
- **Read only from a new server index or one relay:** changes coverage and
  failure ownership; no equivalent complete index currently exists.

## Timing decision

The current first page keeps its existing controlled p95 target of `<=39 ms`.
There is no honest older-page completion target because there is no approved
complete older-page algorithm. Assigning a timing number to an incomplete
cursor would satisfy the form of the ticket while violating its UX contract.

The final unchanged 20-sample local comparator completed at p50/p95 `29/33
ms`, returned the exact 2/2 displayed IDs, and retained 4 REQ/EOSE/CLOSE over
two controlled relays. This is local fixture evidence only.

Delayed/no-EOSE behavior remains explicit finite-query settlement in the
existing first page. It is not evidence of historical exhaustion.

## Production and tracker consequences

- Make no production code, filter, cursor, UI, relay-selection, or persistence
  change for #112.
- Close #112 with this no-go decision.
- Do not start #113 while its “approved cursor/history contract” gate is
  unsatisfied; close it as blocked by the no-go rather than shipping partial
  pagination.
- Keep the current bounded first page and its known completeness limitation
  visible in the audit record.
- Event publishing, threads, feeds, replies, profile metadata, and wired-admin
  snapshot behavior remain unchanged.

## Reopen conditions

Reopen cursor design only when one of these can be demonstrated across every
configured notification relay without narrowing coverage:

1. a standardized, exclusive stable cursor that includes a secondary key;
2. a standardized complete reconciliation/range primitive supported by all
   configured targets;
3. a coverage-equivalent replicated index with tested ingestion completeness,
   freshness, failure recovery, and rollback; or
4. an explicit product decision to replace “complete history” with a bounded
   contract, which would be a new UX specification rather than relay-efficiency
   work.

Any reopened design must repeat the >25/>50, same-second, duplicate,
delayed/no-EOSE, exact-union, coverage, cleanup, first-page p95, and explicit
older-page timing evidence before implementation.
