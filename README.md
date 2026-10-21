# SiteShield Central API

The central API is separate from the public `siteshield` npm package and customer Next.js projects. The package evaluates requests locally, then asynchronously submits restricted/monitor events here. This service authenticates site keys, throttles ingestion with Redis, hashes source IPs, and stores durable events in PostgreSQL. The dashboard reads it server-side.

```text
customer Next.js proxy -> POST /v1/events/batch -> central API -> Redis (ingestion limits)
                                                            `-> PostgreSQL (durable events)
dashboard server-side admin calls -------------------------^
```

## Local setup

```powershell
npm install
npm run migrate
npm run dev
```

Start the dashboard separately with `npm install --prefix dashboard` and `npm run dev:dashboard`; it runs at `http://127.0.0.1:3001`. Local `.env` files are ignored by Git. Hosted services should use `HOST=0.0.0.0`, HTTPS, managed secrets, managed PostgreSQL, and a TLS Redis URL such as Upstash `rediss://...`.

Required API variables are `DATABASE_URL`, `REDIS_URL`, `SITESHIELD_ADMIN_TOKEN`, and an `EVENT_IP_HASH_SECRET` of at least 32 characters. `EVENT_BATCH_MAX` limits events per batch, `EVENT_BODY_LIMIT_BYTES` caps the request body, and `EVENT_RATE_LIMIT_PER_MINUTE` limits batch submissions per site per Redis minute bucket. `LOG_RETENTION_DAYS` is reserved for a future cleanup worker and is not currently enforced.

## Endpoints

| Endpoint | Authentication | Purpose |
| --- | --- | --- |
| `GET /health` | None | Liveness check |
| `POST /v1/sites` | Admin bearer token | Register a site; returns its site key once |
| `GET /v1/sites` | Admin bearer token | List sites without keys |
| `POST /v1/events/batch` | `X-SiteShield-Key` | Receive batched telemetry |
| `POST /v1/events` | `X-SiteShield-Key` | Single-event compatibility endpoint |
| `GET /v1/events` | Admin bearer token | Read the latest events |
| `DELETE /v1/sites/:siteId/events` | Admin bearer token | Delete one site's event logs |
| `DELETE /v1/sites/:siteId` | Admin bearer token | Delete a site and cascade its event logs |

Event UUIDs provide idempotency. IPs are keyed-hashed before persistence. Redis is temporary state; PostgreSQL is the durable source of dashboard events.

## Dashboard and deployment

The `dashboard/` app provides site registration, one-time setup instructions, event tabs (`All`, `Blocked`, `Rate limited`, `Monitor`), site filtering, cache-busted refresh from the central API, copy buttons, and confirmed per-site log/site deletion. It uses Basic Authentication as an MVP access gate; it is not team identity management and has no application session expiry.

Deploy this API as a Node service (for example Render) and `dashboard/` as a separate Next.js service (for example Vercel). Configure the dashboard with the central API URL, the same admin token, and a separate dashboard password. Redeploy after changing provider environment variables.

## Verification

Run `npm test`. Tests cover registration, site-key authentication, validation, limits, IP hashing, duplicate handling, and deletion. Live Redis/PostgreSQL integration requires those services to be available.
