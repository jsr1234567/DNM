# Froggie the Helper web app

The community-help interface lives in this directory as a standalone Vite and React app. It includes requester and helper onboarding, the Photon iMessage verification bridge, community projects, location suggestions, helper profiles, and the good-deed garden.

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

Never commit the populated `.env` file.
