import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import axios from 'axios';

// Environment variables
const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;
const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN;
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;

// Session types
interface SessionImage {
    public_id: string;
    url: string;
}

interface SessionData {
    last_updated: number;
    text_buffer: string[];
    images: SessionImage[];
    status: 'collecting' | 'processing' | 'confirming' | 'completed' | 'cancelled';
    dealer_id?: string;
    extracted_data?: any;
}

// Constants
const SESSION_PREFIX = 'session:';
const TIMER_PREFIX = 'timer:';
const SESSION_TTL = 3600;
const DEBOUNCE_TTL = 60;

// Session helpers
async function getSession(phoneNumber: string): Promise<SessionData | null> {
    const key = `${SESSION_PREFIX}${phoneNumber}`;
    const data = await kv.get<SessionData>(key);
    return data ?? null;
}

async function createSession(phoneNumber: string): Promise<SessionData> {
    const session: SessionData = {
        last_updated: Date.now(),
        text_buffer: [],
        images: [],
        status: 'collecting',
    };
    await saveSession(phoneNumber, session);
    return session;
}

async function saveSession(phoneNumber: string, session: SessionData): Promise<void> {
    const key = `${SESSION_PREFIX}${phoneNumber}`;
    session.last_updated = Date.now();
    await kv.set(key, session, { ex: SESSION_TTL });
}

async function setDebounceTimer(phoneNumber: string): Promise<void> {
    const key = `${TIMER_PREFIX}${phoneNumber}`;
    await kv.set(key, 'pending', { ex: DEBOUNCE_TTL });
}

// Send message helper
async function sendTextMessage(phoneNumber: string, text: string): Promise<void> {
    try {
        const url = `https://graph.facebook.com/v21.0/${WA_PHONE_NUMBER_ID}/messages`;
        console.log('Sending message to:', url);

        await axios.post(
            url,
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: text },
            },
            {
                headers: {
                    Authorization: `Bearer ${WA_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        console.log(`Sent message to ${phoneNumber}`);
        await kv.set('debug:last-action', `Sent message to ${phoneNumber}: ${text.substring(0, 20)}...`);
    } catch (error: any) {
        console.error('Error sending message:', error.response?.data || error.message);
        await kv.set('debug:error-sending', JSON.stringify(error.response?.data || error.message));
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // GET - Webhook verification
    if (req.method === 'GET') {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        console.log('Webhook verification:', { mode, tokenPresent: !!token });

        if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
            console.log('✅ Webhook verified');
            return res.status(200).send(challenge);
        } else {
            console.log('❌ Webhook verification failed');
            return res.status(403).send('Forbidden');
        }
    }

    // POST - Incoming message
    if (req.method === 'POST') {
        // Respond immediately to avoid retries
        res.status(200).send('OK');

        try {
            const payload = req.body;

            // DEBUG: Log last payload to KV
            await kv.set('debug:last-payload', JSON.stringify(payload));
            await kv.set('debug:last-timestamp', new Date().toISOString());

            console.log('Webhook received:', JSON.stringify(payload, null, 2));

            if (payload.object !== 'whatsapp_business_account') {
                await kv.set('debug:status', 'Not a WhatsApp webhook');
                return;
            }

            for (const entry of payload.entry || []) {
                for (const change of entry.changes || []) {
                    const messages = change.value?.messages || [];
                    const contacts = change.value?.contacts || [];

                    if (messages.length === 0) {
                        await kv.set('debug:status', 'No messages in payload');
                    }

                    for (const message of messages) {
                        const phoneNumber = message.from;
                        const senderName = contacts[0]?.profile?.name || 'Unknown';

                        await kv.set('debug:last-sender', `${phoneNumber} (${senderName})`);

                        // Handle text messages
                        if (message.type === 'text' && message.text?.body) {
                            const text = message.text.body;

                            let session = await getSession(phoneNumber);
                            if (!session || session.status !== 'collecting') {
                                session = await createSession(phoneNumber);
                            }

                            session.text_buffer.push(text);
                            await saveSession(phoneNumber, session);
                            await setDebounceTimer(phoneNumber);

                            // Send acknowledgment
                            await sendTextMessage(phoneNumber, `📝 Received: "${text}"\n\nSend 5+ car photos and I'll create your listing!`);
                        }

                        // Handle image messages
                        if (message.type === 'image' && message.image?.id) {
                            const mediaId = message.image.id;

                            let session = await getSession(phoneNumber);
                            if (!session || session.status !== 'collecting') {
                                session = await createSession(phoneNumber);
                            }

                            // For now, just store the media ID (we'll process images later)
                            session.images.push({
                                public_id: mediaId,
                                url: `media:${mediaId}`, // placeholder
                            });
                            await saveSession(phoneNumber, session);
                            await setDebounceTimer(phoneNumber);

                            const imageCount = session.images.length;
                            if (imageCount < 5) {
                                await sendTextMessage(phoneNumber, `📷 Image ${imageCount}/5 received. Send ${5 - imageCount} more!`);
                            } else {
                                await sendTextMessage(phoneNumber, `📷 Image ${imageCount} received! You have enough photos.\n\nProcessing will start in 60 seconds after you stop sending...`);
                            }
                        }
                    }
                }
            }
        } catch (error: any) {
            console.error('Error processing webhook:', error);
            await kv.set('debug:error', error.message || String(error));
        }

        return;
    }

    return res.status(405).send('Method Not Allowed');
}
