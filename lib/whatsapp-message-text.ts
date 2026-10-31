import { normalizeMessageContent } from '@whiskeysockets/baileys';

/** Read the original WhatsApp text before contact names are substituted for mentions. */
export function rawWhatsAppText(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const message = (raw as { message?: unknown }).message;
  if (!message || typeof message !== 'object') return '';
  const content = normalizeMessageContent(message as Parameters<typeof normalizeMessageContent>[0]);
  return content?.conversation ||
    content?.extendedTextMessage?.text ||
    content?.imageMessage?.caption ||
    content?.videoMessage?.caption ||
    content?.documentMessage?.caption || '';
}
