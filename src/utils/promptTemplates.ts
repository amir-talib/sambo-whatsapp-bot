export const VEHICLE_EXTRACTION_PROMPT = `
Role: You are the AI extraction engine for Sambo, a car marketplace in Nigeria.

Input: You will receive text descriptions and a list of image URLs.

Task:
1. Identify the vehicle being sold. If multiple cars are mentioned, prioritize the one shown in the images.
2. Extract the following fields into JSON.
3. Analyze the images to determine which one is the best "Hero Shot" (Front/Angle view of the car exterior).

JSON Schema:
{
  "make": "String (e.g., Toyota)",
  "model": "String (e.g., Camry)",
  "year": "Number (e.g., 2015)",
  "price": "Number (Integer, extracted from text - Nigerian Naira). Parse values like '5m' as 5000000, '2.5m' as 2500000. If 'Call for price' or no price mentioned, use null.",
  "currency": "String (e.g., NGN)",
  "color": "String (extracted from text or images if clearly visible)",
  "transmission": "String (Automatic/Manual, default to null if not mentioned)",
  "condition": "String (Foreign Used / Nigerian Used / New, based on phrases like 'tokunbo', 'foreign used', 'locally used', 'Nigerian used', 'brand new')",
  "hero_image_index": "Number (0-indexed - which image in the provided list looks best for the main listing photo)",
  "missing_fields": ["Array of strings naming which mandatory fields could not be extracted"],
  "valid_listing": "Boolean (false if images do not appear to be car photos, e.g. receipts, documents, memes)"
}

Mandatory Fields: make, model, year, price (can be null but must be present).

Constraint: Do not output markdown, only raw JSON. No code blocks, no explanations.

Nigerian Car Market Context:
- "Tokunbo" means "Foreign Used"
- "Firstbody" means the car was never accidented in Nigeria
- Common price format: "5m" = 5,000,000 NGN, "2.5" or "2.5m" = 2,500,000 NGN
- If year is written as '015 or '017, it means 2015 or 2017
`;

export const ERROR_MESSAGES = {
    INSUFFICIENT_IMAGES: `❌ Sorry, I need at least 5 images to create a listing. Please forward more photos of the vehicle and try again.`,

    NOT_A_CAR: `❌ The images you sent don't appear to be car photos. Please forward actual vehicle images to create a listing.`,

    PROCESSING_ERROR: `⚠️ Something went wrong while processing your submission. Please try again in a few minutes.`,

    SESSION_TIMEOUT: `⏰ Your session timed out. Please start fresh by forwarding the car images again.`,

    LISTING_CREATED: (make: string, model: string, year: number) =>
        `✅ Success! Your ${year} ${make} ${model} has been posted to Sambo. It will be visible to buyers shortly.`,

    LISTING_CANCELLED: `❌ Listing cancelled. The images have been removed. Feel free to start again anytime.`,
};

export const CONFIRMATION_MESSAGE = (data: {
    make: string;
    model: string;
    year: number;
    price: number | null;
    color: string | null;
    condition: string | null;
    transmission: string | null;
    imageCount: number;
}) => {
    const priceText = data.price
        ? `₦${data.price.toLocaleString()}`
        : 'Call for price';

    return `🚗 *Vehicle Details Extracted*

*Make:* ${data.make}
*Model:* ${data.model}
*Year:* ${data.year}
*Price:* ${priceText}
*Color:* ${data.color || 'Not specified'}
*Condition:* ${data.condition || 'Not specified'}
*Transmission:* ${data.transmission || 'Not specified'}
*Photos:* ${data.imageCount} images

Please confirm these details are correct:`;
};
