import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadEnv } from '../../src/config/env.js';
import { pollExpiredSessions } from '../../src/services/processorService.js';

// Load environment on cold start
loadEnv();

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Verify this is coming from Vercel cron (has authorization header)
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        // In development or if CRON_SECRET not set, allow anyway
        if (process.env.CRON_SECRET) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    try {
        console.log('Running session processor cron...');
        await pollExpiredSessions();

        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Cron processing error:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
