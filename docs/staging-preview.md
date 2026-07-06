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
- Confess API calls

Do not commit local `.env*` files.
