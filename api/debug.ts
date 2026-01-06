import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const keys = [
            'debug:last-timestamp',
            'debug:last-payload',
            'debug:status',
            'debug:error',
            'debug:last-sender',
            'debug:last-action',
            'debug:error-sending'
        ];

        const values = {};
        for (const key of keys) {
            values[key] = await kv.get(key);
        }

        return res.status(200).json(values);
    } catch (error) {
        return res.status(500).json({ error: String(error) });
    }
}
