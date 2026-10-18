# SiteShield Central API — Phase B

This is a separate Node.js service from the public `siteshield` npm package and the `demoSite` application. It receives security-event telemetry, throttles per-site batch submissions through Redis, and stores durable logs in PostgreSQL. Event IDs are unique in PostgreSQL, so retransmitted batches do not create duplicate rows. Client IPs are transformed to a keyed SHA-256 digest before persistence.

## Local setup

Install PostgreSQL and Redis locally, create the database named in `.env`, then run:

```powershell
npm install
npm run migrate
npm run dev
```

In another terminal, start the dashboard at `http://127.0.0.1:3001`:

```powershell
npm install --prefix dashboard
npm run dev:dashboard
```

Dashboard API URL, credentials, and basic-auth password are in `dashboard/.env.local` (ignored by Git). The token must match the central API's `SITESHIELD_ADMIN_TOKEN`; keep the dashboard password separate. The UI lists sites and latest events and filters reports by site. API calls are server-side, so the token is not sent to browser code. Basic authentication is an MVP access gate only; use HTTPS and team SSO/identity management for deployment.

The service binds to `127.0.0.1:4000` by default. `.env` has local-development-only values and is git-ignored. Replace both secrets before deployment. `EVENT_IP_HASH_SECRET` must be at least 32 characters and should remain stable if hashes need to correlate across restarts. A deployed service also needs HTTPS, managed secrets, and managed/private database and Redis endpoints; don't expose this local configuration directly to the internet.

## Endpoints

| Endpoint | Authentication | Purpose |
| --- | --- | --- |
| `GET /health` | None | Liveness |
| `POST /v1/sites` | Admin bearer token | Register a site; returns its site key once |
| `POST /v1/events/batch` | `X-SiteShield-Key` | Batch telemetry from newer package reporter |
| `POST /v1/events` | `X-SiteShield-Key` | Single-event compatibility for the older package reporter |
| `GET /v1/sites` | Admin bearer token | List sites without exposing site keys |
| `GET /v1/events` | Admin bearer token | Read recent events for the dashboard |

The batch reporter sends `{ "events": [...] }`. The request rate setting counts HTTP batch requests per site per 60-second Redis bucket—not individual events. `EVENT_BATCH_MAX` limits events per batch and `EVENT_BODY_LIMIT_BYTES` caps request size. PostgreSQL handles idempotency through the event UUID primary key. Redis is used for ephemeral ingestion limits; PostgreSQL is the durable event store.

The npm package only has a bounded transient in-memory telemetry queue. It does not persist logs permanently. Its batch reporter must be configured to send to this separately hosted API.

## Configuration notes

`.env.example` lists all API variables. `LOG_RETENTION_DAYS` is reserved for a retention worker and is not active yet. The API uses one bearer token; the dashboard currently uses Basic Authentication, not team-user accounts or SSO.

## Verification and scope

Run `npm test`. Tests use memory stores and verify registration, batch validation, site-key authentication, cross-site rejection, request limits, IP hashing, and duplicate handling. Live Redis/PostgreSQL integration still requires the services to be available. The dashboard UI is an initial operations view, not a full policy-management console. Hosted deployment and automated log cleanup remain future work.
