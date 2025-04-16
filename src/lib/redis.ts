import Redis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

// Declare redis variable here first
let redis: Redis;

const REDIS_URL = process.env.REDIS_URL; // e.g., "redis://localhost:6379" or Redis Cloud URL

if (!REDIS_URL) {
    console.warn('REDIS_URL environment variable not set. Caching will be disabled.');
    // Provide a mock client that does nothing if Redis is not configured
    const mockRedis = {
        get: async (key: string): Promise<string | null> => null,
        set: async (key: string, value: string, mode?: string, duration?: number): Promise<string | null> => null,
        on: (event: string, callback: (...args: any[]) => void) => {},
        // Add other methods used if necessary, returning null/void/default values
    };
     // Use type assertion to satisfy the type checker
    redis = mockRedis as unknown as Redis;

} else {
     redis = new Redis(REDIS_URL, {
        // Optional: Add more Redis options here if needed
        // e.g., password, tls, commandTimeout
        maxRetriesPerRequest: 3, // Example: Retry commands on connection issues
         enableReadyCheck: true,
    });

    redis.on('connect', () => {
        console.log('Connected to Redis.');
    });

    redis.on('error', (err) => {
        console.error('Redis connection error:', err);
        // Implement reconnection logic or error handling as needed
        // ioredis handles some reconnection automatically
    });
}

export { redis };
