import type { VercelRequest, VercelResponse } from '@vercel/node';

const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'GET') {
        // Webhook verification from Meta
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        console.log('Webhook verification attempt:', { mode, token: token ? '***' : 'missing' });

        if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
            console.log('✅ Webhook verified');
            return res.status(200).send(challenge);
        } else {
            console.log('❌ Webhook verification failed');
            return res.status(403).send('Forbidden');
        }
    }

    if (req.method === 'POST') {
        // Always respond 200 quickly to avoid retries from Meta
        console.log('Received webhook POST');

        // For now, just acknowledge - we'll process later
        // The full processing requires importing the src modules which need to be bundled
        return res.status(200).send('OK');
    }

    return res.status(405).send('Method Not Allowed');
}
