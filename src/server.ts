import 'dotenv/config';
import { createServer } from 'node:http';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { createApp } from './app.js';
import { PostgresEventStore } from './postgres-store.js';
import { RedisIngestionLimiter } from './rate-limiter.js';

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '127.0.0.1';
const adminToken = process.env.SITESHIELD_ADMIN_TOKEN ?? '';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required');
if (!adminToken || adminToken.startsWith('replace-')) throw new Error('Set a real SITESHIELD_ADMIN_TOKEN in .env');
const ipHashSecret = process.env.EVENT_IP_HASH_SECRET ?? '';
if (ipHashSecret.length < 32 || ipHashSecret.startsWith('replace-')) throw new Error('Set a random EVENT_IP_HASH_SECRET of at least 32 characters in .env');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000 });
const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', (error) => console.error('Redis connection error:', error.message));
await redis.connect();
const app = createApp({
  store: new PostgresEventStore(pool),
  limiter: new RedisIngestionLimiter(redis, Number(process.env.EVENT_RATE_LIMIT_PER_MINUTE ?? 600)),
  adminToken,
  ipHashSecret,
  maxBatch: Number(process.env.EVENT_BATCH_MAX ?? 50),
  bodyLimitBytes: Number(process.env.EVENT_BODY_LIMIT_BYTES ?? 262144),
});
const server = createServer(app).listen(port, host, () => console.log(`SiteShield central API listening on http://${host}:${port}`));
const shutdown = async () => {
  server.close();
  await Promise.all([pool.end(), redis.quit()]);
};
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
