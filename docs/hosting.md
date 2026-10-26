# Hosting and administration

The deployable version uses Cloudflare Workers for the website/API, D1 for the catalog and R2 for uploaded images. It can fit within Cloudflare's free allowances for a small shop, but usage beyond the allowances and optional services may cost money. R2 activation may require billing details. Check the provider's current terms before enabling it:

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

GitHub Pages alone cannot run this admin or persist product changes. This repository's GitHub workflow only checks the project. Hosting requires the explicit steps below; no Cloudflare resources are created by cloning or pushing it.

## 1. Install and test

Use Node.js 24 LTS and run from the project folder:

```sh
npm ci
npm run check
npm run build
npm test
npm run deploy:check
```

`deploy:check` bundles the Worker locally without deploying it.

For a local preview of the actual hosted API:

```sh
npm run admin:password -- --local
npm run dev:cloud
```

Save the generated password. Open http://localhost:8787 and http://localhost:8787/admin. Cloud data stays in `.wrangler/`; it is separate from the simple local version's `data/store.json`. Local cloud data, passwords and uploaded photos are never pushed to GitHub. Stop the preview with Ctrl+C.

## 2. Create your Cloudflare resources

Run these yourself when ready to host, and complete Cloudflare's sign-in flow:

```sh
npx wrangler login
npx wrangler d1 create theglowhub-catalog
npx wrangler r2 bucket create theglowhub-images
npm run setup:cloud
```

Enter the D1 `database_id` UUID from the creation output. The setup helper writes `cloudflare.local.json`, which is ignored by Git. If these resources already exist, reuse them rather than recreate them. Keep the database and bucket names shown above, or update the configuration and commands consistently.

## 3. Deploy and enable admin

```sh
npm run deploy
npm run admin:password -- --remote
```

Deployment applies the database migrations and uploads the Worker and bundled assets. Use the `workers.dev` URL printed by Wrangler. The first migration creates tables and the second adds the demonstration catalog once. Subsequent deployments preserve saved catalog edits and R2 images.

Until the remote password command succeeds, admin access stays unavailable. That command must run interactively and prints a new random password once; save it privately in a password manager and give it only to the shop owner. Open `/admin` on the deployed domain to sign in. No password is included in this repository, build output or the website's JavaScript.

**The local catalog is not automatically imported.** A first cloud deployment starts with sample products. Recreate your real products and upload real photos in the hosted admin. The local `data/` and `public/uploads/` folders are intentionally excluded from deployment. All sample content must be reviewed before the site is used publicly.

Custom domains are optional and may cost money to register. Connect one in Cloudflare's Worker settings after testing on the included domain. Keep the API and website on the same domain.

## Passwords and sessions

- The script generates a 192-bit random password. Its SHA-256 digest is the `ADMIN_PASSWORD_HASH` Worker secret. This fast digest scheme relies on the generated password's high entropy: **do not replace it with a digest of a human-chosen password**.
- Session tokens are random; only their digests are stored in D1. Cookies are HttpOnly, SameSite=Strict and Secure on the hosted domain, and expire after eight hours.
- Login attempts are limited to five per IP per 15 minutes. Shared networks share this limit.
- Changes require a valid session and same-origin requests. The public API never returns hidden products.
- A session that expires during editing prompts for sign-in without clearing unsaved form fields. If another admin tab changes the same product, saving is rejected instead of overwriting the newer version; copy any unsaved text before reloading.
- Run `npm run admin:password -- --remote` again to reset access. This invalidates all previous sessions and passwords. There is no email recovery or multiple-user account system.

## Backups and recovery

The admin's **Download catalog** button saves products and settings as JSON, without credentials or sessions. It records image paths, not image file contents. Store this file privately if it includes unreleased products.

Create a `backups` folder and export the remote D1 database:

```sh
npx wrangler d1 export theglowhub-catalog --remote --config cloudflare.local.json --output backups/catalog.sql
```

The ignored `backups/` folder keeps this out of Git. The SQL export includes authentication tables, so keep it private. Also download the contents of the R2 `theglowhub-images` bucket using Cloudflare's dashboard or an authenticated S3-compatible backup tool. Keep original image filenames because product records reference them.

To restore, use a new empty D1 database and import the SQL with `wrangler d1 execute <database-name> --remote --file <backup.sql>`. Restore R2 objects under their original names, point your configuration at the restored resources, and reset the remote password before using the shop. Do not import a full SQL export over an existing database without a separate backup and an explicit recovery plan. JSON catalog exports are readable backups; there is no automatic JSON import screen.

Deleting a product does not delete its photo from R2. This avoids breaking shared images and permits recovery, but unused photos consume storage. Remove them manually only after verifying no product uses them and keeping a backup.

## Operation

`/api/health` verifies database connectivity. Expired sessions and login-attempt records are removed by a daily scheduled Worker task. D1, R2 and Worker failures are shown as errors in the admin; changes are not reported as saved until the API succeeds.

The shop has no checkout, payment or ordering integration. Add and test the agreed payment, order, shipping and tax workflow before accepting orders. A successful deployment makes the catalog public; it does not turn the shopping bag into an order.
