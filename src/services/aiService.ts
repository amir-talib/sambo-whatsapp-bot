import { getGeminiModel } from '../config/gemini.js';
import { VEHICLE_EXTRACTION_PROMPT } from '../utils/promptTemplates.js';
import type { VehicleExtraction, SessionImage } from '../types/index.js';

/**
 * Extract vehicle data from text and images using Gemini 1.5 Flash
 */
export async function extractVehicleData(
    textDescriptions: string[],
    images: SessionImage[]
): Promise<VehicleExtraction> {
    const model = getGeminiModel();

    // Build the prompt
    const combinedText = textDescriptions.join('\n\n');
    const imageUrls = images.map((img, idx) => `Image ${idx}: ${img.url}`).join('\n');

    const userPrompt = `
Text Description:
${combinedText || 'No text description provided.'}

Image URLs (${images.length} images):
${imageUrls}

Extract the vehicle details from the above information.
`;

    try {
        const result = await model.generateContent([
            { text: VEHICLE_EXTRACTION_PROMPT },
            { text: userPrompt },
        ]);

        const response = result.response;
        const text = response.text();

        // Parse the JSON response
        const extraction = parseGeminiResponse(text);

        // Validate and fill defaults
        return validateExtraction(extraction, images.length);
    } catch (error) {
        console.error('Gemini extraction error:', error);

        // Return a failed extraction
        return {
            make: 'Unknown',
            model: 'Unknown',
            year: new Date().getFullYear(),
            price: null,
            currency: 'NGN',
            color: null,
            transmission: null,
            condition: null,
            hero_image_index: 0,
            missing_fields: ['make', 'model', 'year', 'price'],
            valid_listing: false,
        };
    }
}

/**
 * Parse Gemini's JSON response
 */
function parseGeminiResponse(text: string): Partial<VehicleExtraction> {
    // Remove any markdown code blocks if present
    let cleanText = text.trim();

    if (cleanText.startsWith('```json')) {
        cleanText = cleanText.slice(7);
    } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.slice(3);
    }

    if (cleanText.endsWith('```')) {
        cleanText = cleanText.slice(0, -3);
    }

    cleanText = cleanText.trim();

    try {
        return JSON.parse(cleanText);
    } catch (error) {
        console.error('Failed to parse Gemini response:', cleanText);
        throw new Error('Invalid JSON response from Gemini');
    }
}

/**
 * Validate and normalize the extraction result
 */
function validateExtraction(
    partial: Partial<VehicleExtraction>,
    imageCount: number
): VehicleExtraction {
    const missingFields: string[] = [];

    // Check mandatory fields
    if (!partial.make || partial.make === 'Unknown') {
        missingFields.push('make');
    }
    if (!partial.model || partial.model === 'Unknown') {
        missingFields.push('model');
    }
    if (!partial.year) {
        missingFields.push('year');
    }
    if (partial.price === undefined) {
        missingFields.push('price');
    }

    // Validate hero_image_index is within bounds
    let heroIndex = partial.hero_image_index ?? 0;
    if (heroIndex < 0 || heroIndex >= imageCount) {
        heroIndex = 0;
    }

    // Normalize condition
    let condition = partial.condition ?? null;
    if (condition) {
        const normalizedCondition = condition.toLowerCase();
        if (normalizedCondition.includes('foreign') || normalizedCondition.includes('tokunbo')) {
            condition = 'Foreign Used';
        } else if (normalizedCondition.includes('nigerian') || normalizedCondition.includes('local')) {
            condition = 'Nigerian Used';
        } else if (normalizedCondition.includes('new') && !normalizedCondition.includes('used')) {
            condition = 'New';
        }
    }

    return {
        make: partial.make || 'Unknown',
        model: partial.model || 'Unknown',
        year: partial.year || new Date().getFullYear(),
        price: partial.price ?? null,
        currency: partial.currency || 'NGN',
        color: partial.color || null,
        transmission: normalizeTransmission(partial.transmission),
        condition: condition as VehicleExtraction['condition'],
        hero_image_index: heroIndex,
        missing_fields: missingFields.length > 0 ? missingFields : (partial.missing_fields || []),
        valid_listing: partial.valid_listing !== false,
    };
}

/**
 * Normalize transmission value
 */
function normalizeTransmission(value: string | null | undefined): 'Automatic' | 'Manual' | null {
    if (!value) return null;

    const normalized = value.toLowerCase();
    if (normalized.includes('auto')) return 'Automatic';
    if (normalized.includes('manual')) return 'Manual';

    return null;
}

/**
 * Parse price from user input (for edit price flow)
 */
export function parsePrice(input: string): number | null {
    // Remove currency symbols and whitespace
    let cleaned = input.replace(/[₦NGN,\s]/gi, '').trim();

    // Handle 'm' suffix (millions)
    if (cleaned.toLowerCase().endsWith('m')) {
        const num = parseFloat(cleaned.slice(0, -1));
        if (!isNaN(num)) {
            return Math.round(num * 1_000_000);
        }
    }

    // Handle 'k' suffix (thousands)
    if (cleaned.toLowerCase().endsWith('k')) {
        const num = parseFloat(cleaned.slice(0, -1));
        if (!isNaN(num)) {
            return Math.round(num * 1_000);
        }
    }

    // Regular number
    const num = parseFloat(cleaned);
    if (!isNaN(num)) {
        return Math.round(num);
    }

    return null;
}
