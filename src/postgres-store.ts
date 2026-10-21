import { randomBytes, createHash } from "node:crypto";
import type { Pool } from "pg";
import type { SecurityEvent } from "./contracts.js";
import { normalizeIp, type EventStore, type IpRule, type IpRuleType, type Site } from "./store.js";

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
export class PostgresEventStore implements EventStore {
  constructor(private readonly pool: Pool) {}
  async registerSite(input: { name: string; origin: string }) {
    const apiKey = `ss_${randomBytes(32).toString("hex")}`;
    const id = `site_${randomBytes(8).toString("hex")}`;
    const result = await this.pool.query(
      "INSERT INTO sites (id,name,origin,api_key_hash) VALUES ($1,$2,$3,$4) RETURNING id,name,origin,api_key_hash,created_at",
      [id, input.name, input.origin, hashKey(apiKey)],
    );
    return { site: mapSite(result.rows[0]), apiKey };
  }
  async findSiteByKey(key: string) {
    const result = await this.pool.query(
      "SELECT id,name,origin,api_key_hash,created_at FROM sites WHERE api_key_hash=$1",
      [hashKey(key)],
    );
    return result.rows[0] ? mapSite(result.rows[0]) : undefined;
  }
  async listSites() {
    const result = await this.pool.query(
      "SELECT id,name,origin,api_key_hash,created_at FROM sites ORDER BY created_at DESC",
    );
    return result.rows.map(mapSite);
  }
  async listIpRules(siteId: string) {
    const result = await this.pool.query(
      "SELECT id,site_id,ip::text,type,source,created_at FROM site_ip_rules WHERE site_id=$1 ORDER BY created_at ASC",
      [siteId],
    );
    return result.rows.map(mapIpRule);
  }
  async upsertIpRule(siteId: string, ip: string, type: IpRuleType) {
    ip = normalizeIp(ip);
    const result = await this.pool.query(
      `INSERT INTO site_ip_rules (site_id,ip,type,source) VALUES ($1,$2::inet,$3,'manual')
       ON CONFLICT (site_id,ip) DO UPDATE SET type=EXCLUDED.type,source='manual',created_at=now()
       RETURNING id,site_id,ip::text,type,source,created_at`,
      [siteId, ip, type],
    );
    return result.rows[0] ? mapIpRule(result.rows[0]) : undefined;
  }
  async deleteIpRule(siteId: string, ruleId: string) {
    const result = await this.pool.query(
      "DELETE FROM site_ip_rules WHERE site_id=$1 AND id=$2",
      [siteId, ruleId],
    );
    return (result.rowCount ?? 0) > 0;
  }
  async autoBlockIps(siteId: string, ips: string[]) {
    for (const rawIp of ips) {
      const ip = normalizeIp(rawIp);
      await this.pool.query(
        `INSERT INTO site_ip_rules (site_id,ip,type,source) VALUES ($1,$2::inet,'block','automatic')
         ON CONFLICT (site_id,ip) DO NOTHING`,
        [siteId, ip],
      );
    }
  }
  async saveEvents(events: SecurityEvent[]) {
    const client = await this.pool.connect();
    let accepted = 0;
    const acceptedEventIds: string[] = [];
    try {
      await client.query("BEGIN");
      for (const event of events) {
        const result = await client.query(
          `INSERT INTO security_events (id,site_id,occurred_at,decision,score,reasons,request,counters)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING RETURNING id`,
          [
            event.id,
            event.siteId,
            event.timestamp,
            event.decision,
            event.score,
            JSON.stringify(event.reasons),
            JSON.stringify(event.request),
            JSON.stringify(event.counters),
          ],
        );
        accepted += result.rowCount ?? 0;
        if (result.rows[0]?.id) acceptedEventIds.push(String(result.rows[0].id));
      }
      await client.query("COMMIT");
      return { accepted, duplicates: events.length - accepted, acceptedEventIds };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async listEvents(limit: number, siteId?: string) {
    const result = await this.pool.query(
      `SELECT id,site_id,occurred_at,decision,score,reasons,request,counters FROM security_events
      WHERE ($2::text IS NULL OR site_id=$2) ORDER BY occurred_at DESC LIMIT $1`,
      [limit, siteId ?? null],
    );
    return result.rows.map((row) => ({
      id: row.id,
      siteId: row.site_id,
      timestamp: new Date(row.occurred_at).toISOString(),
      decision: row.decision,
      score: row.score,
      reasons: row.reasons,
      request: row.request,
      counters: row.counters,
    })) as SecurityEvent[];
  }
  async deleteEvents(siteId: string) {
    const result = await this.pool.query(
      "DELETE FROM security_events WHERE site_id=$1",
      [siteId],
    );
    return result.rowCount ?? 0;
  }
  async deleteSite(siteId: string) {
    const result = await this.pool.query("DELETE FROM sites WHERE id=$1", [
      siteId,
    ]);
    return (result.rowCount ?? 0) > 0;
  }
}
function mapSite(row: Record<string, unknown>): Site {
  return {
    id: String(row.id),
    name: String(row.name),
    origin: String(row.origin),
    apiKeyHash: String(row.api_key_hash),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}
function mapIpRule(row: Record<string, unknown>): IpRule {
  return {
    id: String(row.id),
    siteId: String(row.site_id),
    ip: String(row.ip),
    type: String(row.type) as IpRuleType,
    source: String(row.source) as IpRule["source"],
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}
