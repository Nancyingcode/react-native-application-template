export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryCache implements CacheStore {
  private readonly values = new Map<string, CacheEntry<unknown>>();

  constructor(private readonly now: () => number = Date.now) {}

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.values.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.values.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.values.set(key, {value, expiresAt: this.now() + ttlMs});
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }

  async clear(): Promise<void> {
    this.values.clear();
  }
}
