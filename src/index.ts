import express from 'express';
import cors from 'cors';
import { loadEnv, getEnv } from './config/env.js';
import { connectRedis, closeRedis } from './config/redis.js';
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

// Graceful shutdown
async function shutdown() {
    console.log('Shutting down...');
    await closeRedis();
    process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
async function start() {
    const env = getEnv();

    try {
        // Initialize services
        await connectRedis();
        configureCloudinary();

        // Start polling for expired sessions (every 5 seconds)
        const POLL_INTERVAL = 5000;
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
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

start();
