# Froggie the Helper web app

The community-help interface lives in this directory as a Vite and React app with
a Bun/Express API. It includes requester and helper onboarding, Photon iMessage
verification, location suggestions, helper profiles, and a visual preview of the
community project experience.

The project cards, claims, points, and leaderboard are illustrative browser-only
UI. The real request board remains private to the trusted-circle iMessage flow;
the web app does not publish its bounties or source email.

## Run locally

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`. The local API runs on `http://127.0.0.1:8787/`.

## Photon setup

Copy `.env.example` to a gitignored `.env` and provide:

- `SPECTRUM_PROJECT_ID`
- `SPECTRUM_PROJECT_SECRET`

The API also accepts the root app's `PROJECT_ID` / `PROJECT_SECRET` names when it
is launched from an environment that already supplies them. Never commit the
populated `.env` file.

On a shared-line Photon plan, set `FROGGIE_SYNC_PHOTON_USERS=1` and authenticate
the local `photon` CLI first. Leave it off when the project line can message the
verified number directly.

## Signup and local approval

Successful iMessage verification writes the signup to the root app's private
`.data/dnm.sqlite` database. Helper preferences become user-stated memories and
the selected consent flags are recorded. A new user is paused by default, so an
operator must admit them to an existing trusted circle:

```sh
cd ..
bun run users:approve --user-id=<id-returned-by-signup>
```

For a tightly controlled demo, `FROGGIE_TRUSTED_CIRCLE_ID` may name an existing
active circle and verified users will be admitted automatically.

The requester Gmail button records a connection request only. It does not perform
OAuth. Complete the root project's read-only Gmail OAuth/import separately; bounty
discovery is enabled only when an active Gmail mailbox for that exact address
already exists. See the root README for the import command and data-handling rules.
