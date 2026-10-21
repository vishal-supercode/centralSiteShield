import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { timingSafeEqual } from "node:crypto";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import {
  batchSchema,
  newSiteSchema,
  securityEventSchema,
} from "./contracts.js";
import { normalizeIp, type EventStore } from "./store.js";
import type { IngestionLimiter } from "./rate-limiter.js";

export function createApp(options: {
  store: EventStore;
  limiter: IngestionLimiter;
  adminToken: string;
  ipHashSecret: string;
  maxBatch: number;
  bodyLimitBytes: number;
}) {
  if (!options.adminToken.trim())
    throw new Error("SITESHIELD_ADMIN_TOKEN is required");
  if (options.ipHashSecret.length < 32)
    throw new Error("EVENT_IP_HASH_SECRET must be at least 32 characters");
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: options.bodyLimitBytes }));
  const admin = (req: Request, res: Response, next: NextFunction) => {
    if (
      !safeEqual(
        req.header("authorization") ?? "",
        `Bearer ${options.adminToken}`,
      )
    )
      return res.status(401).json({ error: "admin authentication required" });
    next();
  };
  app.get("/health", (_req, res) =>
    res.json({ ok: true, service: "siteshield-central" }),
  );
  app.post("/v1/sites", admin, async (req, res) => {
    const parsed = newSiteSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "invalid site", details: parsed.error.issues });
    const registered = await options.store.registerSite(parsed.data);
    const { apiKeyHash: _hash, ...site } = registered.site;
    return res.status(201).json({ site, apiKey: registered.apiKey });
  });
  app.get("/v1/sites", admin, async (_req, res) => {
    const sites = await options.store.listSites();
    return res.json({
      sites: sites.map(({ apiKeyHash: _hash, ...site }) => site),
    });
  });
  app.get("/v1/policy", async (req, res) => {
    const key = req.header("x-siteshield-key");
    if (!key) return res.status(401).json({ error: "site authentication required" });
    const site = await options.store.findSiteByKey(key);
    if (!site) return res.status(401).json({ error: "site authentication required" });
    const rules = await options.store.listIpRules(site.id);
    return res.json({
      allow: rules.filter((rule) => rule.type === "allow").map((rule) => rule.ip),
      block: rules.filter((rule) => rule.type === "block").map((rule) => rule.ip),
    });
  });
  app.get("/v1/sites/:siteId/ip-rules", admin, async (req, res) => {
    const siteId = typeof req.params.siteId === "string" ? req.params.siteId : "";
    if (!/^site_[a-f0-9]{16}$/.test(siteId)) return res.status(400).json({ error: "invalid site id" });
    if (!(await options.store.listSites()).some((site) => site.id === siteId)) return res.status(404).json({ error: "site not found" });
    return res.json({ rules: await options.store.listIpRules(siteId) });
  });
  app.post("/v1/sites/:siteId/ip-rules", admin, async (req, res) => {
    const siteId = typeof req.params.siteId === "string" ? req.params.siteId : "";
    if (!/^site_[a-f0-9]{16}$/.test(siteId)) return res.status(400).json({ error: "invalid site id" });
    if (!(await options.store.listSites()).some((site) => site.id === siteId)) return res.status(404).json({ error: "site not found" });
    const ip = typeof req.body?.ip === "string" ? req.body.ip.trim() : "";
    const type = req.body?.type;
    if (!isIP(ip) || (type !== "allow" && type !== "block"))
      return res.status(400).json({ error: "enter one valid IPv4 or IPv6 address and choose allow or block" });
    const rule = await options.store.upsertIpRule(siteId, normalizeIp(ip), type);
    if (!rule) return res.status(404).json({ error: "site not found" });
    return res.status(201).json({ rule });
  });
  app.delete("/v1/sites/:siteId/ip-rules/:ruleId", admin, async (req, res) => {
    const siteId = typeof req.params.siteId === "string" ? req.params.siteId : "";
    const ruleId = typeof req.params.ruleId === "string" ? req.params.ruleId : "";
    if (!/^site_[a-f0-9]{16}$/.test(siteId) || !/^[a-f0-9-]{36}$/i.test(ruleId))
      return res.status(400).json({ error: "invalid site or rule id" });
    if (!(await options.store.deleteIpRule(siteId, ruleId)))
      return res.status(404).json({ error: "IP rule not found" });
    return res.json({ deleted: true, ruleId, siteId });
  });
  const ingest = async (req: Request, res: Response, events: unknown[]) => {
    const key = req.header("x-siteshield-key");
    if (!key)
      return res.status(401).json({ error: "site authentication required" });
    const site = await options.store.findSiteByKey(key);
    if (!site)
      return res.status(401).json({ error: "site authentication required" });
    const parsed = batchSchema.safeParse({ events });
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "invalid event batch", details: parsed.error.issues });
    if (parsed.data.events.length > options.maxBatch)
      return res
        .status(413)
        .json({ error: "batch limit exceeded", maxEvents: options.maxBatch });
    if (parsed.data.events.some((event) => event.siteId !== site.id))
      return res
        .status(403)
        .json({ error: "event belongs to a different site" });
    if (!(await options.limiter.consume(site.id)))
      return res
        .set("Retry-After", "60")
        .status(429)
        .json({ error: "ingestion rate limit exceeded" });
    const privacySafeEvents = parsed.data.events.map((event) => ({
      ...event,
      request: {
        ...event.request,
        ip: `sha256:${createHmac("sha256", options.ipHashSecret).update(event.request.ip).digest("hex")}`,
      },
    }));
    const result = await options.store.saveEvents(privacySafeEvents);
    const blockedIps = parsed.data.events
      // Reapply block rules for duplicate events too. Event persistence and IP-rule
      // persistence are separate writes, so a retry must be able to repair a
      // partial failure after the event row was committed.
      .filter((event) => event.decision === "block" && isIP(event.request.ip))
      .map((event) => normalizeIp(event.request.ip));
    if (blockedIps.length) await options.store.autoBlockIps(site.id, blockedIps);
    return res
      .status(202)
      .json({ accepted: result.accepted, duplicates: result.duplicates, received: parsed.data.events.length });
  };
  app.post("/v1/events/batch", async (req, res) => {
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "invalid event batch", details: parsed.error.issues });
    return ingest(req, res, parsed.data.events);
  });
  // Compatibility for package versions that report one event per request.
  app.post("/v1/events", async (req, res) => {
    const parsed = securityEventSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({
          error: "invalid security event",
          details: parsed.error.issues,
        });
    return ingest(req, res, [parsed.data]);
  });
  app.get("/v1/events", admin, async (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const siteId =
      typeof req.query.siteId === "string" ? req.query.siteId : undefined;
    return res.json({ events: await options.store.listEvents(limit, siteId) });
  });
  app.delete("/v1/sites/:siteId/events", admin, async (req, res) => {
    const siteId =
      typeof req.params.siteId === "string" ? req.params.siteId : "";
    if (!/^site_[a-f0-9]{16}$/.test(siteId))
      return res.status(400).json({ error: "invalid site id" });
    return res.json({
      deleted: await options.store.deleteEvents(siteId),
      siteId,
    });
  });
  app.delete("/v1/sites/:siteId", admin, async (req, res) => {
    const siteId =
      typeof req.params.siteId === "string" ? req.params.siteId : "";
    if (!/^site_[a-f0-9]{16}$/.test(siteId))
      return res.status(400).json({ error: "invalid site id" });
    const deleted = await options.store.deleteSite(siteId);
    if (!deleted) return res.status(404).json({ error: "site not found" });
    return res.json({ deleted: true, siteId });
  });
  app.use((_req, res) => res.status(404).json({ error: "route not found" }));
  app.use(
    (
      error: { status?: number },
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      const status =
        error.status === 413 ? 413 : error.status === 400 ? 400 : 500;
      return res
        .status(status)
        .json({
          error:
            status === 413
              ? "request body too large"
              : status === 400
                ? "invalid JSON body"
                : "internal server error",
        });
    },
  );
  return app;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
