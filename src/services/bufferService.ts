import { kv } from '@vercel/kv';
import type { SessionData, SessionImage } from '../types/index.js';

const SESSION_PREFIX = 'session:';
const TIMER_PREFIX = 'timer:';
const SESSION_TTL = 3600; // 1 hour max session lifetime
const DEBOUNCE_TTL = 60; // 60 seconds debounce

/**
 * Get or create a session for a phone number
 */
export async function getSession(phoneNumber: string): Promise<SessionData | null> {
    const key = `${SESSION_PREFIX}${phoneNumber}`;
    const data = await kv.get<SessionData>(key);
    return data ?? null;
}

/**
 * Create a new session for a phone number
 */
export async function createSession(phoneNumber: string): Promise<SessionData> {
    const session: SessionData = {
        last_updated: Date.now(),
        text_buffer: [],
        images: [],
        status: 'collecting',
    };

    await saveSession(phoneNumber, session);
    return session;
}

/**
 * Save session data to Vercel KV
 */
export async function saveSession(phoneNumber: string, session: SessionData): Promise<void> {
    const key = `${SESSION_PREFIX}${phoneNumber}`;
    session.last_updated = Date.now();
    await kv.set(key, session, { ex: SESSION_TTL });
}

/**
 * Add text to the session buffer
 */
export async function addTextToBuffer(phoneNumber: string, text: string): Promise<SessionData> {
    let session = await getSession(phoneNumber);

    if (!session || session.status !== 'collecting') {
        session = await createSession(phoneNumber);
    }

    session.text_buffer.push(text);
    await saveSession(phoneNumber, session);

    return session;
}

/**
 * Add an image to the session buffer
 */
export async function addImageToBuffer(phoneNumber: string, image: SessionImage): Promise<SessionData> {
    let session = await getSession(phoneNumber);

    if (!session || session.status !== 'collecting') {
        session = await createSession(phoneNumber);
    }

    session.images.push(image);
    await saveSession(phoneNumber, session);

    return session;
}

/**
 * Update session status
 */
export async function updateSessionStatus(
    phoneNumber: string,
    status: SessionData['status']
): Promise<void> {
    const session = await getSession(phoneNumber);
    if (session) {
        session.status = status;
        await saveSession(phoneNumber, session);
    }
}

/**
 * Clear session after completion or cancellation
 */
export async function clearSession(phoneNumber: string): Promise<void> {
    const sessionKey = `${SESSION_PREFIX}${phoneNumber}`;
    const timerKey = `${TIMER_PREFIX}${phoneNumber}`;

    await kv.del(sessionKey, timerKey);
}

/**
 * Store dealer ID for session (after phone number verification)
 */
export async function setSessionDealerId(phoneNumber: string, dealerId: string): Promise<void> {
    const session = await getSession(phoneNumber);
    if (session) {
        session.dealer_id = dealerId;
        await saveSession(phoneNumber, session);
    }
}

/**
 * Store extracted data in session (for confirmation flow)
 */
export async function setExtractedData(
    phoneNumber: string,
    data: SessionData['extracted_data']
): Promise<void> {
    const session = await getSession(phoneNumber);
    if (session) {
        session.extracted_data = data;
        session.status = 'confirming';
        await saveSession(phoneNumber, session);
    }
}

/**
 * Check if processing timer exists for a phone number
 */
export async function hasActiveTimer(phoneNumber: string): Promise<boolean> {
    const key = `${TIMER_PREFIX}${phoneNumber}`;
    const exists = await kv.exists(key);
    return exists === 1;
}

/**
 * Set/reset the processing timer (60 second debounce)
 */
export async function setDebounceTimer(phoneNumber: string): Promise<void> {
    const key = `${TIMER_PREFIX}${phoneNumber}`;
    await kv.set(key, 'pending', { ex: DEBOUNCE_TTL });
}

/**
 * Clear the debounce timer
 */
export async function clearDebounceTimer(phoneNumber: string): Promise<void> {
    const key = `${TIMER_PREFIX}${phoneNumber}`;
    await kv.del(key);
}

/**
 * Get all phone numbers with expired timers (for cron processing)
 */
export async function getExpiredTimerPhoneNumbers(): Promise<string[]> {
    // Get all session keys
    const sessionKeys = await kv.keys(`${SESSION_PREFIX}*`);
    const expiredPhones: string[] = [];

    for (const sessionKey of sessionKeys) {
        const phoneNumber = sessionKey.replace(SESSION_PREFIX, '');
        const timerKey = `${TIMER_PREFIX}${phoneNumber}`;

        // If session exists but timer doesn't (expired), it's ready to process
        const timerExists = await kv.exists(timerKey);
        if (timerExists === 0) {
            const session = await getSession(phoneNumber);
            if (session && session.status === 'collecting' && session.images.length > 0) {
                expiredPhones.push(phoneNumber);
            }
        }
    }

    return expiredPhones;
}
