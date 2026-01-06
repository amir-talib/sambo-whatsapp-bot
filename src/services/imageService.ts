import axios from 'axios';
import { cloudinary, configureCloudinary } from '../config/cloudinary.js';
import { getEnv } from '../config/env.js';
import type { SessionImage } from '../types/index.js';

configureCloudinary();

const TEMP_FOLDER = 'sambo_temp';
const PERMANENT_FOLDER = 'sambo/listings';

/**
 * Get the media URL from WhatsApp using the media ID
 */
async function getWhatsAppMediaUrl(mediaId: string): Promise<string> {
    const env = getEnv();

    const response = await axios.get(
        `https://graph.facebook.com/v21.0/${mediaId}`,
        {
            headers: {
                Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`,
            },
        }
    );

    return response.data.url;
}

/**
 * Stream image from WhatsApp directly to Cloudinary (no local storage)
 */
export async function uploadFromWhatsAppToCloudinary(
    mediaId: string,
    phoneNumber: string
): Promise<SessionImage> {
    const env = getEnv();

    // 1. Get the download URL from WhatsApp
    const mediaUrl = await getWhatsAppMediaUrl(mediaId);

    // 2. Stream from WhatsApp -> Cloudinary
    return new Promise(async (resolve, reject) => {
        try {
            const response = await axios({
                method: 'GET',
                url: mediaUrl,
                responseType: 'stream',
                headers: {
                    Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`,
                },
            });

            // 3. Pipe to Cloudinary upload_stream
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: TEMP_FOLDER,
                    tags: [`session_${phoneNumber}`],
                    resource_type: 'image',
                    transformation: [
                        { quality: 'auto:best', fetch_format: 'auto' },
                        { width: 2000, crop: 'limit' },
                    ],
                },
                (error, result) => {
                    if (error) {
                        console.error('Cloudinary upload error:', error);
                        return reject(error);
                    }
                    if (!result) {
                        return reject(new Error('No result from Cloudinary'));
                    }
                    resolve({
                        public_id: result.public_id,
                        url: result.secure_url,
                    });
                }
            );

            response.data.pipe(uploadStream);
        } catch (err) {
            console.error('WhatsApp media fetch error:', err);
            reject(err);
        }
    });
}

/**
 * Delete images from Cloudinary by their public IDs
 */
export async function deleteImages(publicIds: string[]): Promise<void> {
    if (publicIds.length === 0) return;

    try {
        await cloudinary.api.delete_resources(publicIds);
        console.log(`Deleted ${publicIds.length} images from Cloudinary`);
    } catch (error) {
        console.error('Error deleting images:', error);
        // Don't throw - cleanup failures shouldn't break the flow
    }
}

/**
 * Delete all images for a session using tags
 */
export async function deleteSessionImages(phoneNumber: string): Promise<void> {
    try {
        await cloudinary.api.delete_resources_by_tag(`session_${phoneNumber}`);
        console.log(`Deleted all images for session ${phoneNumber}`);
    } catch (error) {
        console.error('Error deleting session images:', error);
    }
}

/**
 * Move images from temp folder to permanent listing folder
 */
export async function moveImagesToPermanent(
    images: SessionImage[],
    dealerId: string,
    listingId: string
): Promise<SessionImage[]> {
    const newFolder = `${PERMANENT_FOLDER}/${dealerId}/${listingId}`;
    const movedImages: SessionImage[] = [];

    for (const image of images) {
        try {
            // Cloudinary rename moves the asset
            const newPublicId = `${newFolder}/${image.public_id.split('/').pop()}`;

            const result = await cloudinary.uploader.rename(
                image.public_id,
                newPublicId,
                { invalidate: true }
            );

            movedImages.push({
                public_id: result.public_id,
                url: result.secure_url,
            });
        } catch (error) {
            console.error(`Error moving image ${image.public_id}:`, error);
            // Keep original image reference if move fails
            movedImages.push(image);
        }
    }

    return movedImages;
}

/**
 * Delete excess images (for > 12 images case)
 */
export async function deleteExcessImages(
    images: SessionImage[],
    maxToKeep: number = 12
): Promise<{ kept: SessionImage[]; deleted: string[] }> {
    if (images.length <= maxToKeep) {
        return { kept: images, deleted: [] };
    }

    const kept = images.slice(0, maxToKeep);
    const toDelete = images.slice(maxToKeep);
    const deletedIds = toDelete.map(img => img.public_id);

    await deleteImages(deletedIds);

    return { kept, deleted: deletedIds };
}
