# Passive browser publish observation

Issue: [wired-admin #115](https://github.com/smolgrrr/wired-admin/issues/115)

## Purpose and boundary

This owner collects bounded, content-free client observations needed to decide whether a browser publish completion deadline is safe. It does not implement a deadline. Every configured relay is still attempted, and `RelayPool.publish` continues waiting for every connected relay exactly as before.

`VITE_BROWSER_PUBLISH_OBSERVATION_MS` accepts an integer from 1,000 through 60,000 and otherwise disables observation. Production observation uses 60,000 ms, a fixed measurement checkpoint rather than a proposed application deadline. The timer is created only for clients already selected by the workflow-status export cohort.

## Owner states

The existing `wired.browser.publish` owner records a publish that settles before the checkpoint. A publish still pending at the checkpoint instead records `wired.browser.publish-observation` with outcome `timed-out`. Its accepted-count bucket and terminal counters distinguish:

- healthy accept with silent peer: accepted `one` or `multiple`, with one or more timed-out targets;
- all silent or zero-accept timeout: accepted `none`, with timed-out targets;
- all reject before the checkpoint: the ordinary owner records `failed` and no observation timeout is emitted; and
- ACK at the exact checkpoint: the timer boundary wins, so the ACK is late.

If a checkpointed publish later settles, the observation owner emits one final `completed`, `partial`, or `failed` aggregate with the final accepted bucket and duration. The ordinary owner is suppressed for that late settlement so an eligible publish is counted once at its initial terminal/checkpoint boundary. The late aggregate is a follow-up state, not another eligible publish.

No event content, event ID, pubkey, relay URL, secret, or arbitrary label is recorded. Confirmed EVENT byte counts retain the existing client-observed semantics and are not claims about public-relay receipt or load.

The isolated 20-sample local fixture measured healthy partial-accept completion p95 at 9 ms with observation disabled and 9 ms with the 60-second passive observer configured. These controlled loopback values verify scheduling equivalence only; they are not used to choose a production deadline or estimate public-relay behavior.

## Observation gate

The decision window starts only after the private store, ingest controls, 10% cohort, and 60-second passive observer are deployed and verified. Observe 7 consecutive UTC deployment days or 100 eligible publishes, whichever is later, capped at 14 days. Increase the exporter from 10% only after accepted results, compose timing, private-store access, retention, and drop counters remain healthy.

Stop and set `VITE_BROWSER_PUBLISH_OBSERVATION_MS=0` for any compose state, accepted-relay, retry, revenue, completion-timing, memory, or evidence-overhead regression. Set `VITE_RELAY_WORKFLOW_STATUS_PERCENT=0` to stop all browser export. Neither rollback changes relay delivery behavior.
