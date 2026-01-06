// Vehicle extraction types for Gemini AI

export interface VehicleExtraction {
    make: string;
    model: string;
    year: number;
    price: number | null;
    currency: string;
    color: string | null;
    transmission: 'Automatic' | 'Manual' | null;
    condition: 'Foreign Used' | 'Nigerian Used' | 'New' | null;
    hero_image_index: number;
    missing_fields: string[];
    valid_listing: boolean;
}

export interface SessionImage {
    public_id: string;
    url: string;
}

export interface SessionData {
    last_updated: number;
    text_buffer: string[];
    images: SessionImage[];
    status: 'collecting' | 'processing' | 'confirming' | 'completed' | 'cancelled';
    extracted_data?: VehicleExtraction;
    dealer_id?: string;
}

export interface ProcessingResult {
    success: boolean;
    error?: string;
    extraction?: VehicleExtraction;
    image_count?: number;
}

export type ConditionType = 'brand_new' | 'foreign_used' | 'nigerian_used';

export function mapConditionToDb(condition: string | null): ConditionType {
    if (!condition) return 'foreign_used';

    const normalized = condition.toLowerCase();
    if (normalized.includes('new') && !normalized.includes('used')) return 'brand_new';
    if (normalized.includes('nigerian') || normalized.includes('locally')) return 'nigerian_used';
    return 'foreign_used';
}
