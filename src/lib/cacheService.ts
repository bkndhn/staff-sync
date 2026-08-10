/**
 * Cache Service for Supabase Data
 * Reduces API calls by caching data in memory and sessionStorage
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    expiresAt: number;
}

interface _CacheConfig {
    ttl: number; // Time to live in milliseconds
    key: string;
}

class CacheService {
    private memoryCache: Map<string, CacheEntry<any>> = new Map();
    private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes default

    /**
     * Get data from cache (memory first, then sessionStorage)
     */
    get<T>(key: string): T | null {
        // Check memory cache first
        const memoryEntry = this.memoryCache.get(key);
        if (memoryEntry && Date.now() < memoryEntry.expiresAt) {
            return memoryEntry.data as T;
        }

        // Check sessionStorage
        try {
            const stored = sessionStorage.getItem(`cache_${key}`);
            if (stored) {
                const entry: CacheEntry<T> = JSON.parse(stored);
                if (Date.now() < entry.expiresAt) {
                    // Restore to memory cache
                    this.memoryCache.set(key, entry);
                    return entry.data;
                } else {
                    // Expired, remove it
                    sessionStorage.removeItem(`cache_${key}`);
                }
            }
        } catch (e) {
            console.warn('Cache read error:', e);
        }

        return null;
    }

    /**
     * Set data in cache (both memory and sessionStorage)
     */
    set<T>(key: string, data: T, ttl: number = this.defaultTTL): void {
        const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now(),
            expiresAt: Date.now() + ttl
        };

        // Store in memory
        this.memoryCache.set(key, entry);

        // Store in sessionStorage for persistence
        try {
            sessionStorage.setItem(`cache_${key}`, JSON.stringify(entry));
        } catch (e) {
            console.warn('Cache write error (sessionStorage may be full):', e);
        }
    }

    /**
     * Invalidate specific cache key
     */
    invalidate(key: string): void {
        this.memoryCache.delete(key);
        try {
            sessionStorage.removeItem(`cache_${key}`);
        } catch (e) {
            console.warn('Cache invalidate error:', e);
        }
    }

    /**
     * Invalidate all cache keys that match a pattern
     */
    invalidatePattern(pattern: string): void {
        // Memory cache
        const keysToDelete: string[] = [];
        this.memoryCache.forEach((_, key) => {
            if (key.includes(pattern)) {
                keysToDelete.push(key);
            }
        });
        keysToDelete.forEach(key => this.memoryCache.delete(key));

        // sessionStorage
        try {
            const keys = Object.keys(sessionStorage);
            keys.forEach(key => {
                if (key.startsWith('cache_') && key.includes(pattern)) {
                    sessionStorage.removeItem(key);
                }
            });
        } catch (e) {
            console.warn('Cache pattern invalidate error:', e);
        }
    }

    /**
     * Clear all cache
     */
    clearAll(): void {
        this.memoryCache.clear();
        try {
            const keys = Object.keys(sessionStorage);
            keys.forEach(key => {
                if (key.startsWith('cache_')) {
                    sessionStorage.removeItem(key);
                }
            });
        } catch (e) {
            console.warn('Cache clear error:', e);
        }
    }

    /**
     * Get cache stats
     */
    getStats(): { memoryCacheSize: number; sessionStorageCacheKeys: number } {
        let sessionStorageCacheKeys = 0;
        try {
            const keys = Object.keys(sessionStorage);
            sessionStorageCacheKeys = keys.filter(k => k.startsWith('cache_')).length;
        } catch (e) {
            // Ignore
        }
        return {
            memoryCacheSize: this.memoryCache.size,
            sessionStorageCacheKeys
        };
    }
}

// Singleton instance
export const cacheService = new CacheService();

// Cache keys for different data types
export const CACHE_KEYS = {
    STAFF: 'staff_data',
    ATTENDANCE: 'attendance_data',
    ADVANCES: 'advances_data',
    OLD_STAFF: 'old_staff_data',
    SALARY_HIKES: 'salary_hikes_data',
    SETTINGS: 'settings_data',
    PART_TIME_ADVANCES: 'part_time_advances_data'
};

// Cache TTL configurations (in milliseconds)
export const CACHE_TTL = {
    SHORT: 1 * 60 * 1000,      // 1 minute - for frequently changing data
    MEDIUM: 5 * 60 * 1000,     // 5 minutes - default
    LONG: 15 * 60 * 1000,      // 15 minutes - for rarely changing data
    VERY_LONG: 60 * 60 * 1000  // 1 hour - for static data
};

export const cacheEventTarget = new EventTarget();
const inFlightFetches = new Map<string, Promise<any>>();

/**
 * Cached fetch wrapper for Supabase queries
 * Implements Stale-While-Revalidate (SWR) logic.
 * Returns cache instantly if available, but fetches fresh data in background.
 */
export async function cachedFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = CACHE_TTL.MEDIUM,
    forceRefresh: boolean = false
): Promise<T> {
    const cached = cacheService.get<T>(key);

    const doFetch = async () => {
        if (inFlightFetches.has(key)) {
            return inFlightFetches.get(key);
        }
        
        const promise = (async () => {
            try {
                const freshData = await fetchFn();
                const freshStr = JSON.stringify(freshData);
                const cachedStr = JSON.stringify(cached);
                
                // Only update and emit if data actually changed
                if (freshStr !== cachedStr) {
                    cacheService.set(key, freshData, ttl);
                    cacheEventTarget.dispatchEvent(new CustomEvent('cache-update', {
                        detail: { key, data: freshData }
                    }));
                }
                return freshData;
            } catch (e) {
                console.warn(`Background fetch failed for ${key}`, e);
                throw e;
            } finally {
                inFlightFetches.delete(key);
            }
        })();
        
        inFlightFetches.set(key, promise);
        return promise;
    };

    if (cached !== null && !forceRefresh) {
        doFetch().catch(() => {}); // Fire and forget background fetch
        return cached;
    }

    return await doFetch();
}

/**
 * Debounced save wrapper to reduce write operations
 */
const saveTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

export function debouncedSave(
    key: string,
    saveFn: () => Promise<void>,
    delay: number = 1000
): void {
    // Clear existing timer
    const existingTimer = saveTimers.get(key);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(async () => {
        try {
            await saveFn();
            saveTimers.delete(key);
        } catch (error) {
            console.error(`Debounced save error for ${key}:`, error);
        }
    }, delay);

    saveTimers.set(key, timer);
}

export async function hardResetAppCache(): Promise<void> {
  try {
    cacheService.clearAll();
    localStorage.clear();
    sessionStorage.clear();

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    }

    if ('indexedDB' in window && (window.indexedDB as any).databases) {
      try {
        const dbs = await (window.indexedDB as any).databases();
        for (const dbInfo of dbs) {
          if (dbInfo.name) window.indexedDB.deleteDatabase(dbInfo.name);
        }
      } catch { /* ignore */ }
    }
  } catch (err) {
    console.error('Hard reset error:', err);
  } finally {
    window.location.href = window.location.origin + window.location.pathname + '?reset=' + Date.now();
  }
}

export default cacheService;
