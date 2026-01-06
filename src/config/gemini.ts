import { GoogleGenerativeAI } from '@google/generative-ai';
import { getEnv } from './env.js';

let genAI: GoogleGenerativeAI | null = null;

export function getGemini(): GoogleGenerativeAI {
    if (genAI) return genAI;

    const env = getEnv();
    genAI = new GoogleGenerativeAI(env.GOOGLE_API_KEY);

    return genAI;
}

export function getGeminiModel() {
    const ai = getGemini();
    return ai.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
        },
    });
}
