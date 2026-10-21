# SiteShield Dashboard

This standalone Next.js app is the SiteShield operations console. It reads registered sites and security events from the central API. Initial data and admin API calls are server-side; the admin token is never sent to browser JavaScript.

The dashboard provides:

- Site registration with one-time site key, site ID, environment, and `src/proxy.ts` setup instructions.
- Interactive tabs for all, blocked, rate-limited, and monitor events.
- Site filtering and color-coded decisions.
- A cache-busted **Refresh** button that fetches the newest events from the central API/PostgreSQL path.
- Copy feedback for keys, IDs, environment values, and `proxy.ts`.
- Confirmed deletion of one site's logs or the site plus its logs.
- Per-site IP allowlist/blocklist management, including automatic block entries from requests that receive a `block` decision.

Allowlisted addresses bypass SiteShield scoring/rate limits; blocklisted addresses receive an immediate `403`, even while the site is in monitor mode. Automatic entries are made only for actual `block` decisions, so scored detections in monitor mode are reported but not automatically added. Block entries created from telemetry are persistent and do not expire; remove an entry when it should no longer apply. The package refreshes cached rules about once per minute per warm application instance.

Event-log IPs remain keyed hashes. IP rules themselves are stored as normalized, readable IP addresses in PostgreSQL so the package can compare them with incoming client IPs. Treat the rules as sensitive personal data.

Basic Authentication is enabled by `proxy.js` for all pages. It is an MVP access gate: the browser caches the credentials and there is no application session expiry. Use HTTPS, managed secrets, and stronger identity management before broad production administration.

## Environment

Create `dashboard/.env.local` locally, or configure these variables in Vercel:

```env
SITESHIELD_API_URL=http://127.0.0.1:4000
SITESHIELD_ADMIN_TOKEN=the_same_token_as_the_central_api
SITESHIELD_DASHBOARD_PASSWORD=a_separate_dashboard_password
```

Use the deployed HTTPS API URL in hosted environments. Keep all values server-side and ignored by Git. The dashboard password must be separate from the central admin token.

## Run locally

From `centralSiteShield`:

```powershell
npm install
npm run migrate
npm run dev
```

In another terminal:

```powershell
npm install --prefix dashboard
npm run dev:dashboard
```

Open `http://127.0.0.1:3001`. Register a site, then copy its site key and site ID into the consuming Next.js project's server-side environment and `src/proxy.ts`.

Allowed requests are intentionally not logged. Restricted and monitor events are queued by the npm package, persisted by the central service in PostgreSQL, and appear after the reporter flushes; click **Refresh** to fetch them immediately. Redis handles temporary counters and central ingestion throttling. Run the central API's migration command before deploying this feature so the `site_ip_rules` table exists.
