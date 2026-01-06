import { Request, Response } from 'express';
import { getEnv } from '../config/env.js';
import type { WhatsAppWebhookPayload, WhatsAppMessage } from '../types/index.js';
import * as bufferService from '../services/bufferService.js';
import * as imageService from '../services/imageService.js';
import * as processorService from '../services/processorService.js';
import * as messageService from '../services/messageService.js';

/**
 * GET /webhook - Webhook verification for Meta
 */
export function verifyWebhook(req: Request, res: Response): void {
    const env = getEnv();

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === env.WA_VERIFY_TOKEN) {
        console.log('✅ Webhook verified');
        res.status(200).send(challenge);
    } else {
        console.log('❌ Webhook verification failed');
        res.sendStatus(403);
    }
}

/**
 * POST /webhook - Handle incoming WhatsApp messages
 */
export async function handleWebhook(req: Request, res: Response): Promise<void> {
    // Always respond 200 quickly to avoid retries
    res.sendStatus(200);

    try {
        const payload = req.body as WhatsAppWebhookPayload;

        if (payload.object !== 'whatsapp_business_account') {
            return;
        }

        for (const entry of payload.entry) {
            for (const change of entry.changes) {
                const { messages, contacts } = change.value;

                if (!messages || messages.length === 0) continue;

                for (const message of messages) {
                    await processMessage(message, contacts?.[0]?.profile?.name);
                }
            }
        }
    } catch (error) {
        console.error('Error processing webhook:', error);
    }
}

/**
 * Process webhook payload directly (for Vercel serverless)
 */
export async function handleWebhookPayload(payload: WhatsAppWebhookPayload): Promise<void> {
    if (payload.object !== 'whatsapp_business_account') {
        return;
    }

    for (const entry of payload.entry) {
        for (const change of entry.changes) {
            const { messages, contacts } = change.value;

            if (!messages || messages.length === 0) continue;

            for (const message of messages) {
                await processMessage(message, contacts?.[0]?.profile?.name);
            }
        }
    }
}

/**
 * Process a single incoming message
 */
async function processMessage(message: WhatsAppMessage, senderName?: string): Promise<void> {
    const phoneNumber = message.from;

    console.log(`Received ${message.type} message from ${phoneNumber}`);

    switch (message.type) {
        case 'text':
            await handleTextMessage(phoneNumber, message.text?.body || '');
            break;

        case 'image':
            await handleImageMessage(phoneNumber, message.image?.id || '');
            break;

        case 'interactive':
            await handleInteractiveMessage(phoneNumber, message.interactive);
            break;

        case 'button':
            // Quick reply buttons (deprecated but still used)
            await handleButtonReply(phoneNumber, message.button?.payload || '');
            break;

        default:
            console.log(`Unhandled message type: ${message.type}`);
    }
}

/**
 * Handle incoming text message
 */
async function handleTextMessage(phoneNumber: string, text: string): Promise<void> {
    // Check if we're in the middle of a price edit
    const session = await bufferService.getSession(phoneNumber);

    if (session?.status === 'confirming' && session.extracted_data) {
        // User might be sending new price
        const lowerText = text.toLowerCase();

        // Check if it looks like a price
        if (/^\d/.test(text) || lowerText.includes('m') || lowerText.includes('k')) {
            await processorService.handlePriceUpdate(phoneNumber, text);
            return;
        }
    }

    // Check for help command
    if (text.toLowerCase() === 'help' || text.toLowerCase() === 'start') {
        await messageService.sendWelcomeMessage(phoneNumber);
        return;
    }

    // Normal text - add to buffer
    if (session?.status === 'collecting' || !session) {
        await bufferService.addTextToBuffer(phoneNumber, text);
        await bufferService.setDebounceTimer(phoneNumber);
    }
}

/**
 * Handle incoming image message
 */
async function handleImageMessage(phoneNumber: string, mediaId: string): Promise<void> {
    if (!mediaId) {
        console.error('No media ID in image message');
        return;
    }

    try {
        // Stream image from WhatsApp to Cloudinary
        const result = await imageService.uploadFromWhatsAppToCloudinary(mediaId, phoneNumber);

        console.log(`Uploaded image: ${result.public_id}`);

        // Add to session buffer
        await bufferService.addImageToBuffer(phoneNumber, result);

        // Reset debounce timer
        await bufferService.setDebounceTimer(phoneNumber);

    } catch (error) {
        console.error('Error handling image:', error);
    }
}

/**
 * Handle interactive message replies (button clicks)
 */
async function handleInteractiveMessage(
    phoneNumber: string,
    interactive?: WhatsAppMessage['interactive']
): Promise<void> {
    if (!interactive) return;

    const buttonId = interactive.button_reply?.id || interactive.list_reply?.id;

    if (!buttonId) return;

    console.log(`Button clicked: ${buttonId}`);

    switch (buttonId) {
        case 'confirm_post':
            await processorService.handleConfirmation(phoneNumber);
            break;

        case 'edit_price':
            await processorService.handleEditPrice(phoneNumber);
            break;

        case 'cancel_listing':
            await processorService.handleCancellation(phoneNumber);
            break;

        default:
            console.log(`Unknown button ID: ${buttonId}`);
    }
}

/**
 * Handle quick reply button (legacy)
 */
async function handleButtonReply(phoneNumber: string, payload: string): Promise<void> {
    await handleInteractiveMessage(phoneNumber, {
        type: 'button_reply',
        button_reply: { id: payload, title: payload },
    });
}
