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

## Hackathon research

- [Judge OSINT and build strategy](research/judge-osint-2026-09-19.md)

Research is limited to public, professionally relevant information and excludes sensitive personal data.

## Where to go next

- [Spectrum docs](https://photon.codes/docs/spectrum-ts)
- Edit `src/index.ts` to replace the echo loop with real agent logic.
- Add more providers from `spectrum-ts/providers/*`.
