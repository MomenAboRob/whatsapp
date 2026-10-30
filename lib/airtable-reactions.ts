import { getAllAirtableRecords } from './airtable';
import { parseTransferText } from './parser';
import type { ChatMessage, WhatsAppManager } from './whatsapp-client';
import { getCurrentBatchNumber } from './current-batch';

function isCurrentBatchGroup(name: string): boolean {
  return new RegExp(`^(?:و?اصلات|وصلات)\\s+فلسطين\\s+دفعة\\s*${getCurrentBatchNumber()}(?:\\s|$)`).test(name);
}
const MAX_REACTIONS_PER_RUN = 20;
const running = new WeakMap<WhatsAppManager, Promise<AirtableLikeResult>>();

export interface AirtableLikeResult {
  matched: number;
  added: number;
  remaining: number;
  failed: number;
}

function normalized(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function isTargetMessage(message: ChatMessage, groupIds: Set<string>): boolean {
  return !message.isDeleted && Boolean(message.text?.trim()) && (
    Boolean(message.chatJid && groupIds.has(message.chatJid)) ||
    isCurrentBatchGroup(normalized(message.chatName))
  );
}

function hasMyLike(message: ChatMessage): boolean {
  return Boolean(message.reactions?.some((reaction) =>
    reaction.text === '👍' && (reaction.isFromMe || reaction.sender === 'أنا')
  ));
}

export async function syncAirtableLikes(wa: WhatsAppManager): Promise<AirtableLikeResult> {
  const active = running.get(wa);
  if (active) return active;

  const task = (async () => {
    if (wa.getStatus().status !== 'CONNECTED') {
      return { matched: 0, added: 0, remaining: 0, failed: 0 };
    }

    const groupIds = new Set(
      wa.getUserGroups().filter((group) => isCurrentBatchGroup(normalized(group.name))).map((group) => group.id)
    );
    const groupMessages = wa.getMessages().filter((message) => isTargetMessage(message, groupIds));
    if (!groupMessages.length) return { matched: 0, added: 0, remaining: 0, failed: 0 };

    const records = await getAllAirtableRecords();
    if (!records.length) return { matched: 0, added: 0, remaining: 0, failed: 0 };

    const names = new Set<string>();
    const emails = new Set<string>();
    for (const record of records) {
      const fields = record.fields || {};
      const name = normalized(fields['اسم المشترك']);
      const email = normalized(fields['بريد الاكتروني'] || fields['البريد الالكتروني'] || fields.Email);
      if (name) names.add(name);
      if (email) emails.add(email);
    }

    const matched = groupMessages.filter((message) => {
      const parsed = parseTransferText(message.text, message);
      return Boolean(
        (parsed.email && emails.has(normalized(parsed.email))) ||
        (parsed.participantName && names.has(normalized(parsed.participantName)))
      );
    });
    const pending = matched.filter((message) => !hasMyLike(message));
    let added = 0;
    let failed = 0;
    for (const message of pending.slice(0, MAX_REACTIONS_PER_RUN)) {
      const result = await wa.reactToMessage(message.chatJid || message.chatName || '', message.id, '👍');
      if (result.success) added++;
      else {
        failed++;
        console.warn('[WhatsApp] تعذر وضع لايك على رسالة مشترك مسجل في أيرتيبل:', message.id, result.message);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return { matched: matched.length, added, remaining: pending.length - added, failed };
  })();

  running.set(wa, task);
  try {
    return await task;
  } finally {
    if (running.get(wa) === task) running.delete(wa);
  }
}
