/**
 * Cache Service for Supabase Data
 * Reduces API calls by caching data in memory and localStorage
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
     * Get data from cache (memory first, then localStorage)
     */
    get<T>(key: string): T | null {
        // Check memory cache first
        const memoryEntry = this.memoryCache.get(key);
        if (memoryEntry && Date.now() < memoryEntry.expiresAt) {
            return memoryEntry.data as T;
        }

        // Check localStorage
        try {
            const stored = localStorage.getItem(`cache_${key}`);
            if (stored) {
                const entry: CacheEntry<T> = JSON.parse(stored);
                if (Date.now() < entry.expiresAt) {
                    // Restore to memory cache
                    this.memoryCache.set(key, entry);
                    return entry.data;
                } else {
                    // Expired, remove it
                    localStorage.removeItem(`cache_${key}`);
                }
            }
        } catch (e) {
            console.warn('Cache read error:', e);
        }

        return null;
    }

    /**
     * Set data in cache (both memory and localStorage)
     */
    set<T>(key: string, data: T, ttl: number = this.defaultTTL): void {
        const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now(),
            expiresAt: Date.now() + ttl
        };

        // Store in memory
        this.memoryCache.set(key, entry);

        // Store in localStorage for persistence
        try {
            localStorage.setItem(`cache_${key}`, JSON.stringify(entry));
        } catch (e) {
            console.warn('Cache write error (localStorage may be full):', e);
        }
    }

    /**
     * Invalidate specific cache key
     */
    invalidate(key: string): void {
        this.memoryCache.delete(key);
        try {
            localStorage.removeItem(`cache_${key}`);
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

        // localStorage
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('cache_') && key.includes(pattern)) {
                    localStorage.removeItem(key);
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
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('cache_')) {
                    localStorage.removeItem(key);
                }
            });
        } catch (e) {
            console.warn('Cache clear error:', e);
        }
    }

    /**
     * Get cache stats
     */
    getStats(): { memoryCacheSize: number; localStorageCacheKeys: number } {
        let localStorageCacheKeys = 0;
        try {
            const keys = Object.keys(localStorage);
            localStorageCacheKeys = keys.filter(k => k.startsWith('cache_')).length;
        } catch (e) {
            // Ignore
        }
        return {
            memoryCacheSize: this.memoryCache.size,
            localStorageCacheKeys
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

/**
 * Cached fetch wrapper for Supabase queries
 * Only fetches from Supabase if cache is stale or missing
 */
export async function cachedFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = CACHE_TTL.MEDIUM
): Promise<T> {
    // Try to get from cache first
    const cached = cacheService.get<T>(key);
    if (cached !== null) {
        return cached;
    }

    // Cache miss - fetch from Supabase
    const data = await fetchFn();

    // Store in cache
    cacheService.set(key, data, ttl);

    return data;
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

export default cacheService;
