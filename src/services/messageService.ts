import axios from 'axios';
import { getEnv } from '../config/env.js';
import type {
    SendTextMessagePayload,
    SendInteractiveMessagePayload
} from '../types/index.js';
import { CONFIRMATION_MESSAGE, ERROR_MESSAGES } from '../utils/promptTemplates.js';
import type { VehicleExtraction } from '../types/index.js';

const WHATSAPP_API_BASE = 'https://graph.facebook.com/v21.0';

/**
 * Send a message via WhatsApp Cloud API
 */
async function sendWhatsAppMessage(payload: SendTextMessagePayload | SendInteractiveMessagePayload): Promise<void> {
    const env = getEnv();

    try {
        await axios.post(
            `${WHATSAPP_API_BASE}/${env.WA_PHONE_NUMBER_ID}/messages`,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            }
        );
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        throw error;
    }
}

/**
 * Send a simple text message
 */
export async function sendTextMessage(to: string, text: string): Promise<void> {
    const payload: SendTextMessagePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: {
            preview_url: false,
            body: text,
        },
    };

    await sendWhatsAppMessage(payload);
}

/**
 * Send confirmation message with extracted vehicle data
 */
export async function sendConfirmationMessage(
    to: string,
    extraction: VehicleExtraction,
    imageCount: number,
    heroImageUrl?: string
): Promise<void> {
    const bodyText = CONFIRMATION_MESSAGE({
        make: extraction.make,
        model: extraction.model,
        year: extraction.year,
        price: extraction.price,
        color: extraction.color,
        condition: extraction.condition,
        transmission: extraction.transmission,
        imageCount,
    });

    const payload: SendInteractiveMessagePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive: {
            type: 'button',
            header: heroImageUrl ? {
                type: 'image',
                image: {
                    link: heroImageUrl,
                },
            } : undefined,
            body: {
                text: bodyText,
            },
            footer: {
                text: 'Powered by Sambo 🚗',
            },
            action: {
                buttons: [
                    {
                        type: 'reply',
                        reply: {
                            id: 'confirm_post',
                            title: '✅ Confirm & Post',
                        },
                    },
                    {
                        type: 'reply',
                        reply: {
                            id: 'edit_price',
                            title: '✏️ Edit Price',
                        },
                    },
                    {
                        type: 'reply',
                        reply: {
                            id: 'cancel_listing',
                            title: '❌ Cancel',
                        },
                    },
                ],
            },
        },
    };

    await sendWhatsAppMessage(payload);
}

/**
 * Send insufficient images error
 */
export async function sendInsufficientImagesError(to: string): Promise<void> {
    await sendTextMessage(to, ERROR_MESSAGES.INSUFFICIENT_IMAGES);
}

/**
 * Send not a car error
 */
export async function sendNotACarError(to: string): Promise<void> {
    await sendTextMessage(to, ERROR_MESSAGES.NOT_A_CAR);
}

/**
 * Send processing error
 */
export async function sendProcessingError(to: string): Promise<void> {
    await sendTextMessage(to, ERROR_MESSAGES.PROCESSING_ERROR);
}

/**
 * Send listing created success message
 */
export async function sendListingCreatedMessage(
    to: string,
    make: string,
    model: string,
    year: number
): Promise<void> {
    await sendTextMessage(to, ERROR_MESSAGES.LISTING_CREATED(make, model, year));
}

/**
 * Send listing cancelled message
 */
export async function sendListingCancelledMessage(to: string): Promise<void> {
    await sendTextMessage(to, ERROR_MESSAGES.LISTING_CANCELLED);
}

/**
 * Send price edit prompt
 */
export async function sendPriceEditPrompt(to: string): Promise<void> {
    await sendTextMessage(
        to,
        `💰 Please type the new price in Naira (e.g., "5000000" or "5m"):`
    );
}

/**
 * Send welcome/help message
 */
export async function sendWelcomeMessage(to: string): Promise<void> {
    await sendTextMessage(
        to,
        `👋 Welcome to *Sambo Bot*!

To create a car listing:
1. Forward 5-12 photos of the vehicle
2. Include a description with make, model, year, and price
3. Wait for confirmation

I'll process your submission and create a professional listing on the Sambo marketplace.`
    );
}
