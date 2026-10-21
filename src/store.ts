import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { isIP } from "node:net";
import type { SecurityEvent } from "./contracts.js";

export interface Site {
  id: string;
  name: string;
  origin: string;
  apiKeyHash: string;
  createdAt: string;
}
export type IpRuleType = "allow" | "block";
export interface IpRule {
  id: string;
  siteId: string;
  ip: string;
  type: IpRuleType;
  source: "manual" | "automatic";
  createdAt: string;
}
export interface EventStore {
  registerSite(input: {
    name: string;
    origin: string;
  }): Promise<{ site: Site; apiKey: string }>;
  listSites(): Promise<Site[]>;
  listIpRules(siteId: string): Promise<IpRule[]>;
  upsertIpRule(
    siteId: string,
    ip: string,
    type: IpRuleType,
  ): Promise<IpRule | undefined>;
  deleteIpRule(siteId: string, ruleId: string): Promise<boolean>;
  autoBlockIps(siteId: string, ips: string[]): Promise<void>;
  findSiteByKey(key: string): Promise<Site | undefined>;
  saveEvents(
    events: SecurityEvent[],
  ): Promise<{
    accepted: number;
    duplicates: number;
    acceptedEventIds: string[];
  }>;
  listEvents(limit: number, siteId?: string): Promise<SecurityEvent[]>;
  deleteEvents(siteId: string): Promise<number>;
  deleteSite(siteId: string): Promise<boolean>;
}

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
export function normalizeIp(ip: string): string {
  return isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname.slice(1, -1) : ip;
}
export function keysMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export class MemoryEventStore implements EventStore {
  private readonly sites: Site[] = [];
  private readonly events = new Map<string, SecurityEvent>();
  private readonly ipRules = new Map<string, IpRule>();
  async registerSite(input: { name: string; origin: string }) {
    const apiKey = `ss_${randomBytes(32).toString("hex")}`;
    const site: Site = {
      id: `site_${randomBytes(8).toString("hex")}`,
      ...input,
      apiKeyHash: hashKey(apiKey),
      createdAt: new Date().toISOString(),
    };
    this.sites.push(site);
    return { site, apiKey };
  }
  async findSiteByKey(key: string) {
    const hash = hashKey(key);
    return this.sites.find((site) => keysMatch(site.apiKeyHash, hash));
  }
  async listSites() {
    return [...this.sites];
  }
  async listIpRules(siteId: string) {
    return [...this.ipRules.values()]
      .filter((rule) => rule.siteId === siteId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async upsertIpRule(siteId: string, ip: string, type: IpRuleType) {
    ip = normalizeIp(ip);
    if (!this.sites.some((site) => site.id === siteId)) return undefined;
    const existing = [...this.ipRules.values()].find(
      (rule) => rule.siteId === siteId && rule.ip === ip,
    );
    const rule: IpRule = existing
      ? {
          ...existing,
          type,
          source: "manual",
          createdAt: new Date().toISOString(),
        }
      : {
          id: randomUUID(),
          siteId,
          ip,
          type,
          source: "manual",
          createdAt: new Date().toISOString(),
        };
    this.ipRules.set(rule.id, rule);
    return rule;
  }
  async deleteIpRule(siteId: string, ruleId: string) {
    const rule = this.ipRules.get(ruleId);
    return !!rule && rule.siteId === siteId && this.ipRules.delete(ruleId);
  }
  async autoBlockIps(siteId: string, ips: string[]) {
    for (const rawIp of ips) {
      const ip = normalizeIp(rawIp);
      if (
        [...this.ipRules.values()].some(
          (rule) => rule.siteId === siteId && rule.ip === ip,
        )
      )
        continue;
      const rule: IpRule = {
        id: randomUUID(),
        siteId,
        ip,
        type: "block",
        source: "automatic",
        createdAt: new Date().toISOString(),
      };
      this.ipRules.set(rule.id, rule);
    }
  }
  async saveEvents(events: SecurityEvent[]) {
    let accepted = 0;
    let duplicates = 0;
    const acceptedEventIds: string[] = [];
    for (const event of events) {
      if (this.events.has(event.id)) duplicates++;
      else {
        this.events.set(event.id, event);
        accepted++;
        acceptedEventIds.push(event.id);
      }
    }
    return { accepted, duplicates, acceptedEventIds };
  }
  async listEvents(limit: number, siteId?: string) {
    return [...this.events.values()]
      .filter((event) => !siteId || event.siteId === siteId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }
  async deleteEvents(siteId: string) {
    let deleted = 0;
    for (const [id, event] of this.events)
      if (event.siteId === siteId) {
        this.events.delete(id);
        deleted++;
      }
    return deleted;
  }
  async deleteSite(siteId: string) {
    const index = this.sites.findIndex((site) => site.id === siteId);
    if (index < 0) return false;
    this.sites.splice(index, 1);
    await this.deleteEvents(siteId);
    for (const [id, rule] of this.ipRules)
      if (rule.siteId === siteId) this.ipRules.delete(id);
    return true;
  }
}
