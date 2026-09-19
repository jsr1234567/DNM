# dnm

A [Spectrum](https://photon.codes/docs/spectrum-ts) project. Wired with: imessage.

## Environment

Before running, open `.env` and fill in the values:

From your project Settings on the [Photon dashboard](https://app.photon.codes):

- `PROJECT_ID`
- `PROJECT_SECRET`

## Run

```sh
bun install
photon whoami || photon login
bun start
```

Open [http://localhost:3000](http://localhost:3000) to register an iMessage user.
The form sends contact details to the local server, which registers the user with
the DNM Photon project and displays their assigned iMessage number. Photon project
credentials remain server-side.

## Local email archive and memory

Initialize the gitignored SQLite database and probe vector support:

```sh
bun run db:setup
```

The built-in Bun SQLite on macOS may reject dynamic extensions. This machine has a
compatible Homebrew SQLite, so semantic-index support can be enabled explicitly:

```sh
DNM_SQLITE_LIBRARY=/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib bun run db:setup
```

Without that setting, the tested FTS5 keyword index remains fully available. Vector
storage is ready, but no embeddings are generated until an embedding model and its
dimensions are selected.

After completing the existing local, read-only Gmail OAuth flow, import a bounded
snapshot. The mailbox argument is a required consent/identity check:

```sh
bun run gmail:import --confirm-mailbox=you@example.com --days=30 --limit=500
```

The import excludes spam/trash, stores no attachments, upserts Gmail message IDs,
and records whether each run completed or was partial. Canonical messages live in
`.data/dnm.sqlite`; FTS/vector indexes are rebuildable derivatives:

```sh
bun run db:reindex
bun test
bun run typecheck
```

To clear local email, indexes, memories, chat history, and Gmail token files, stop
the app/import first and run the explicitly destructive reset:

```sh
bun run db:reset --yes
```

Revoke the OAuth grant separately at
[Google Account permissions](https://myaccount.google.com/permissions) if needed.
SQLite is not encrypted; use a trusted machine with disk encryption. Email excerpts
may later be sent to the selected model vendor, and iMessage replies travel through
Spectrum—this local database does not make the system offline or end-to-end private.

## Hackathon research

- [Judge OSINT and build strategy](research/judge-osint-2026-09-19.md)

Research is limited to public, professionally relevant information and excludes sensitive personal data.

## Where to go next

- [Spectrum docs](https://photon.codes/docs/spectrum-ts)
- Edit `src/index.ts` to replace the echo loop with real agent logic.
- Add more providers from `spectrum-ts/providers/*`.
