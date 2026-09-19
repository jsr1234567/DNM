# dnm

A [Spectrum](https://photon.codes/docs/spectrum-ts) project. Wired with: imessage.

## Environment

Before running, open `.env` and fill in the values:

From your project Settings on the [Photon dashboard](https://app.photon.codes):

- `PROJECT_ID`
- `PROJECT_SECRET`
- `OPENROUTER_API_KEY`

The iMessage reply loop uses `google/gemini-3.8-flash` through OpenRouter by
default. Set `OPENROUTER_MODEL` to override it for local experiments.

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

Photon registration does not grant access to private local data. Explicitly add each
consenting demo user to the local allowlist and trusted circle:

```sh
bun run users:add --id=alex --name="Alex Rivera" --sender-id=+12025550103 \
  --phone=+12025550103 --email=alex@example.com --source=gmail \
  --consent --find-help --offer-help
```

`--find-help` and `--offer-help` are separate consent flags. Inbound events are
accepted only for an allowlisted iMessage sender in a direct message; outbound
echoes, groups, paused users, and unknown senders are rejected before private state
or the model is accessed. Each accepted DM uses only that user's private context.

An optional gitignored `.data/demo-profile.json` can bind a real stage sender to
an imported Gmail user:

```json
{
  "senderId": "+15551234567",
  "email": "stage@example.com",
  "name": "Stage User"
}
```

Add `"personaId": "social-organizer"` to bind the sender to that synthetic
fixture instead. Live Gmail bindings require a completed read-only import first.

`bun start` seeds the fixtures first, validates this binding, and resolves the
sender to that persona's canonical `user_id`. The bound display name and email are
included in the LLM context, while email, memories, chats, and requests remain
scoped by the canonical user. For a real multi-user demo, use `users:add` once per
consenting participant instead.

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
bun run gmail:import --user-id=alex --mailbox-id=gmail:alex \
  --confirm-mailbox=you@example.com --days=30 --limit=500
```

The import excludes spam/trash, stores no attachments, upserts Gmail message IDs,
and records whether each run completed or was partial. Canonical messages live in
`.data/dnm.sqlite`; FTS/vector indexes are rebuildable derivatives:

With `OPENROUTER_API_KEY` configured in the project-local `.env`, extract a bounded
set of source-backed memories with Gemini 3.8 Flash and generate a private profile:

```sh
bun run memory:generate --user-id=alex \
  --confirm-mailbox=you@example.com --threads=25
```

The model defaults to `google/gemini-3.8-flash` through OpenRouter. Override it only
for local experiments with `OPENROUTER_MODEL`. The generated
`.data/users/<user-id>/memory.md` is a gitignored projection; the versioned,
user-scoped SQLite profile is canonical. Gmail tokens belong at
`.data/users/<user-id>/gmail-token.json` with mode `0600`. To regenerate the
profile without rereading email threads, pass `--profile-only`.

## Private request board

The fixture seed creates four isolated synthetic users and one manually curated
trusted circle. It includes the Alex pickup-gap and Casey helper-availability demo:

```sh
bun run db:seed:mock
bun run bounties:generate
bun run bounties:match
```

Extraction creates private drafts only. Explicit iMessage commands handle `my
requests`, `post`, `edit …`, `dismiss`, `offer`, `pass`, `connect`, `decline`,
`pause bounty N`, and `close bounty N`. Matching is idempotent; the running app
delivers pending asks and advances them only after a successful send. Set
`DNM_BOUNTY_INTERVAL_MS=600000` for the optional ten-minute matcher.

Only sanitized request fields cross the board boundary. Raw owner evidence and
helper-private reasoning remain private. No helper is treated as volunteered, and
contact details are exchanged only after the helper offers and the owner accepts.
This is a trusted synthetic/social-circle demo, not a public marketplace,
emergency service, childcare-vetting system, or production scheduler.

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

To clear only one user's local data and private token/profile directory:

```sh
bun run db:reset:user --user-id=alex --yes
```

Revoke the OAuth grant separately at
[Google Account permissions](https://myaccount.google.com/permissions) if needed.
SQLite is not encrypted; use a trusted machine with disk encryption. Email excerpts
are sent to the selected model vendor when responding, and iMessage replies travel
through Spectrum—this local database does not make the system offline or end-to-end private.

## Hackathon research

- [Judge OSINT and build strategy](research/judge-osint-2026-09-19.md)

Research is limited to public, professionally relevant information and excludes sensitive personal data.

## Where to go next

- [Spectrum docs](https://photon.codes/docs/spectrum-ts)
- Add more providers from `spectrum-ts/providers/*`.
