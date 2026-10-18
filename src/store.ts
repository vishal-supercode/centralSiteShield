import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SecurityEvent } from './contracts.js';

export interface Site { id: string; name: string; origin: string; apiKeyHash: string; createdAt: string; }
export interface EventStore {
  registerSite(input: { name: string; origin: string }): Promise<{ site: Site; apiKey: string }>;
  listSites(): Promise<Site[]>;
  findSiteByKey(key: string): Promise<Site | undefined>;
  saveEvents(events: SecurityEvent[]): Promise<{ accepted: number; duplicates: number }>;
  listEvents(limit: number, siteId?: string): Promise<SecurityEvent[]>;
  deleteEvents(siteId: string): Promise<number>;
  deleteSite(siteId: string): Promise<boolean>;
}

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');
export function keysMatch(a: string, b: string): boolean {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export class MemoryEventStore implements EventStore {
  private readonly sites: Site[] = [];
  private readonly events = new Map<string, SecurityEvent>();
  async registerSite(input: { name: string; origin: string }) {
    const apiKey = `ss_${randomBytes(32).toString('hex')}`;
    const site: Site = { id: `site_${randomBytes(8).toString('hex')}`, ...input, apiKeyHash: hashKey(apiKey), createdAt: new Date().toISOString() };
    this.sites.push(site);
    return { site, apiKey };
  }
  async findSiteByKey(key: string) { const hash = hashKey(key); return this.sites.find((site) => keysMatch(site.apiKeyHash, hash)); }
  async listSites() { return [...this.sites]; }
  async saveEvents(events: SecurityEvent[]) {
    let accepted = 0; let duplicates = 0;
    for (const event of events) { if (this.events.has(event.id)) duplicates++; else { this.events.set(event.id, event); accepted++; } }
    return { accepted, duplicates };
  }
  async listEvents(limit: number, siteId?: string) {
    return [...this.events.values()].filter((event) => !siteId || event.siteId === siteId).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
  }
  async deleteEvents(siteId: string) {
    let deleted = 0;
    for (const [id, event] of this.events) if (event.siteId === siteId) { this.events.delete(id); deleted++; }
    return deleted;
  }
  async deleteSite(siteId: string) {
    const index = this.sites.findIndex((site) => site.id === siteId);
    if (index < 0) return false;
    this.sites.splice(index, 1);
    await this.deleteEvents(siteId);
    return true;
  }
}
