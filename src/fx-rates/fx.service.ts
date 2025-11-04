// src/fx/fx.service.ts
import { Injectable, OnModuleInit, Logger, OnModuleDestroy } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import Redis, { Redis as RedisClient } from 'ioredis';

@Injectable()
export class FxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FxService.name);
  private redis: RedisClient | null = null;
  private readonly ttlSeconds: number;
  private memCache = new Map<string, { rate: number; expiresAt: number }>();

  constructor(private readonly http: HttpService) {
    this.ttlSeconds = Number(process.env.FX_RATE_TTL_SECONDS ?? 3600);
  }

  private cacheKey(base: string, target: string) {
    return `fx:${base.toUpperCase()}:${target.toUpperCase()}`;
  }

  onModuleInit() {
    const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableAutoPipelining: true,
        // typed retryStrategy
        retryStrategy(times: number) {
          const delay = Math.min(2000 + times * 200, 30_000);
          return delay;
        },
      });

      this.redis.on('connect', () => this.logger.log(`Redis client connected (${redisUrl})`));
      this.redis.on('ready', () => this.logger.log('Redis ready'));
      this.redis.on('error', (err: Error) => {
        this.logger.error(`Redis error: ${String(err?.message ?? err)}`);
      });
      this.redis.on('close', () => this.logger.warn('Redis connection closed'));
      // typed reconnecting callback
      this.redis.on('reconnecting', (delay: number) => this.logger.warn(`Redis reconnecting in ${delay}ms`));
    } catch (err: any) {
      this.logger.warn('Failed to initialize Redis client: ' + String(err?.message ?? err));
      this.redis = null;
    }

    // preload one rate (best-effort)
    this.getRate('USD', 'KES').then((r) => this.logger.log(`Initial USD->KES = ${r}`)).catch((e) =>
      this.logger.warn('Initial FX preload failed: ' + String(e))
    );
  }

  async onModuleDestroy() {
    try {
      if (this.redis) await this.redis.quit();
    } catch (e) {
      // ignore
    }
  }

  private memGet(key: string): number | null {
    const entry = this.memCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memCache.delete(key);
      return null;
    }
    return entry.rate;
  }

  private memSet(key: string, rate: number) {
    this.memCache.set(key, { rate, expiresAt: Date.now() + this.ttlSeconds * 1000 });
  }

  async getRate(base = 'USD', target = 'KES'): Promise<number> {
    const key = this.cacheKey(base, target);

    // 1) Try Redis if available
    if (this.redis) {
      try {
        const cached = await this.redis.get(key);
        if (cached) {
          const n = Number(cached);
          if (!Number.isNaN(n) && n > 0) {
            this.logger.debug(`FX hit (redis) ${key}=${n}`);
            this.memSet(key, n);
            return n;
          }
        }
      } catch (err: any) {
        this.logger.warn('Redis GET failed, falling back to mem cache/provider: ' + String(err?.message ?? err));
      }
    }

    // 2) Try in-memory cache
    const mem = this.memGet(key);
    if (mem) {
      this.logger.debug(`FX hit (mem) ${key}=${mem}`);
      return mem;
    }

    // 3) Fetch from provider(s)
    let rate: number | undefined;

    // helper to call provider and extract data safely
    const fetchFromUrl = async (url: string) => {
      this.logger.debug(`Fetching FX from ${url}`);
      try {
        // explicitly type response as any so .data is accessible
        const resp = await lastValueFrom(this.http.get<any>(url));
        // resp is AxiosResponse<any>
        const data = resp?.data ?? {};
        return data;
      } catch (err: any) {
        this.logger.warn(`HTTP fetch failed (${url}): ${String(err?.message ?? err)}`);
        return null;
      }
    };

    try {
      const url = process.env.EXCHANGE_RATE_API_KEY
        ? `https://v6.exchangerate-api.com/v6/${process.env.EXCHANGE_RATE_API_KEY}/latest/${encodeURIComponent(base)}`
        : `https://api.exchangerate.host/latest?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(target)}`;

      const data = await fetchFromUrl(url);
      if (data) {
        rate = data?.rates?.[target] ?? data?.conversion_rates?.[target];
        if (typeof rate === 'string') rate = Number(rate);
      }
    } catch (err: any) {
      this.logger.warn('Primary FX provider failed: ' + String(err?.message ?? err));
    }

    // fallback provider
    if (!rate) {
      try {
        const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;
        const data = await fetchFromUrl(url);
        if (data) {
          rate = data?.rates?.[target] ?? data?.conversion_rates?.[target];
          if (typeof rate === 'string') rate = Number(rate);
        }
      } catch (err: any) {
        this.logger.warn('Fallback FX provider failed: ' + String(err?.message ?? err));
      }
    }

    // if we got a valid rate, cache it
    if (rate && !Number.isNaN(Number(rate)) && Number(rate) > 0) {
      try {
        this.memSet(key, Number(rate));
        if (this.redis) {
          await this.redis.set(key, String(Number(rate)), 'EX', this.ttlSeconds);
          this.logger.log(`Cached FX ${key}=${rate} (redis ttl=${this.ttlSeconds}s)`);
        } else {
          this.logger.log(`Cached FX ${key}=${rate} (mem only)`);
        }
      } catch (err: any) {
        this.logger.warn('Failed to cache FX to redis: ' + String(err?.message ?? err));
      }
      return Number(rate);
    }

    // mem fallback
    const mem2 = this.memGet(key);
    if (mem2) {
      this.logger.warn(`Using stale mem cache for ${key}=${mem2}`);
      return mem2;
    }

    // final fallback
    const fallback = Number(process.env.FX_FALLBACK_RATE ?? 130);
    this.logger.error(`No FX rate available for ${base}->${target}. Returning fallback ${fallback}`);
    return fallback;
  }

  async setRate(base: string, target: string, rate: number, ttlSeconds?: number) {
    const key = this.cacheKey(base, target);
    const ttl = Number(ttlSeconds ?? this.ttlSeconds);
    this.memSet(key, rate);
    if (this.redis) {
      try {
        await this.redis.set(key, String(rate), 'EX', ttl);
      } catch (err: any) {
        this.logger.warn('Failed to set rate in redis: ' + String(err?.message ?? err));
      }
    }
    this.logger.log(`Manually set FX ${key}=${rate} (ttl=${ttl}s)`);
    return { key, rate, ttl };
  }

  async refreshRate(base = 'USD', target = 'KES') {
    const key = this.cacheKey(base, target);
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch (err: any) {
        this.logger.warn('Redis del failed during refresh: ' + String(err?.message ?? err));
      }
    }
    return this.getRate(base, target);
  }
}
