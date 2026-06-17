type CacheEntry = {
  data: unknown;
  timestamp: number;
};

const store = new Map<string, CacheEntry>();

export const TTL = {
  SHORT: 90_000,   // 90s: bills, dashboard data
  MEDIUM: 300_000, // 5m: user stats
};

export function getCache<T>(key: string, ttl: number): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttl) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache(key: string, data: unknown): void {
  store.set(key, {
    data,
    timestamp: Date.now(),
  });
}

export function bustCache(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}
