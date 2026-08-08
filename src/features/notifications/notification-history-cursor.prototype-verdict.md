# Prototype verdict: NO-GO

Question: can Wired build a complete, stable authored/mentioned notification
cursor from the current NIP-01 filters without reducing relay coverage or
silently omitting same-second events?

No. Driving this model showed that inclusive second-resolution `until` needs a
secondary boundary key whenever a relay limit lands inside one timestamp. The
prototype tried adaptive hexadecimal event-ID prefixes. Pinned NIP-01 rejects
that escape hatch: `ids`, `authors`, `#e`, and `#p` filter values must be exact
64-character lowercase hexadecimal values. It also says returning fewer than a
requested limit is acceptable, so a short page is not proof of exhaustion.

The state machine remains on this throwaway branch as the primary source for
the falsified design. Do not lift its prefix partition into production. Reopen
the design only when every configured relay exposes a standard, testable
exclusive cursor or equivalent complete reconciliation primitive.
