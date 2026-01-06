import { v2 as cloudinary } from 'cloudinary';
import { getEnv } from './env.js';

let configured = false;

export function configureCloudinary(): void {
    if (configured) return;

    const env = getEnv();

    cloudinary.config({
        cloud_name: env.CLOUDINARY_CLOUD_NAME,
        api_key: env.CLOUDINARY_API_KEY,
        api_secret: env.CLOUDINARY_API_SECRET,
    });

    configured = true;
    console.log('✅ Cloudinary configured');
}

export { cloudinary };
