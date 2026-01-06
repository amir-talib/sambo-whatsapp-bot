import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
    return res.status(200).json({
        status: 'ok',
        service: 'sambo-whatsapp-bot',
        timestamp: new Date().toISOString(),
        runtime: 'vercel-serverless',
    });
}
