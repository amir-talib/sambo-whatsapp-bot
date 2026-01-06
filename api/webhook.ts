import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadEnv, getEnv } from '../src/config/env.js';
import { verifyWebhook as verifyHandler, handleWebhook as webhookHandler } from '../src/controllers/webhookController.js';

// Load environment on cold start
loadEnv();

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const env = getEnv();

    if (req.method === 'GET') {
        // Webhook verification
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode === 'subscribe' && token === env.WA_VERIFY_TOKEN) {
            console.log('✅ Webhook verified');
            return res.status(200).send(challenge);
        } else {
            console.log('❌ Webhook verification failed');
            return res.status(403).send('Forbidden');
        }
    }

    if (req.method === 'POST') {
        // Always respond 200 quickly to avoid retries from Meta
        res.status(200).send('OK');

        try {
            // Process the webhook in the background
            // Note: In Vercel, we need to import and call the handler logic directly
            const { handleWebhookPayload } = await import('../src/controllers/webhookController.js');
            await handleWebhookPayload(req.body);
        } catch (error) {
            console.error('Webhook processing error:', error);
        }
        return;
    }

    return res.status(405).send('Method Not Allowed');
}
