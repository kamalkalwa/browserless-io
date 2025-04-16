import { Readable } from 'stream';

/**
 * Interface for a cache provider capable of storing and retrieving streams.
 */
export interface ICacheProvider {
    /**
     * Retrieves a readable stream from the cache for the given key.
     * @param key The cache key (e.g., derived from the URL).
     * @returns A Readable stream if found, otherwise null.
     */
    get(key: string): Promise<Readable | null>;

    /**
     * Stores a readable stream in the cache under the given key.
     * The implementation should handle consuming the stream and storing its content.
     * @param key The cache key.
     * @param sourceStream The source readable stream to cache.
     * @param ttlSeconds Time-to-live for the cache entry in seconds.
     * @returns A promise that resolves when caching setup is complete (doesn't necessarily wait for stream end).
     */
    set(key: string, sourceStream: Readable, ttlSeconds: number): Promise<void>;
}