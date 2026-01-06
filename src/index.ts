import express from 'express';
import cors from 'cors';
import { loadEnv, getEnv } from './config/env.js';
import { configureCloudinary } from './config/cloudinary.js';
import { verifyWebhook, handleWebhook } from './controllers/webhookController.js';
import { pollExpiredSessions } from './services/processorService.js';

// Load and validate environment
loadEnv();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'sambo-whatsapp-bot',
        timestamp: new Date().toISOString(),
    });
});

// WhatsApp webhook routes
app.get('/webhook', verifyWebhook);
app.post('/webhook', handleWebhook);

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server (for local dev - Vercel uses api/ routes instead)
async function start() {
    const env = getEnv();

    try {
        // Initialize services
        configureCloudinary();

        // Start polling for expired sessions (every 60 seconds for local dev)
        // On Vercel, cron handles this instead
        const POLL_INTERVAL = 60000;
        setInterval(async () => {
            try {
                await pollExpiredSessions();
            } catch (error) {
                console.error('Poll error:', error);
            }
        }, POLL_INTERVAL);

        // Start Express server
        app.listen(env.PORT, () => {
            console.log(`🚀 WhatsApp Bot running on port ${env.PORT}`);
            console.log(`📍 Webhook URL: http://localhost:${env.PORT}/webhook`);
            console.log(`❤️  Health check: http://localhost:${env.PORT}/health`);
            console.log(`\n⚠️  Note: For local dev, set KV_REST_API_URL and KV_REST_API_TOKEN`);
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

start();
