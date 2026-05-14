import Redis from 'ioredis';

// 配置来源：环境变量
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_ENABLED = process.env.REDIS_ENABLED !== 'false';

class CacheService {
  private redis: Redis | null = null;
  private memoryCache: Map<string, { value: any; expiry: number }> = new Map();

  constructor() {
    if (REDIS_ENABLED) {
      this.redis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => Math.min(times * 100, 3000),
      });
      this.redis.on('error', (err) => console.error('Redis error:', err));
    }
  }

  private isRedisReady(): boolean {
    return this.redis !== null && this.redis.status === 'ready';
  }

  // =========== GET ===========
  async get(key: string): Promise<string | null> {
    if (this.isRedisReady()) return this.redis!.get(key);
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) { this.memoryCache.delete(key); return null; }
    return entry.value;
  }

  // =========== SET ===========
  async set(key: string, value: string, ttlSeconds: number = 86400): Promise<void> {
    if (this.isRedisReady()) {
      await this.redis!.set(key, value, 'EX', ttlSeconds);
    } else {
      this.memoryCache.set(key, { value, expiry: Date.now() + ttlSeconds * 1000 });
    }
  }

  // =========== DELETE ===========
  async del(key: string): Promise<void> {
    if (this.isRedisReady()) await this.redis!.del(key);
    else this.memoryCache.delete(key);
  }

  // =========== HASH ===========
  async hget(key: string, field: string): Promise<string | null> {
    if (this.isRedisReady()) return this.redis!.hget(key, field);
    const entry = this.memoryCache.get(`${key}:${field}`);
    return entry?.value ?? null;
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    if (this.isRedisReady()) await this.redis!.hset(key, field, value);
    else this.memoryCache.set(`${key}:${field}`, { value, expiry: Infinity });
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    if (this.isRedisReady()) return this.redis!.hgetall(key);
    return null; // 简单模式不支持 hgetall
  }

  async hmset(key: string, obj: Record<string, string>): Promise<void> {
    if (this.isRedisReady()) await this.redis!.hmset(key, obj);
    else Object.entries(obj).forEach(([f, v]) => this.memoryCache.set(`${key}:${f}`, { value: v, expiry: Infinity }));
  }

  async hdel(key: string, field: string): Promise<void> {
    if (this.isRedisReady()) await this.redis!.hdel(key, field);
    else this.memoryCache.delete(`${key}:${field}`);
  }

  // =========== EXISTS ===========
  async exists(key: string): Promise<boolean> {
    if (this.isRedisReady()) return (await this.redis!.exists(key)) === 1;
    return this.memoryCache.has(key);
  }

  // =========== TTL ===========
  async ttl(key: string): Promise<number> {
    if (this.isRedisReady()) return this.redis!.ttl(key);
    const entry = this.memoryCache.get(key);
    if (!entry) return -2;
    return Math.max(0, Math.floor((entry.expiry - Date.now()) / 1000));
  }

  // =========== FLUSH ALL ===========
  async flushAll(): Promise<void> {
    if (this.isRedisReady()) await this.redis!.flushall();
    else this.memoryCache.clear();
  }

  // =========== INCR (用于限流) ===========
  async incr(key: string): Promise<number> {
    if (this.isRedisReady()) return this.redis!.incr(key);
    const val = (parseInt(this.memoryCache.get(key)?.value ?? '0') + 1).toString();
    this.memoryCache.set(key, { value: val, expiry: Infinity });
    return parseInt(val);
  }
}

// 单例导出
export const cache = new CacheService();
