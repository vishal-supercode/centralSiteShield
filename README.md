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

Event UUIDs provide idempotency. Event source IPs are keyed-hashed before event-log persistence. IP rules are intentionally stored as normalized IPv4/IPv6 addresses in PostgreSQL because the package must compare them to incoming client addresses. Treat this rules table as personal data: restrict dashboard access, use TLS/backups controls, and remove entries when no longer needed. Redis is temporary state; PostgreSQL is the durable source of dashboard events and IP rules.

## IP allowlist and blocklist

| Endpoint | Authentication | Purpose |
| --- | --- | --- |
| `GET /v1/policy` | `X-SiteShield-Key` | Return the authenticated site's allow and block IP addresses for package enforcement |
| `GET /v1/sites/:siteId/ip-rules` | Admin bearer token | List a site's rules, including manual/automatic source |
| `POST /v1/sites/:siteId/ip-rules` | Admin bearer token | Add or move one IP to `allow` or `block`; body: `{"ip":"203.0.113.10","type":"allow"}` |
| `DELETE /v1/sites/:siteId/ip-rules/:ruleId` | Admin bearer token | Remove one IP rule |

Every newly accepted event whose decision is `block` automatically adds that source IP to that site's persistent blocklist. Requests merely detected in `monitor` mode do not create automatic entries. The event IP remains keyed-hashed in the event table; the separate rule IP is stored in clear text so it can be enforced. Existing allow rules are not overwritten by automatic blocks. Manually changing a rule's type moves that address between lists. Rules do not expire automatically. The package checks cached rules and refreshes them approximately once per minute per warm instance, so changes may take up to a minute to reach all app instances and rule reads are not made for every visitor request.

## Dashboard and deployment

The `dashboard/` app provides site registration, one-time setup instructions, event tabs (`All`, `Blocked`, `Rate limited`, `Monitor`), site filtering, cache-busted refresh from the central API, copy buttons, confirmed per-site log/site deletion, and per-site IP allow/block management. It uses Basic Authentication as an MVP access gate; it is not team identity management and has no application session expiry.

Deploy this API as a Node service (for example Render) and `dashboard/` as a separate Next.js service (for example Vercel). Configure the dashboard with the central API URL, the same admin token, and a separate dashboard password. Redeploy after changing provider environment variables.

## Verification

Run `npm test`. Tests cover registration, site-key authentication, validation, limits, IP hashing, duplicate handling, IP-rule management, automatic blocking, and deletion. Apply the schema before deploying the new API by running `npm run migrate`; live Redis/PostgreSQL integration requires those services to be available.
