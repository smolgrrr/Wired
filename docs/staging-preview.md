# Wired staging preview

Wired client branches can use the shared Wired Admin staging relay and snapshot
origin without changing source code.

Copy the values from `docs/staging.env.example` into a local `.env.local` or a
Vercel preview environment.

```sh
npm run dev
```

The staging admin origin is:

```text
https://staging.wiredsignal.online
```

The client uses it for:

- feed bootstrap snapshots
- moderation manifests
- PoW relay writes and reads
- Wired account status and high-PoW post submission
- private Lightning-address validation and revenue enrollment
- Wired NIP-57 routing configuration
- local media-safety verdicts for note/reply images and videos

Production uses `https://relay.wiredsignal.online` for the Wired account API
via `VITE_WIRED_ACCOUNT_API_BASE`.

Revenue requests use `VITE_REVENUE_API_BASE`. The staging backend begins with
FakeWallet, so `creator@fake.invalid` can exercise the complete simulated flow
without creating or spending real Lightning funds.

Media moderation preview variables:

```sh
VITE_MEDIA_MODERATION_API_BASE=https://staging.wiredsignal.online
VITE_MEDIA_MODERATION_MODE=shadow
VITE_MEDIA_MODERATION_SURFACES=image,video
VITE_MEDIA_MODERATION_COHORT_PERCENT=100
```

`shadow` records decisions without hiding media. For a later enforcement
canary, use `enforce` with a small stable cohort percentage. The server mode is
an independent kill switch: an enforcing client will not enforce when Wired
Admin returns `shadow`. Set the client mode to `off` for immediate rollback.
Audio, avatars/profile metadata, emoji, and link previews are not sent for
classification.

Do not commit local `.env*` files.
