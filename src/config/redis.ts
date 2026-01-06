import Redis from 'ioredis';
import { getEnv } from './env.js';

let redisClient: Redis | null = null;

export function getRedis(): Redis {
    if (redisClient) return redisClient;

    const env = getEnv();

    redisClient = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
        lazyConnect: true,
    });

    redisClient.on('connect', () => {
        console.log('✅ Redis connected');
    });

    redisClient.on('error', (err) => {
        console.error('❌ Redis error:', err.message);
    });

    return redisClient;
}

export async function connectRedis(): Promise<void> {
    const redis = getRedis();
    await redis.connect();
}

export async function closeRedis(): Promise<void> {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        console.log('Redis connection closed');
    }
}
