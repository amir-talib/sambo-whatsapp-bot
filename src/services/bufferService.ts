import { getRedis } from '../config/redis.js';
import type { SessionData, SessionImage } from '../types/index.js';

const SESSION_PREFIX = 'session:';
const TIMER_PREFIX = 'timer:';
const SESSION_TTL = 3600; // 1 hour max session lifetime

/**
 * Get or create a session for a phone number
 */
export async function getSession(phoneNumber: string): Promise<SessionData | null> {
    const redis = getRedis();
    const key = `${SESSION_PREFIX}${phoneNumber}`;

    const data = await redis.get(key);
    if (!data) return null;

    try {
        return JSON.parse(data) as SessionData;
    } catch {
        return null;
    }
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
 * Save session data to Redis
 */
export async function saveSession(phoneNumber: string, session: SessionData): Promise<void> {
    const redis = getRedis();
    const key = `${SESSION_PREFIX}${phoneNumber}`;

    session.last_updated = Date.now();
    await redis.setex(key, SESSION_TTL, JSON.stringify(session));
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
    const redis = getRedis();
    const sessionKey = `${SESSION_PREFIX}${phoneNumber}`;
    const timerKey = `${TIMER_PREFIX}${phoneNumber}`;

    await redis.del(sessionKey, timerKey);
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

// Timer management using Redis TTL keys
// The actual debounce is handled in the processor orchestrator

/**
 * Check if processing timer exists for a phone number
 */
export async function hasActiveTimer(phoneNumber: string): Promise<boolean> {
    const redis = getRedis();
    const key = `${TIMER_PREFIX}${phoneNumber}`;
    const exists = await redis.exists(key);
    return exists === 1;
}

/**
 * Set/reset the processing timer (60 second debounce)
 */
export async function setDebounceTimer(phoneNumber: string): Promise<void> {
    const redis = getRedis();
    const key = `${TIMER_PREFIX}${phoneNumber}`;

    // Set a marker that expires in 60 seconds
    // When it expires, the processor should run
    await redis.setex(key, 60, 'pending');
}

/**
 * Clear the debounce timer
 */
export async function clearDebounceTimer(phoneNumber: string): Promise<void> {
    const redis = getRedis();
    const key = `${TIMER_PREFIX}${phoneNumber}`;
    await redis.del(key);
}

/**
 * Get all phone numbers with expired timers (for cleanup/polling)
 */
export async function getExpiredTimerPhoneNumbers(): Promise<string[]> {
    const redis = getRedis();

    // Get all session keys
    const sessionKeys = await redis.keys(`${SESSION_PREFIX}*`);
    const expiredPhones: string[] = [];

    for (const sessionKey of sessionKeys) {
        const phoneNumber = sessionKey.replace(SESSION_PREFIX, '');
        const timerKey = `${TIMER_PREFIX}${phoneNumber}`;

        // If session exists but timer doesn't, it's expired
        const timerExists = await redis.exists(timerKey);
        if (timerExists === 0) {
            const session = await getSession(phoneNumber);
            if (session && session.status === 'collecting' && session.images.length > 0) {
                expiredPhones.push(phoneNumber);
            }
        }
    }

    return expiredPhones;
}
