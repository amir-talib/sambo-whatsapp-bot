import { z } from 'zod';

const envSchema = z.object({
    PORT: z.string().default('3001'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    // WhatsApp Cloud API
    WA_PHONE_NUMBER_ID: z.string().min(1, 'WhatsApp Phone Number ID is required'),
    WA_VERIFY_TOKEN: z.string().min(1, 'WhatsApp Verify Token is required'),
    WA_ACCESS_TOKEN: z.string().min(1, 'WhatsApp Access Token is required'),

    // Vercel KV (auto-injected by Vercel when you create KV storage)
    // These are optional because @vercel/kv reads them automatically
    KV_REST_API_URL: z.string().optional(),
    KV_REST_API_TOKEN: z.string().optional(),

    // Google AI
    GOOGLE_API_KEY: z.string().min(1, 'Google API Key is required'),

    // Cloudinary
    CLOUDINARY_CLOUD_NAME: z.string().min(1, 'Cloudinary Cloud Name is required'),
    CLOUDINARY_API_KEY: z.string().min(1, 'Cloudinary API Key is required'),
    CLOUDINARY_API_SECRET: z.string().min(1, 'Cloudinary API Secret is required'),

    // Database
    DATABASE_URL: z.string().min(1, 'Database URL is required'),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

export function loadEnv(): Env {
    if (env) return env;

    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        console.error('❌ Environment validation failed:');
        console.error(result.error.flatten().fieldErrors);
        process.exit(1);
    }

    env = result.data;
    return env;
}

export function getEnv(): Env {
    if (!env) {
        return loadEnv();
    }
    return env;
}
