# The Glow Hub shop

A boutique storefront and a simple product manager, with a cream, ink and gold design. The included Aurel branding and sample catalog can be replaced from **Shop settings**. It uses system fonts and bundled images without remote font services.

## Try it on your computer

Install Node.js 24 LTS, then double-click **Start Shop.bat**, or run:

```sh
npm start
```

Open http://localhost:3000 for the shop and http://localhost:3000/admin for the manager. Keep the terminal open; Ctrl+C stops it. This mode requires no dependency installation, uses `data/store.json` and `public/uploads/`, and is restricted to this computer. Local admin has no password. Do not expose `server.mjs` to the internet.

## Manage the shop

- **Add or edit:** choose Add product or click a product. Set its photo, name, price, quantity, category and description, then Save product.
- **Photos:** upload JPG, PNG or WebP files up to 5 MB. Choose Change image to replace a photo.
- **Hide:** set Visibility to Hidden. The product stays in the manager but disappears from the storefront.
- **Feature:** select Make this a house favourite to place a product near the top.
- **Branding:** Shop settings controls the name, headline, introduction, announcement, about text and currency. Changing currency does not convert prices.
- **Backup:** Download catalog exports saved product details and settings. Photo files must be backed up separately.

The storefront supports search, category filters, sorting, product details and a stock-aware shopping bag saved in the visitor's browser. Adding items does not reserve stock.

**Payments and checkout are intentionally disabled.** No orders, shipping charges, tax, emails or customer accounts are created. Those need the payment and ordering decisions before launch. The sample product claims, prices and stock are demonstration content; replace them with real merchandise information.

## Hosting-ready version

For **Netlify Free**, read [the Netlify guide](docs/netlify.md). It uses the same interface with Netlify Functions, Postgres and persistent image storage. The Netlify build command is `npm run build:netlify`; uploads on that host are limited to 3 MB. Its Free plan pauses service if monthly credits are exhausted.

The Cloudflare Worker in `cloud/` serves the same design with a password-protected admin, D1 catalog storage and R2 photo storage. The local Node server is not used in production. Hosting is a separate, explicit step; pushing this repository does not publish a website.

Read **[the hosting guide](docs/hosting.md)** for setup, local cloud testing, deployment, password resets and backups. The account-specific configuration and secrets are excluded from Git.

```sh
npm ci
npm run admin:password -- --local
npm run dev:cloud
```

The second command must be run interactively. Save the generated password in a password manager. The cloud emulator has separate data from the simple local server; it is available at http://localhost:8787, with admin at `/admin`.

## Checks

```sh
npm run check
npm run build
npm test
npm run deploy:check
```

Tests use isolated data and cover local persistence plus cloud authentication, authorization, catalog changes, upload validation and conflicting edits. GitHub Actions runs checks only; it does not deploy.

## Files

| Location | Purpose |
| --- | --- |
| `public/` | Storefront, admin, login and bundled sample images |
| `cloud/` | Hosted API, session handling and validation |
| `migrations/` | Database schema and initial demonstration catalog |
| `scripts/` | Build, local cloud preview and deployment helpers |
| `server.mjs` | Offline-friendly local development server |
| `seed.mjs` | Initial sample catalog for the local server |
| `data/`, `public/uploads/` | Your local shop data; never committed |

To back up the simple local version, stop it and copy both `data/` and `public/uploads/`. Uploaded images are retained when a product is removed. The generated sample photography prompts are recorded in `docs/image-prompts.txt`.
