# Hosting on Netlify Free

The storefront and admin can run on Netlify Free. The existing local launcher and Cloudflare option still work. Payments and orders remain disabled.

## What gets deployed

- Static storefront assets from `dist/`.
- A Netlify Function serving the shared API and protected admin pages.
- Netlify Database (Postgres) for catalog settings, products, sessions and login throttling.
- Netlify Blobs for uploaded images. Production uses a persistent store; preview uploads use separate stores.
- A daily cleanup function for expired sessions and login attempts.

The Free plan has a hard monthly usage allowance. Database activity, traffic, builds and functions consume credits. A site can pause when credits run out. Keep the team on **Free** and do not enable paid upgrades. Current limits: <https://www.netlify.com/pricing/>.

## Setup and deploy

1. Run `npm ci` and `npx netlify login`. Authorization opens in your normal browser. An agent can instead use `npx netlify login --request "Deploy my shop"`, share that URL, then check the returned ticket with `npx netlify login --check TICKET_ID`.
2. Create or link the intended project in your own Netlify team. For this shop, the target team is `walt-white`; the source repository is `danisobhz/theglowhub`. Never select an unrelated team or project.
3. Run `node scripts/prepare-admin-netlify.mjs`. This writes a generated random password to the ignored `.netlify/admin-access.txt`, and its digest to `.netlify/admin-secret.env`. It refuses to overwrite existing access files. Save the password privately.
4. Import the digest with `npx netlify env:import .netlify/admin-secret.env`. The CLI prints imported values, so agents must capture and suppress that command's output. Never upload or commit either private file. Delete `admin-secret.env` after a successful import.
5. Run `npx netlify deploy --prod --context production`. The CLI runs `npm run build:netlify`. Netlify provisions the database and applies the SQL files under `netlify/database/migrations/` before publishing. Keep `@netlify/database` installed.
6. Open the returned site URL. Open `/admin` to sign in with the generated password. Verify a product edit, image upload and storefront update.

Future deployments preserve database and image data. Do not edit an already-applied migration: add a new numbered SQL file instead. Do not publish `public/` directly: the build deliberately removes admin HTML from static output and serves it through the authenticated function.

## Data and limits

The initial migration contains the demonstration Aurel catalog. Local edits in `data/store.json` and uploads in `public/uploads/` are separate, ignored data and are **not automatically uploaded**. Import them deliberately before switching a real shop online. Never replace a live catalog automatically during builds.

Netlify uploads are limited to **3 MB per image** so base64 requests fit the function limit. The admin shows the correct limit for the hosting environment; local and Cloudflare uploads remain 5 MB.

Use **Download catalog** in the admin to back up product details and settings. Photo files require a separate backup. Deleting a product does not delete its image. Rotating `ADMIN_PASSWORD_HASH` and redeploying invalidates previous admin sessions on the new deployment. Retire old deploy URLs if access credentials were compromised.

## Verification

`npm run build:netlify` checks the packaging path. `npm run test:netlify` runs adapter checks, and runs the full PostgreSQL integration suite when `NETLIFY_TEST_DATABASE_URL` points to a disposable test database. It creates and removes its own isolated schema. GitHub Actions provides Postgres and runs this suite along with the original local and Cloudflare suites.

GitHub stores source and runs tests. Automatic deployment from Git requires connecting this exact repository to the Netlify project; a manual CLI deployment does not by itself establish that connection.
