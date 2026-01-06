# WhatsApp Bot

Backend service for the Sambo WhatsApp-to-Marketplace automation.

## Features

- Receive forwarded car images and descriptions via WhatsApp
- Stream images directly to Cloudinary (no local storage)
- Buffer messages using Redis with 60-second debounce
- Extract vehicle data using Google Gemini 1.5 Flash
- Interactive confirmation flow via WhatsApp buttons
- Persist listings to PostgreSQL via Prisma

## Setup

1. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

2. Fill in all required values in `.env`

3. Install dependencies:
   ```bash
   cd ../.. && npm install
   ```

4. Run development server:
   ```bash
   npm run dev
   ```

## Webhook Setup

For local development, use ngrok to expose your webhook:

```bash
ngrok http 3001
```

Then register the webhook URL in [Meta Developer Console](https://developers.facebook.com/):
- Callback URL: `https://<ngrok-url>/webhook`
- Verify Token: your `WA_VERIFY_TOKEN` value
- Subscribe to: `messages`

## Architecture

```
src/
├── config/           # Environment, Redis, Gemini, Cloudinary
├── controllers/      # Webhook handlers
├── services/         # Business logic
│   ├── bufferService.ts      # Redis session management
│   ├── imageService.ts       # Cloudinary streaming
│   ├── messageService.ts     # WhatsApp outbound
│   ├── aiService.ts          # Gemini extraction
│   └── processorService.ts   # Pipeline orchestrator
├── types/            # TypeScript definitions
└── utils/            # Prompts and helpers
```

## Flow

1. User forwards images → Webhook receives
2. Images stream to Cloudinary temp folder
3. Messages buffer in Redis with 60s timeout
4. Timer expires → Gemini extracts vehicle data
5. Bot sends confirmation with buttons
6. User confirms → Listing saved to PostgreSQL
