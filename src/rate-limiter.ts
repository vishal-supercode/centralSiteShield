export interface IngestionLimiter {
  consume(siteId: string): Promise<boolean>;
}
export class MemoryIngestionLimiter implements IngestionLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly windowMs = 60_000,
    private readonly now = Date.now,
  ) {}
  async consume(siteId: string) {
    const cutoff = this.now() - this.windowMs;
    const current = (this.hits.get(siteId) ?? []).filter((at) => at > cutoff);
    if (current.length >= this.max) {
      this.hits.set(siteId, current);
      return false;
    }
    current.push(this.now());
    this.hits.set(siteId, current);
    return true;
  }
}

export class RedisIngestionLimiter implements IngestionLimiter {
  constructor(
    private readonly redis: {
      eval(
        script: string,
        options: { keys: string[]; arguments: string[] },
      ): Promise<unknown>;
    },
    private readonly max: number,
    private readonly windowMs = 60_000,
  ) {}
  async consume(siteId: string) {
    const result = await this.redis.eval(
      `local count=redis.call('INCR',KEYS[1]); if count==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); end; return count`,
      {
        keys: [`siteshield:ingest:${siteId}`],
        arguments: [String(this.windowMs)],
      },
    );
    return Number(result) <= this.max;
  }
}
