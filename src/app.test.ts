import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { MemoryEventStore } from './store.js';
import { MemoryIngestionLimiter } from './rate-limiter.js';

async function listen(app: ReturnType<typeof createApp>) {
  const server = createServer(app).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, base: `http://127.0.0.1:${address.port}` };
}
const auth = { authorization: 'Bearer admin-test' };
function event(siteId: string, id = '00000000-0000-4000-8000-000000000001') {
  return { id, siteId, timestamp: new Date().toISOString(), request: { siteId, ip: '203.0.113.4', method: 'GET', path: '/api/test' }, decision: 'block', score: 5, reasons: ['request rate exceeded'], counters: { requests: 10, loginAttempts: 0 } };
}

test('batch endpoint authenticates sites, validates events and persists idempotently', async () => {
  const store = new MemoryEventStore();
  const app = createApp({ store, limiter: new MemoryIngestionLimiter(100), adminToken: 'admin-test', ipHashSecret: 'test-secret-at-least-32-characters-long', maxBatch: 10, bodyLimitBytes: 100_000 });
  const { server, base } = await listen(app);
  try {
    const registration = await fetch(`${base}/v1/sites`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Demo', origin: 'https://demo.example' }) });
    assert.equal(registration.status, 201);
    const { site, apiKey } = await registration.json() as { site: { id: string }; apiKey: string };
    const listedSites = await fetch(`${base}/v1/sites`, { headers: auth });
    assert.equal(((await listedSites.json()) as { sites: unknown[] }).sites.length, 1);
    const headers = { 'content-type': 'application/json', 'x-siteshield-key': apiKey };
    const batch = [event(site.id)];
    const accepted = await fetch(`${base}/v1/events/batch`, { method: 'POST', headers, body: JSON.stringify({ events: batch }) });
    assert.deepEqual(await accepted.json(), { accepted: 1, duplicates: 0, received: 1 });
    const duplicate = await fetch(`${base}/v1/events/batch`, { method: 'POST', headers, body: JSON.stringify({ events: batch }) });
    assert.deepEqual(await duplicate.json(), { accepted: 0, duplicates: 1, received: 1 });
    const listed = await fetch(`${base}/v1/events`, { headers: auth });
    const stored = ((await listed.json()) as { events: Array<{ request: { ip: string } }> }).events;
    assert.equal(stored.length, 1);
    assert.match(stored[0].request.ip, /^sha256:/);
    assert.notEqual(stored[0].request.ip, '203.0.113.4');
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('rejects unauthenticated, cross-site, and oversized batches', async () => {
  const store = new MemoryEventStore();
  const app = createApp({ store, limiter: new MemoryIngestionLimiter(100), adminToken: 'admin-test', ipHashSecret: 'test-secret-at-least-32-characters-long', maxBatch: 1, bodyLimitBytes: 100_000 });
  const { server, base } = await listen(app);
  try {
    const created = await store.registerSite({ name: 'Demo', origin: 'https://demo.example' });
    const unauth = await fetch(`${base}/v1/events/batch`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events: [event(created.site.id)] }) });
    assert.equal(unauth.status, 401);
    const headers = { 'content-type': 'application/json', 'x-siteshield-key': created.apiKey };
    const crossSite = await fetch(`${base}/v1/events/batch`, { method: 'POST', headers, body: JSON.stringify({ events: [event('site_another')] }) });
    assert.equal(crossSite.status, 403);
    const tooMany = await fetch(`${base}/v1/events/batch`, { method: 'POST', headers, body: JSON.stringify({ events: [event(created.site.id), event(created.site.id, '00000000-0000-4000-8000-000000000002')] }) });
    assert.equal(tooMany.status, 413);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('ingestion limiter returns 429 after its per-site quota', async () => {
  let now = 1_000;
  const store = new MemoryEventStore();
  const limiter = new MemoryIngestionLimiter(1, 60_000, () => now);
  const app = createApp({ store, limiter, adminToken: 'admin-test', ipHashSecret: 'test-secret-at-least-32-characters-long', maxBatch: 10, bodyLimitBytes: 100_000 });
  const { server, base } = await listen(app);
  try {
    const created = await store.registerSite({ name: 'Demo', origin: 'https://demo.example' });
    const headers = { 'content-type': 'application/json', 'x-siteshield-key': created.apiKey };
    const first = await fetch(`${base}/v1/events/batch`, { method: 'POST', headers, body: JSON.stringify({ events: [event(created.site.id)] }) });
    assert.equal(first.status, 202);
    const second = await fetch(`${base}/v1/events/batch`, { method: 'POST', headers, body: JSON.stringify({ events: [event(created.site.id, '00000000-0000-4000-8000-000000000002')] }) });
    assert.equal(second.status, 429);
    now += 60_001;
    const third = await fetch(`${base}/v1/events/batch`, { method: 'POST', headers, body: JSON.stringify({ events: [event(created.site.id, '00000000-0000-4000-8000-000000000003')] }) });
    assert.equal(third.status, 202);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
