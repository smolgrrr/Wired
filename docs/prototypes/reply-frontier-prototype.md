# PROTOTYPE — complete reply-frontier traversal

Issue: [wired-admin #106](https://github.com/smolgrrr/wired-admin/issues/106)

This is throwaway prototype evidence. It must not be merged as the production
implementation.

Prototype branches: [Wired](https://github.com/smolgrrr/Wired/tree/codex/reply-frontier-prototype)
and [wired-admin](https://github.com/smolgrrr/wired-admin/tree/codex/reply-frontier-prototype).

## Question

Which traversal interface can resolve depth greater than two, more than 50
parents, more than 100 same-second results, and arrivals during a browser live
handoff without silently claiming completeness?

The prototype compares:

1. **Frontier once:** query each newly discovered parent once.
2. **Cumulative fixpoint:** query every known parent on each pass until a full
   pass discovers no new event IDs.
3. **Overlapping live replacement:** open the successor live filter before
   closing its predecessor; promote it after EOSE, and repeat when the handoff
   discovered another parent.

All finite requests use exact `#e` parent chunks of at most 50, kind 1, and no
client result `limit`. Measurements are controlled local transcript evidence;
they do not measure or estimate public-relay load.

Run the interactive state model:

```sh
npm run prototype:reply-frontier
```

Run the public-seam transcript matrix:

```sh
npm run prototype:reply-frontier:audit
```

## Result

**NO-GO: frontier once.** It resolved every static deep/wide/limit fixture with
zero repeated deliveries, but both Wired public finite-query seams and
wired-admin's finite session resolved only 1/2 events when a same-second reply
arrived for a parent whose frontier query had already completed.

**GO: cumulative fixpoint for finite closure, combined with overlapping live
replacement in browser runtimes.** Cumulative fixpoint resolved 2/2 in the same
handoff fixture. The real browser registry seam retained both events while
replacing live coverage, with three REQs and peak two subscriptions.

This GO authorizes the interfaces and guardrails below for implementation
tickets #107–#110. It does not authorize merging the prototype modules.

## Controlled 20-sample evidence

Numbers are per relay. REQ byte totals are representative final-sample totals
and vary slightly with generated subscription IDs. Timing columns are
initial-result p95 / complete p95.

| Runtime / candidate | 5-deep: REQ / bytes / repeats / initial / complete |
| --- | --- |
| Browser frontier once | 6 / 630 / 0 / 4 / 24 ms |
| Browser cumulative | 6 / 1,635 / 15 / 6 / 110 ms |
| Wired server frontier once | 6 / 630 / 0 / 4 / 26 ms |
| Wired server cumulative | 6 / 1,635 / 15 / 4 / 90 ms |
| wired-admin frontier once | 6 / 618 / 0 / 7 / 28 ms |
| wired-admin cumulative | 6 / 1,623 / 15 / 5 / 78 ms |

| Runtime / candidate | 120-wide: REQ / bytes / repeats / initial / complete | 101-result: REQ / bytes / repeats / initial / complete | handoff: exact / REQ / bytes / repeats / initial / complete |
| --- | --- | --- | --- |
| Browser frontier once | 5 / 8,297 / 0 / 7 / 473 ms | 4 / 6,986 / 0 / 6 / 383 ms | 1/2 / 2 / 210 / 0 / 5 / 8 ms |
| Browser cumulative | 6 / 12,489 / 180 / 7 / 1,772 ms | 4 / 7,053 / 101 / 9 / 1,447 ms | 2/2 / 3 / 516 / 3 / 8 / 52 ms |
| Wired server frontier once | 5 / 8,293 / 0 / 6 / 460 ms | 4 / 6,982 / 0 / 6 / 389 ms | 1/2 / 2 / 208 / 0 / 4 / 7 ms |
| Wired server cumulative | 6 / 12,489 / 180 / 8 / 1,932 ms | 4 / 7,049 / 101 / 9 / 1,481 ms | 2/2 / 3 / 513 / 3 / 8 / 52 ms |
| wired-admin frontier once | 5 / 8,287 / 0 / 9 / 473 ms | 4 / 6,978 / 0 / 7 / 379 ms | 1/2 / 2 / 206 / 0 / 5 / 7 ms |
| wired-admin cumulative | 6 / 12,477 / 180 / 5 / 1,077 ms | 4 / 7,045 / 101 / 7 / 774 ms | 2/2 / 3 / 510 / 3 / 5 / 20 ms |

Every static candidate resolved 5/5 depth, 120/120 wide, and 101/101
same-second events. Finite peak subscriptions were one. Cumulative repetition
is the measured correctness cost, not an efficiency win.

The selected browser live overlap resolved 2/2 with 3 REQs, 513 request bytes,
3 repeated relay deliveries but exactly 2 client callbacks, 4 ms initial p95,
47 ms complete p95, and peak 2 subscriptions. Twenty isolated samples back
these values.

The Wired server 1,000 ms experimental deadline produced a partial 110/120
wide result. Raising only the prototype deadline to 5,000 ms established the
complete comparator. Public-seam connection-close fixtures now prove all three
runners return `relay-closed`, rather than settle an empty pass. Production
code must expose a deadline as
incomplete and must never publish the partial set as complete.

## Approved interface

Each runtime implementation should expose the equivalent of:

```ts
type ReplyTraversalResult = {
  events: Event[];
  completion:
    | { state: "complete"; reason: "fixpoint-eose" }
    | {
        state: "incomplete";
        reason:
          | "deadline"
          | "cancelled"
          | "connect-failed"
          | "relay-closed"
          | "pass-bound";
      };
  evidence: {
    passes: number;
    requests: number;
    requestBytes: number;
    repeatedDeliveries: number;
    peakSubscriptions: number;
    initialResultMs: number | null;
    completionMs: number;
  };
};
```

Finite traversal rules:

- stream unique results immediately;
- query normalized, deduplicated parent IDs in sequential chunks of at most
  50 with no client result limit;
- repeat cumulative passes until an all-target EOSE pass yields no new IDs;
- a safety pass bound returns `incomplete`; it never truncates silently;
- deadline, cancellation, connection failure, or premature relay close return
  `incomplete`;
- retain relay coverage/hints and per-phase ownership already established by
  the public transport seam.

Browser live rules:

- open live coverage before finite backfill so initial content is not delayed;
- a successor covers all known parents and opens before its predecessor
  closes;
- promote only after successor EOSE; on failure retain the predecessor and
  report incomplete backfill;
- deduplicate callbacks across overlap;
- peak live subscriptions are at most two per relay.

## Per-runtime implementation guardrails

- **Browser thread (#107):** ordinary thread initial/complete p95 remains at
  the existing 28/48 ms comparators. Large controlled ceilings are 1,900 ms
  wide, 1,500 ms 101-result, and 60 ms handoff. Peak finite/live subscriptions
  are 1/2 per relay.
- **Browser feed (#108):** preserve the existing 26/50 ms ordinary feed
  comparator, bootstrap/live coverage, age window, and hint union. Apply the
  same large-fixture ceilings and 1/2 peak subscription bounds.
- **Wired snapshot (#109):** complete wide/limit/handoff ceilings are
  2,100/1,550/60 ms. On incomplete traversal, retain the prior atomic snapshot
  rather than commit fewer reachable replies.
- **wired-admin snapshot (#110):** complete wide/limit/handoff ceilings are
  1,200/850/30 ms. Preserve refresh coalescing, atomic persistence, and prior
  snapshot carry-forward on incomplete traversal.

Stop or roll back a runtime flag on any missing ID, a partial result labeled
complete, a client result limit, lost configured/hinted coverage, a
same-second handoff omission, a peak-subscription breach, an ordinary p95
regression, or a large-fixture ceiling breach. Rollback restores the prior
runtime traversal but retains the failing completeness fixtures and
incomplete-status evidence.

EOSE only proves completion relative to what covered relays returned. The
Nostr filter protocol cannot detect a relay that silently withholds or caps
matching events, so this decision makes no stronger public-relay guarantee.
Event publishing is deliberately not mixed into these query measurements; the
separate controlled publishing evidence completed under #105 remains the
publishing comparator for downstream implementations.
