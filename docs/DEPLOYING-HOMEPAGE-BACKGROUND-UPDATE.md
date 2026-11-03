# Deploying the Homepage Background Update

This update changes only the client homepage, its CSS veil, and one static image. No API, database, or environment-variable changes are required.

The image is referenced by a same-origin URL and bundled from `client/public/images/`. Do not add a secret or environment variable for this background.

## Before deployment

From the repository root, verify the production client build:

```bash
cd client
npm ci
npm run build
```

The build should finish successfully. The supplied skyline PNG is under `client/public/images/` and is copied into `client/dist/images/` unchanged during the build.

## Vercel / static frontend deployment

1. Review and commit the homepage changes: `client/src/pages/LandingPage.tsx`, `client/src/styles/landing.css`, and `client/public/images/layered-skyline-at-twilight.png`.
2. Push or merge the commit to the branch configured for the existing frontend deployment (normally `main`).
3. If configuring the Vercel project for the first time, use `client` as the Root Directory, `npm run build` as the Build Command, and `dist` as the Output Directory. The SPA rewrite is already defined in `client/vercel.json`.
4. Wait for the hosting provider's build and deployment to succeed, then hard-refresh the homepage and check desktop, mobile, and tablet layouts.

## Existing VPS deployment path

If this installation is deployed using the repository's VPS script, first push or merge the reviewed commit to `main`. On the VPS, ensure the working tree is clean, then run from the repository root:

```bash
bash deploy.sh
```

The script fetches and fast-forwards `origin/main`, builds both server and client, restarts the PM2 process named `truviventures`, and checks the app's `/health` endpoint. It intentionally refuses to deploy when the VPS working tree is dirty or is not on `main`. Do not run it from this uncommitted working copy as a substitute for publishing the changes.

## Rollback

For a Vercel deployment, promote the last known-good deployment in the Vercel dashboard. For a VPS deployment, revert the background-update commit on `main`, push the revert, and rerun `bash deploy.sh` on the VPS.
