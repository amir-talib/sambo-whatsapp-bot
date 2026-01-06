// WhatsApp Cloud API Types

export interface WhatsAppWebhookPayload {
    object: 'whatsapp_business_account';
    entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
    id: string;
    changes: WhatsAppChange[];
}

export interface WhatsAppChange {
    value: WhatsAppValue;
    field: string;
}

export interface WhatsAppValue {
    messaging_product: 'whatsapp';
    metadata: {
        display_phone_number: string;
        phone_number_id: string;
    };
    contacts?: WhatsAppContact[];
    messages?: WhatsAppMessage[];
    statuses?: WhatsAppStatus[];
}

export interface WhatsAppContact {
    profile: {
        name: string;
    };
    wa_id: string;
}

export interface WhatsAppMessage {
    from: string;
    id: string;
    timestamp: string;
    type: 'text' | 'image' | 'interactive' | 'button';
    text?: {
        body: string;
    };
    image?: {
        caption?: string;
        mime_type: string;
        sha256: string;
        id: string;
    };
    interactive?: {
        type: 'button_reply' | 'list_reply';
        button_reply?: {
            id: string;
            title: string;
        };
        list_reply?: {
            id: string;
            title: string;
            description?: string;
        };
    };
    button?: {
        payload: string;
        text: string;
    };
    context?: {
        from: string;
        id: string;
        forwarded?: boolean;
    };
}

export interface WhatsAppStatus {
    id: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp: string;
    recipient_id: string;
}

// Outbound message types
export interface SendTextMessagePayload {
    messaging_product: 'whatsapp';
    recipient_type: 'individual';
    to: string;
    type: 'text';
    text: {
        preview_url: boolean;
        body: string;
    };
}

export interface SendInteractiveMessagePayload {
    messaging_product: 'whatsapp';
    recipient_type: 'individual';
    to: string;
    type: 'interactive';
    interactive: {
        type: 'button';
        header?: {
            type: 'image';
            image: {
                link: string;
            };
        };
        body: {
            text: string;
        };
        footer?: {
            text: string;
        };
        action: {
            buttons: Array<{
                type: 'reply';
                reply: {
                    id: string;
                    title: string;
                };
            }>;
        };
    };
}
