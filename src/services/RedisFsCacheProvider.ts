import { ICacheProvider } from '@/interfaces/ICacheProvider';
import { redis } from '@/lib/redis'; // Assuming singleton redis instance
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Readable, PassThrough } from 'stream';
import { pipeline } from 'stream/promises';

// Configuration (Consider moving to a central config)
const CACHE_DIR = path.join(process.cwd(), '.pdfcache');
const CACHE_PREFIX = 'pdfcache:';

export class RedisFsCacheProvider implements ICacheProvider {
    private cacheDir: string;

    constructor(cacheDir: string = CACHE_DIR) {
        this.cacheDir = cacheDir;
        this.ensureCacheDirExists();
    }

    private async ensureCacheDirExists(): Promise<void> {
        try {
            await fsp.access(this.cacheDir);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                console.log(`Cache directory ${this.cacheDir} not found, creating...`);
                await fsp.mkdir(this.cacheDir, { recursive: true });
            } else {
                console.error(`Error accessing cache directory ${this.cacheDir}:`, error);
                throw error; // Re-throw if it's not a "not found" error
            }
        }
    }

    private getCacheKey(key: string): string {
        return `${CACHE_PREFIX}${key}`;
    }

    private generateCacheFilePath(key: string): string {
        // Sanitize key to be filename-safe
        const filename = key.replace(/[^a-z0-9_-]/gi, '_').substring(0, 200);
        return path.join(this.cacheDir, `${filename}_${Date.now()}.pdf`);
    }

    async get(key: string): Promise<Readable | null> {
        const redisKey = this.getCacheKey(key);
        const cachedPath = await redis.get(redisKey);

        if (!cachedPath) {
            console.log(`Redis cache miss for key: ${redisKey}`);
            return null;
        }

        try {
            // Check if file still exists (it might have been cleaned up)
            await fsp.access(cachedPath);
            console.log(`Cache hit for key: ${redisKey}, serving from ${cachedPath}`);
            return fs.createReadStream(cachedPath);
        } catch (error: any) {
            console.warn(`Cache file ${cachedPath} not found or inaccessible (key: ${redisKey}):`, error.code);
            // File missing, treat as cache miss - potentially remove stale Redis key
            await redis.del(redisKey);
            return null;
        }
    }

    async set(key: string, sourceStream: Readable, ttlSeconds: number): Promise<void> {
        await this.ensureCacheDirExists(); // Ensure dir exists before writing
        const redisKey = this.getCacheKey(key);
        const tempFilePath = this.generateCacheFilePath(key);
        const cacheWriteStream = fs.createWriteStream(tempFilePath);

        console.log(`Attempting to cache stream for key ${redisKey} to ${tempFilePath}`);

        try {
            // Use pipeline to handle stream errors and ensure completion
            await pipeline(sourceStream, cacheWriteStream);

            console.log(`Successfully cached PDF to ${tempFilePath} for key ${redisKey}`);
            await redis.set(redisKey, tempFilePath, 'EX', ttlSeconds);
            console.log(`Set Redis key ${redisKey} with TTL ${ttlSeconds}s`);

        } catch (error) {
            console.error(`Error caching stream for key ${redisKey} to ${tempFilePath}:`, error);
            // Attempt to clean up the partially written file on error
            try {
                await fsp.unlink(tempFilePath);
                console.log(`Deleted incomplete cache file ${tempFilePath}`);
            } catch (unlinkError: any) {
                // Log if deletion fails but don't block the original error
                 if (unlinkError.code !== 'ENOENT') { // Ignore if already gone
                    console.error(`Failed to delete incomplete cache file ${tempFilePath}:`, unlinkError);
                 }
            }
            // Re-throw the original pipeline error
            throw error;
        }
    }
}