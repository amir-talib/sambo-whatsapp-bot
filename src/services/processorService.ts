import { prisma } from '@sambo/database';
import * as bufferService from './bufferService.js';
import * as imageService from './imageService.js';
import * as aiService from './aiService.js';
import * as messageService from './messageService.js';
import type { SessionData, VehicleExtraction } from '../types/index.js';
import { mapConditionToDb } from '../types/extraction.js';

const MIN_IMAGES = 5;
const MAX_IMAGES = 12;

/**
 * Main processing pipeline - triggered after 60s debounce
 */
export async function processSession(phoneNumber: string): Promise<void> {
    console.log(`Processing session for ${phoneNumber}`);

    const session = await bufferService.getSession(phoneNumber);

    if (!session || session.status !== 'collecting') {
        console.log(`No active collecting session for ${phoneNumber}`);
        return;
    }

    // Update status to processing
    await bufferService.updateSessionStatus(phoneNumber, 'processing');

    try {
        // Step 1: Validate image count
        const imageCount = session.images.length;
        console.log(`Session has ${imageCount} images`);

        if (imageCount < MIN_IMAGES) {
            // Too few images - cleanup and notify
            await imageService.deleteSessionImages(phoneNumber);
            await bufferService.clearSession(phoneNumber);
            await messageService.sendInsufficientImagesError(phoneNumber);
            return;
        }

        // Step 2: Trim excess images if needed
        let imagesToProcess = session.images;
        if (imageCount > MAX_IMAGES) {
            const { kept, deleted } = await imageService.deleteExcessImages(session.images, MAX_IMAGES);
            imagesToProcess = kept;
            console.log(`Deleted ${deleted.length} excess images`);
        }

        // Step 3: Extract vehicle data using Gemini
        const extraction = await aiService.extractVehicleData(
            session.text_buffer,
            imagesToProcess
        );

        console.log('Extraction result:', extraction);

        // Step 4: Check if valid car listing
        if (!extraction.valid_listing) {
            await imageService.deleteSessionImages(phoneNumber);
            await bufferService.clearSession(phoneNumber);
            await messageService.sendNotACarError(phoneNumber);
            return;
        }

        // Step 5: Store extraction and send confirmation
        await bufferService.setExtractedData(phoneNumber, extraction);

        // Get hero image URL
        const heroIndex = extraction.hero_image_index;
        const heroImageUrl = imagesToProcess[heroIndex]?.url;

        await messageService.sendConfirmationMessage(
            phoneNumber,
            extraction,
            imagesToProcess.length,
            heroImageUrl
        );

    } catch (error) {
        console.error(`Error processing session for ${phoneNumber}:`, error);
        await bufferService.clearSession(phoneNumber);
        await messageService.sendProcessingError(phoneNumber);
    }
}

/**
 * Handle confirmation button press
 */
export async function handleConfirmation(phoneNumber: string): Promise<void> {
    const session = await bufferService.getSession(phoneNumber);

    if (!session || session.status !== 'confirming' || !session.extracted_data) {
        console.log(`No confirming session for ${phoneNumber}`);
        return;
    }

    try {
        // Find dealer by WhatsApp number
        const dealer = await findDealerByPhone(phoneNumber);

        if (!dealer) {
            await messageService.sendTextMessage(
                phoneNumber,
                '❌ Could not find a registered dealer account for this phone number. Please register on the Sambo Dealer Portal first.'
            );
            await bufferService.clearSession(phoneNumber);
            return;
        }

        // Create the listing
        const listing = await createListing(session, dealer.id);

        // Move images to permanent storage
        const movedImages = await imageService.moveImagesToPermanent(
            session.images,
            dealer.id,
            listing.id
        );

        // Create media records
        await createListingMedia(listing.id, movedImages, session.extracted_data.hero_image_index);

        // Send success message
        await messageService.sendListingCreatedMessage(
            phoneNumber,
            session.extracted_data.make,
            session.extracted_data.model,
            session.extracted_data.year
        );

        // Cleanup session
        await bufferService.clearSession(phoneNumber);

        console.log(`Listing ${listing.id} created successfully`);

    } catch (error) {
        console.error(`Error confirming listing for ${phoneNumber}:`, error);
        await messageService.sendProcessingError(phoneNumber);
    }
}

/**
 * Handle cancellation button press
 */
export async function handleCancellation(phoneNumber: string): Promise<void> {
    await imageService.deleteSessionImages(phoneNumber);
    await bufferService.clearSession(phoneNumber);
    await messageService.sendListingCancelledMessage(phoneNumber);
}

/**
 * Handle edit price button press
 */
export async function handleEditPrice(phoneNumber: string): Promise<void> {
    await messageService.sendPriceEditPrompt(phoneNumber);
    // Session stays in 'confirming' status, waiting for price text
}

/**
 * Handle new price input during edit flow
 */
export async function handlePriceUpdate(phoneNumber: string, priceText: string): Promise<void> {
    const session = await bufferService.getSession(phoneNumber);

    if (!session || session.status !== 'confirming' || !session.extracted_data) {
        return;
    }

    const newPrice = aiService.parsePrice(priceText);

    if (newPrice === null) {
        await messageService.sendTextMessage(
            phoneNumber,
            '❌ Could not parse price. Please enter a valid number (e.g., "5000000" or "5m"):'
        );
        return;
    }

    // Update the price
    session.extracted_data.price = newPrice;
    await bufferService.setExtractedData(phoneNumber, session.extracted_data);

    // Resend confirmation
    const heroImageUrl = session.images[session.extracted_data.hero_image_index]?.url;

    await messageService.sendConfirmationMessage(
        phoneNumber,
        session.extracted_data,
        session.images.length,
        heroImageUrl
    );
}

// Helper functions

async function findDealerByPhone(phoneNumber: string) {
    // Normalize phone number (strip leading +)
    const normalized = phoneNumber.replace(/^\+/, '');

    return prisma.dealer.findFirst({
        where: {
            OR: [
                { whatsappNumber: normalized },
                { whatsappNumber: `+${normalized}` },
                { user: { phoneNumber: normalized } },
                { user: { phoneNumber: `+${normalized}` } },
            ],
        },
    });
}

async function createListing(session: SessionData, dealerId: string) {
    const data = session.extracted_data!;

    // Generate slug
    const slug = `${data.make}-${data.model}-${data.year}-${Date.now()}`
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

    // Generate title
    const title = `${data.year} ${data.make} ${data.model}`;

    return prisma.listing.create({
        data: {
            dealerId,
            title,
            slug,
            price: data.price ?? 0,
            condition: mapConditionToDb(data.condition),
            status: 'active',
            specs: {
                create: {
                    make: data.make,
                    model: data.model,
                    year: data.year,
                    transmission: data.transmission,
                    colorExterior: data.color,
                    mileageKm: 0, // Not extracted from WhatsApp, can be edited in portal
                },
            },
        },
    });
}

async function createListingMedia(
    listingId: string,
    images: { public_id: string; url: string }[],
    heroIndex: number
) {
    const mediaData = images.map((img, idx) => ({
        listingId,
        url: img.url,
        mediaType: 'image',
        isHero: idx === heroIndex,
    }));

    await prisma.listingMedia.createMany({
        data: mediaData,
    });
}

/**
 * Polling function to check for expired sessions (alternative to pub/sub)
 */
export async function pollExpiredSessions(): Promise<void> {
    const expiredPhones = await bufferService.getExpiredTimerPhoneNumbers();

    for (const phoneNumber of expiredPhones) {
        console.log(`Found expired session for ${phoneNumber}, processing...`);
        await processSession(phoneNumber);
    }
}
