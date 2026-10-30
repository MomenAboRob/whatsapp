import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parseTransferText, toEnglishDigits } from './parser';
import { getAllAirtableRecords } from './airtable';
import type { ChatMessage, WhatsAppGroupItem, WhatsAppManager } from './whatsapp-client';

export type InboxStatus = 'new' | 'review' | 'received' | 'not_mine' | 'duplicate';
export type DeliveryStatus = 'idle' | 'needs_review' | 'queued' | 'sending' | 'sent' | 'failed';

export interface InboxCard {
  id: string;
  sourceMessageId: string;
  chatJid: string;
  chatName: string;
  senderName: string;
  timestampMs: number;
  originalText: string;
  draftText: string;
  name: string;
  email: string;
  amount: number | null;
  currency: string;
  partIndex: number;
  partCount: number;
  status: InboxStatus;
  receivedAt?: number;
  receiptMessageId?: string;
  embeddedMediaUrl?: string;
  quotedMessageId?: string;
  autoLinkSuppressed?: boolean;
  portalUploaded?: boolean;
  airtableSaved?: boolean;
  delivery: DeliveryStatus;
  sentMessageId?: string;
  deliveryError?: string;
  lastDeliveryAttemptAt?: number;
  receiptFollowup?: DeliveryStatus;
  receiptSentMessageId?: string;
  lastReceiptAttemptAt?: number;
  duplicateOf?: string;
  manualCollectionId?: string;
}

export interface InboxManualCollection {
  id: string;
  nameOnTransfer: string;
  reference: string;
  amount: number | null;
  currency: string;
  notes: string;
  collectedAt: number;
  linkedCardId?: string;
  previousCardState?: { status: InboxStatus; receivedAt?: number; delivery: DeliveryStatus };
}

export interface InboxReceipt {
  id: string;
  chatJid: string;
  chatName: string;
  senderName: string;
  timestampMs: number;
  mediaUrl: string;
  caption: string;
  quotedMessageId?: string;
  matchedName?: string;
  ocrText?: string;
  ocrError?: string;
  receivedPending?: boolean;
  ignored?: boolean;
  linkedCardIds: string[];
}

export interface InboxConfig {
  sourceGroupIds: string[];
  receivedGroupId: string;
  uploadedGroupId: string;
}

export interface InboxStore {
  version: 1;
  initializedAt: number;
  config: InboxConfig;
  cards: Record<string, InboxCard>;
  receipts: Record<string, InboxReceipt>;
  manualCollections: Record<string, InboxManualCollection>;
}

const storeCache = new Map<string, InboxStore>();
const dispatchLocks = new Set<string>();
const airtableSyncAt = new Map<string, number>();
const airtableSyncPromises = new Map<string, Promise<void>>();
const historySyncAt = new Map<string, number>();
let receiptOcrWorker: Promise<import('tesseract.js').Worker> | null = null;

function storePath(userId: string): string {
  const safeId = crypto.createHash('sha256').update(userId).digest('hex').slice(0, 24);
  return path.join(process.cwd(), 'whatsapp_auth', `transfer_inbox_${safeId}.json`);
}

export function loadInbox(userId: string): InboxStore {
  const cached = storeCache.get(userId);
  if (cached) return cached;
  const file = storePath(userId);
  let store: InboxStore;
  if (fs.existsSync(file)) {
    store = JSON.parse(fs.readFileSync(file, 'utf8')) as InboxStore;
    if (store.version !== 1 || !store.cards || !store.receipts) throw new Error('ملف الوارد غير صالح؛ لم تُحذف بياناته');
    store.manualCollections ||= {};
  } else {
    store = {
      version: 1,
      initializedAt: Date.now(),
      config: { sourceGroupIds: [], receivedGroupId: '', uploadedGroupId: '' },
      cards: {},
      receipts: {},
      manualCollections: {},
    };
    saveInbox(userId, store);
  }
  storeCache.set(userId, store);
  return store;
}

export function saveInbox(userId: string, store: InboxStore): void {
  const file = storePath(userId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store), 'utf8');
  fs.renameSync(temp, file);
  storeCache.set(userId, store);
}

function receiptImageFile(mediaUrl: string): string | null {
  if (!mediaUrl.startsWith('/media/')) return null;
  const filename = path.basename(mediaUrl.split('?')[0]);
  const candidates = [path.join(process.cwd(), 'whatsapp_media', filename), path.join(process.cwd(), 'public', 'media', filename)];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function nameFromReceiptText(text: string): string {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const label = line.match(/اسم\s*(?:المستفيد|المرسل|صاحب\s*الحوالة)\s*[:：-]?\s*(.*)/i);
    if (!label) continue;
    const candidate = (label[1] || lines[index + 1] || '').replace(/[\d\p{P}\p{S}\p{M}\p{Script=Latin}]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (candidate.split(' ').filter(Boolean).length >= 2) return candidate.slice(0, 120);
  }
  return '';
}

export async function recognizeReceipt(userId: string, receiptId: string): Promise<InboxReceipt> {
  const store = loadInbox(userId);
  const receipt = store.receipts[receiptId];
  if (!receipt) throw new Error('الوصل غير موجود');
  const imageFile = receiptImageFile(receipt.mediaUrl);
  if (!imageFile) throw new Error('صورة الوصل غير متوفرة على السيرفر');
  const modelDir = path.join(process.cwd(), 'whatsapp_auth', 'ocr_models');
  fs.mkdirSync(modelDir, { recursive: true });
  for (const lang of ['ara', 'eng']) {
    const source = path.join(process.cwd(), 'node_modules', '@tesseract.js-data', lang, '4.0.0_best_int', `${lang}.traineddata.gz`);
    const target = path.join(modelDir, `${lang}.traineddata.gz`);
    if (!fs.existsSync(target)) fs.copyFileSync(source, target);
  }
  if (!receiptOcrWorker) {
    receiptOcrWorker = import('tesseract.js').then(({ createWorker }) => createWorker(['ara', 'eng'], 1, {
      langPath: modelDir,
      cachePath: modelDir,
    })).catch((error) => { receiptOcrWorker = null; throw error; });
  }
  try {
    const worker = await receiptOcrWorker;
    const result = await worker.recognize(imageFile);
    receipt.ocrText = result.data.text.trim().slice(0, 12000);
    receipt.ocrError = undefined;
    const extracted = nameFromReceiptText(receipt.ocrText);
    if (extracted && !receipt.matchedName) receipt.matchedName = extracted;
    saveInbox(userId, store);
    return receipt;
  } catch (error) {
    receipt.ocrError = error instanceof Error ? error.message : 'تعذر قراءة الصورة';
    saveInbox(userId, store);
    throw error;
  }
}

export function resolvedConfig(store: InboxStore, groups: WhatsAppGroupItem[]): InboxConfig {
  const find = (pattern: RegExp) => groups.filter((group) => group.isGroup && pattern.test(group.name));
  return {
    sourceGroupIds: store.config.sourceGroupIds.length
      ? store.config.sourceGroupIds
      : find(/ويسترن|western|وصلات|واص[لا]+ت/i).map((group) => group.id),
    receivedGroupId: store.config.receivedGroupId || find(/تم\s*الاستلام/i)[0]?.id || '',
    uploadedGroupId: store.config.uploadedGroupId || find(/حوالات\s*تم\s*رفعها/i)[0]?.id || '',
  };
}

export function catchUpRecentGroups(userId: string, wa: WhatsAppManager): void {
  if (wa.getStatus().status !== 'CONNECTED') { historySyncAt.delete(userId); return; }
  if (Date.now() - (historySyncAt.get(userId) || 0) < 10 * 60_000) return;
  const config = loadInbox(userId).config;
  const ids = [...new Set([...config.sourceGroupIds, config.uploadedGroupId].filter(Boolean))];
  if (!ids.length) return;
  historySyncAt.set(userId, Date.now());
  void Promise.allSettled(ids.map((id) => wa.syncChatReactions(id, 200)));
}

function norm(value: string): string {
  return toEnglishDigits(value || '')
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}@.]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function emails(text: string): string[] {
  return [...new Set((text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []).map((email) => email.toLowerCase()))];
}

function candidateName(section: string, parsedName: string): string {
  const clean = (value: string) => value.trim().replace(/^[-–—•:\s]+/, '').replace(/^(?:ثلاثي|الثلاثي)\s*[:：-]\s*/i, '').replace(/[-–—•:\s]+$/, '');
  const parsed = clean(parsedName || '');
  if (parsed && !/^(ثلاثي|الثلاثي|اسم|المشترك|المتدرب)$/i.test(parsed)) return parsed;
  const lines = section.split('\n').map(clean);
  const labelIndex = lines.findIndex((line) => /اسم\s*(?:المشترك|المتدرب|الطالب)/i.test(line));
  if (labelIndex >= 0) {
    const inline = clean(lines[labelIndex].replace(/^.*?اسم\s*(?:المشترك|المتدرب|الطالب)(?:\s*(?:ثلاثي|الثلاثي|الأول|الاول|الثاني))?\s*[:：-]?/i, ''));
    if (inline && !/^(ثلاثي|الثلاثي)$/i.test(inline)) return inline;
    const next = lines.slice(labelIndex + 1).find((line) => line && !/^(عمر|الجنس|المدينة|البريد|الايميل|الإيميل|رقم|قيمة|نوع|تاريخ|اسم)/.test(line));
    if (next) return next;
  }
  const line = lines
    .find((item) => /[\u0600-\u06ff]+\s+[\u0600-\u06ff]+/.test(item)
      && !/دينار|تحويل|المنسق|الايميل|الإيميل|البريد|مبلغ|دفعة|التاريخ/.test(item));
  return clean(line || parsedName || '');
}

function splitTransfer(text: string): { name: string; email: string; amount: number | null; currency: string; draftText: string }[] {
  const normalized = toEnglishDigits(text || '');
  const foundEmails = emails(normalized);
  const whole = parseTransferText(normalized);
  // parser.ts يضع 85 افتراضياً عند غياب المبلغ؛ هنا لا نخمن مبلغاً مالياً.
  const amountWithCurrency = normalized.match(/(?:^|[^\d])(\d+(?:[.,]\d+)?)\s*(دينار|jod|دولار|usd|شيكل|ils|ريال|sar|درهم|aed|يورو|euro|eur|€)(?![\p{L}])/imu);
  const labelledAmount = normalized.match(/(?:قيمة\s*(?:الرسوم|الاشتراك|الحوالة)|المبلغ\s*(?:المحول|المدفوع)?|الرسوم)\s*[:：-]?\s*(\d+(?:[.,]\d+)?)/iu);
  const rawAmount = amountWithCurrency?.[1] || labelledAmount?.[1];
  const total = rawAmount ? Number(rawAmount.replace(',', '.')) : null;
  if (foundEmails.length < 2) {
    const name = candidateName(normalized, whole.participantName);
    return [{ name, email: foundEmails[0] || whole.email || '', amount: total, currency: whole.currency || 'JOD', draftText: normalized }];
  }

  // معظم الرسائل المشتركة تفصل بيانات كل متدرب بخط أو فراغ طويل.
  let sections = normalized.split(/^\s*[-_—–]{3,}\s*$/m).map((part) => part.trim()).filter(Boolean);
  if (sections.filter((part) => emails(part).length === 1).length !== foundEmails.length) {
    const lines = normalized.split('\n');
    const emailLines = lines.flatMap((line, index) => emails(line).map(() => index));
    sections = foundEmails.map((_, index) => {
      const start = index === 0 ? 0 : Math.floor((emailLines[index - 1] + emailLines[index]) / 2) + 1;
      const end = index === foundEmails.length - 1 ? lines.length : Math.floor((emailLines[index] + emailLines[index + 1]) / 2) + 1;
      return lines.slice(start, end).join('\n').trim();
    });
  }
  if (sections.length !== foundEmails.length) sections = foundEmails.map(() => normalized);
  const suggested = total === null ? null : Math.round((total / foundEmails.length) * 100) / 100;
  return foundEmails.map((email, index) => {
    const section = sections[index] || normalized;
    const parsed = parseTransferText(section);
    const name = candidateName(section, parsed.participantName);
    const amount = suggested;
    const hasAmount = /\b\d+(?:[.,]\d+)?\s*(?:دينار|jod|دولار|usd|شيكل|يورو|euro|eur|€)/i.test(section);
    let draftText = section;
    if (amount !== null && hasAmount && total !== null) {
      const totalPattern = new RegExp(`\\b${String(total).replace('.', '[.,]')}(?=\\s*(?:دينار|jod|دولار|usd|شيكل|يورو|euro|eur|€))`, 'i');
      draftText = draftText.replace(totalPattern, String(amount));
    } else if (amount !== null) {
      draftText = `${section}\nالمبلغ المقترح لهذا المتدرب: ${amount} ${whole.currency || 'JOD'}`;
    }
    return { name, email, amount, currency: whole.currency || 'JOD', draftText };
  });
}

function isTransferText(msg: ChatMessage): boolean {
  const text = msg.text || '';
  if (!text.trim() || msg.isDeleted) return false;
  const emailCount = emails(text).length;
  const hasNameLabel = /اسم\s*(?:المشترك|المتدرب|الطالب)/i.test(text);
  const hasPayment = /حوال[ةه]|دينار|دولار|شيكل|يورو|euro|eur|€|jod|usd|دفعة|دفع|وصل|تحويل|الرسوم|المبلغ/i.test(text);
  const parsed = emailCount > 0 ? parseTransferText(text) : null;
  const hasContactAndName = Boolean(parsed?.participantName && parsed.email && /(?:\+|00)?\d[\d\s-]{7,}\d/.test(toEnglishDigits(text)));
  return (emailCount > 0 && (hasPayment || hasNameLabel || emailCount > 1 || hasContactAndName)) || (hasNameLabel && hasPayment);
}

function sameChat(message: ChatMessage, groupId: string, groups: WhatsAppGroupItem[]): boolean {
  const group = groups.find((item) => item.id === groupId);
  return Boolean(group && (message.chatJid === group.id || message.chatName === group.name));
}

export function syncInbox(userId: string, wa: WhatsAppManager): InboxStore {
  const store = loadInbox(userId);
  const groups = wa.getUserGroups();
  const config = resolvedConfig(store, groups);
  const messages = wa.getMessages();
  const since = store.initializedAt - 3 * 24 * 60 * 60 * 1000;
  let changed = false;
  const uploadedMessages = config.uploadedGroupId
    ? messages.filter((message) => sameChat(message, config.uploadedGroupId, groups)).map((message) => norm(message.text))
    : [];

  for (const msg of messages) {
    if ((msg.timestampMs || 0) < since || !config.sourceGroupIds.some((id) => sameChat(msg, id, groups))) continue;
    const chatJid = msg.chatJid || groups.find((group) => group.name === msg.chatName)?.id || '';
    const chatName = msg.chatName || groups.find((group) => group.id === chatJid)?.name || '';
    if (isTransferText(msg)) {
      const people = splitTransfer(msg.text);
      people.forEach((person, index) => {
        const id = `${msg.id}:${index}`;
        if (store.cards[id]) {
          const current = store.cards[id];
          if (/^(ثلاثي|الثلاثي)(?:\s*[:：-]|$)/i.test(current.name) && person.name) {
            current.name = person.name;
            if (current.email && current.status === 'review') current.status = 'new';
            changed = true;
          }
          if (current.partCount === 1 && (msg.status?.airtableSaved || msg.status?.airtable) && !current.airtableSaved) { current.airtableSaved = true; changed = true; }
          if (current.partCount === 1 && (msg.status?.portalSubmitted || msg.status?.portal || msg.status?.forwardedTo?.includes('حوالات تم رفعها')) && !current.portalUploaded) { current.portalUploaded = true; changed = true; }
          return;
        }
        const nameKey = norm(person.name);
        const emailKey = person.email.toLowerCase();
        const duplicate = Object.values(store.cards).find((card) => card.id !== id && norm(card.name) === nameKey && card.email.toLowerCase() === emailKey && nameKey && emailKey && card.status !== 'duplicate');
        const card: InboxCard = {
          id, sourceMessageId: msg.id, chatJid, chatName, senderName: msg.senderName || msg.sender || '',
          timestampMs: msg.timestampMs || Date.now(), originalText: msg.text, draftText: person.draftText,
          name: person.name, email: person.email, amount: person.amount, currency: person.currency,
          partIndex: index, partCount: people.length,
          status: duplicate ? 'duplicate' : (!person.email || !person.name ? 'review' : 'new'),
          duplicateOf: duplicate?.id,
          receiptMessageId: msg.mediaUrl ? msg.id : msg.linkedMsgId,
          embeddedMediaUrl: msg.mediaUrl,
          quotedMessageId: msg.quotedMessage?.id,
          autoLinkSuppressed: Boolean(msg.status?.autoLinkSuppressed),
          portalUploaded: people.length === 1 && Boolean(msg.status?.portalSubmitted || msg.status?.portal || msg.status?.forwardedTo?.includes('حوالات تم رفعها')),
          airtableSaved: people.length === 1 && Boolean(msg.status?.airtableSaved || msg.status?.airtable),
          delivery: 'idle',
        };
        store.cards[id] = card;
        changed = true;
      });
    } else if (msg.hasMedia && msg.mediaType === 'image' && msg.mediaUrl) {
      if (store.receipts[msg.id]) {
        if (store.receipts[msg.id].mediaUrl !== msg.mediaUrl) { store.receipts[msg.id].mediaUrl = msg.mediaUrl; changed = true; }
        continue;
      }
      store.receipts[msg.id] = {
        id: msg.id, chatJid, chatName, senderName: msg.senderName || msg.sender || '',
        timestampMs: msg.timestampMs || Date.now(), mediaUrl: msg.mediaUrl,
        caption: msg.text || '', quotedMessageId: msg.quotedMessage?.id, linkedCardIds: [],
      };
      changed = true;
    }
  }

  // الرد على صورة الوصل هو رابط صريح من واتساب، حتى لو وصلت الصورة بعد النص في السجل.
  const messageById = new Map(messages.map((message) => [message.id, message]));
  for (const card of Object.values(store.cards)) {
    if (card.status === 'duplicate' || card.status === 'not_mine') continue;
    const source = messageById.get(card.sourceMessageId);
    if (!source || !config.sourceGroupIds.some((id) => sameChat(source, id, groups))) continue;
    if (source.status?.autoLinkSuppressed) {
      if (card.receiptMessageId) {
        const oldReceipt = store.receipts[card.receiptMessageId];
        if (oldReceipt) oldReceipt.linkedCardIds = oldReceipt.linkedCardIds.filter((id) => id !== card.id);
        card.receiptMessageId = undefined;
        changed = true;
      }
      if (!card.autoLinkSuppressed) { card.autoLinkSuppressed = true; changed = true; }
      continue;
    }
    if (card.autoLinkSuppressed && source.status?.autoLinkSuppressed === false && source.linkedMsgId) {
      card.autoLinkSuppressed = false;
      changed = true;
    }
    if (card.autoLinkSuppressed) continue;
    const quotedId = source.quotedMessage?.id;
    const quoted = quotedId ? messageById.get(quotedId) : undefined;
    const receiptId = [source.linkedMsgId, quotedId].find((id) => id && store.receipts[id] && store.receipts[id].chatJid === card.chatJid);
    if (!receiptId || (quotedId === receiptId && quoted && quoted.mediaType !== 'image')) continue;
    const receipt = store.receipts[receiptId];
    if (receipt.ignored || receipt.linkedCardIds.some((id) => store.cards[id] && store.cards[id].sourceMessageId !== card.sourceMessageId)) continue;
    if (card.receiptMessageId && card.receiptMessageId !== receiptId) continue;
    if (card.receiptMessageId !== receiptId) { card.receiptMessageId = receiptId; changed = true; }
    if (!receipt.linkedCardIds.includes(card.id)) { receipt.linkedCardIds.push(card.id); changed = true; }
  }

  for (const card of Object.values(store.cards)) {
    if (card.portalUploaded || (!card.email && !card.name)) continue;
    const email = card.email.toLowerCase();
    const name = norm(card.name);
    if (uploadedMessages.some((text) => (email && text.includes(email)) || (name.length >= 8 && text.includes(name)))) {
      card.portalUploaded = true;
      changed = true;
    }
  }
  if (changed) saveInbox(userId, store);
  return store;
}

export function syncAirtableInBackground(userId: string): void {
  if (airtableSyncPromises.has(userId) || Date.now() - (airtableSyncAt.get(userId) || 0) < 30_000) return;
  airtableSyncAt.set(userId, Date.now());
  const promise = getAllAirtableRecords().then((registrationRecords) => {
    const records = Array.isArray(registrationRecords) ? registrationRecords : [];
    const knownEmails = new Set<string>();
    const knownNames = new Set<string>();
    for (const record of records as { fields?: Record<string, unknown> }[]) {
      const fields = record.fields || {};
      const email = String(fields['بريد الاكتروني'] || fields['البريد الالكتروني'] || fields['البريد الإلكتروني'] || fields.Email || fields.email || '').toLowerCase().trim();
      const name = norm(String(fields['اسم المشترك'] || fields['اسم المتدرب'] || fields['الاسم'] || ''));
      if (email) knownEmails.add(email);
      if (name) knownNames.add(name);
    }
    const store = loadInbox(userId);
    let changed = false;
    for (const card of Object.values(store.cards)) {
      if (card.airtableSaved || (!card.email && !card.name)) continue;
      if (knownEmails.has(card.email.toLowerCase()) || (norm(card.name).length >= 8 && knownNames.has(norm(card.name)))) {
        card.airtableSaved = true; changed = true;
      }
    }
    if (changed) saveInbox(userId, store);
  }).catch(() => {}).finally(() => { airtableSyncPromises.delete(userId); });
  airtableSyncPromises.set(userId, promise);
}

export async function dispatchCard(userId: string, wa: WhatsAppManager, cardId: string): Promise<void> {
  const store = loadInbox(userId);
  const card = store.cards[cardId];
  if (!card || card.status !== 'received' || !['queued', 'failed'].includes(card.delivery)) return;
  if (!card.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(card.email.trim())) {
    card.delivery = 'needs_review';
    card.deliveryError = 'أكمل الاسم والإيميل قبل الإرسال';
    saveInbox(userId, store);
    return;
  }
  const receipt = card.receiptMessageId ? store.receipts[card.receiptMessageId] : undefined;
  const media = receipt?.mediaUrl || (card.receiptMessageId === card.sourceMessageId
    ? wa.getMessages().find((message) => message.id === card.sourceMessageId)?.mediaUrl : undefined);
  const target = store.config.receivedGroupId;
  if (!target) {
    card.delivery = 'failed'; card.deliveryError = 'حدد قروب تم الاستلام من إعدادات الوارد';
    saveInbox(userId, store); return;
  }
  if (receipt && !media) {
    card.delivery = 'failed'; card.deliveryError = 'صورة الوصل غير متوفرة محليًا';
    saveInbox(userId, store); return;
  }
  if (media?.startsWith('/media/')) {
    const imagePath = path.join(process.cwd(), 'public', media.slice(1));
    const backupImagePath = path.join(process.cwd(), 'whatsapp_media', path.basename(media));
    if (!fs.existsSync(imagePath) && !fs.existsSync(backupImagePath)) {
      card.delivery = 'failed'; card.deliveryError = 'صورة الوصل لم تكتمل بعد';
      card.lastDeliveryAttemptAt = Date.now();
      saveInbox(userId, store); return;
    }
  }
  const lockKey = `${userId}:${cardId}`;
  if (dispatchLocks.has(lockKey)) return;
  dispatchLocks.add(lockKey);
  card.delivery = 'sending'; card.deliveryError = undefined;
  card.lastDeliveryAttemptAt = Date.now();
  saveInbox(userId, store);
  try {
    const result = await wa.forwardMessage(target, card.draftText, media);
    card.delivery = result.success ? 'sent' : 'failed';
    card.sentMessageId = result.messageId;
    card.deliveryError = result.success ? undefined : result.message;
  } catch (error) {
    card.delivery = 'failed';
    card.deliveryError = error instanceof Error ? error.message : 'فشل الإرسال';
  } finally {
    saveInbox(userId, store);
    dispatchLocks.delete(lockKey);
  }
}

export async function dispatchReceiptFollowup(userId: string, wa: WhatsAppManager, cardId: string): Promise<void> {
  const store = loadInbox(userId);
  const card = store.cards[cardId];
  if (!card || card.delivery !== 'sent' || !card.receiptMessageId || !['queued', 'failed'].includes(card.receiptFollowup || 'idle')) return;
  const receipt = store.receipts[card.receiptMessageId];
  if (!receipt?.mediaUrl) return;
  if (receipt.mediaUrl.startsWith('/media/')) {
    const imagePath = path.join(process.cwd(), 'public', receipt.mediaUrl.slice(1));
    const backupImagePath = path.join(process.cwd(), 'whatsapp_media', path.basename(receipt.mediaUrl));
    if (!fs.existsSync(imagePath) && !fs.existsSync(backupImagePath)) {
      card.receiptFollowup = 'failed'; card.deliveryError = 'صورة الوصل لم تكتمل بعد';
      card.lastReceiptAttemptAt = Date.now(); saveInbox(userId, store); return;
    }
  }
  const target = store.config.receivedGroupId;
  if (!target) return;
  const lockKey = `${userId}:receipt:${cardId}`;
  if (dispatchLocks.has(lockKey)) return;
  dispatchLocks.add(lockKey);
  card.receiptFollowup = 'sending';
  card.lastReceiptAttemptAt = Date.now();
  saveInbox(userId, store);
  try {
    const result = await wa.forwardMessage(target, `وصل الحوالة المرتبط بـ ${card.name}`, receipt.mediaUrl, card.sentMessageId);
    card.receiptFollowup = result.success ? 'sent' : 'failed';
    card.receiptSentMessageId = result.messageId;
    card.deliveryError = result.success ? undefined : result.message;
  } catch (error) {
    card.receiptFollowup = 'failed';
    card.deliveryError = error instanceof Error ? error.message : 'فشل إرسال الوصل';
  } finally { saveInbox(userId, store); dispatchLocks.delete(lockKey); }
}

export function queueReceived(card: InboxCard): void {
  card.status = 'received';
  card.receivedAt ||= Date.now();
  card.delivery = card.partCount > 1 || !card.name || !card.email ? 'needs_review' : 'queued';
}

export function linkManualCollection(store: InboxStore, manualId: string, cardId: string): InboxCard {
  const manual = store.manualCollections[manualId];
  const card = store.cards[cardId];
  if (!manual || !card) throw new Error('سجل الاستلام أو الحوالة غير موجود');
  if (manual.linkedCardId || card.manualCollectionId) throw new Error('هذا السجل أو هذه الحوالة مربوطان بالفعل');
  if (card.status === 'duplicate' || card.status === 'not_mine' || card.delivery === 'sent' || card.delivery === 'sending') throw new Error('هذه الحوالة لا تقبل الربط');
  manual.previousCardState = { status: card.status, receivedAt: card.receivedAt, delivery: card.delivery };
  manual.linkedCardId = card.id;
  card.manualCollectionId = manual.id;
  if (card.status !== 'received') queueReceived(card);
  card.receivedAt = manual.collectedAt;
  card.delivery = 'needs_review';
  card.deliveryError = undefined;
  return card;
}

export function unlinkManualCollection(store: InboxStore, manualId: string): void {
  const manual = store.manualCollections[manualId];
  if (!manual?.linkedCardId) throw new Error('سجل الاستلام غير مربوط');
  const card = store.cards[manual.linkedCardId];
  if (card?.delivery === 'sent' || card?.delivery === 'sending') throw new Error('الحوالة أُرسلت بالفعل إلى قروب تم الاستلام');
  if (card?.manualCollectionId === manual.id) {
    card.manualCollectionId = undefined;
    if (manual.previousCardState?.status === 'received') {
      card.status = 'received';
      card.receivedAt = manual.previousCardState.receivedAt;
      card.delivery = manual.previousCardState.delivery;
    } else {
      card.status = card.name && card.email ? 'new' : 'review';
      card.receivedAt = undefined;
      card.delivery = 'idle';
    }
  }
  manual.linkedCardId = undefined;
  manual.previousCardState = undefined;
}

export async function retryPending(userId: string, wa: WhatsAppManager): Promise<void> {
  if (wa.getStatus().status !== 'CONNECTED') return;
  const store = loadInbox(userId);
  for (const card of Object.values(store.cards)) {
    if (card.delivery === 'sending' && Date.now() - (card.lastDeliveryAttemptAt || 0) > 60_000) {
      const target = store.config.receivedGroupId;
      const sent = wa.getMessages().find((message) => message.isFromMe && message.chatJid === target
        && message.text === card.draftText && (message.timestampMs || 0) >= (card.receivedAt || 0));
      if (sent) { card.delivery = 'sent'; card.sentMessageId = sent.id; saveInbox(userId, store); }
      else { card.delivery = 'failed'; card.deliveryError = 'حالة الإرسال غير مؤكدة؛ راجع القروب قبل إعادة المحاولة'; saveInbox(userId, store); }
    }
    if (card.delivery === 'queued' || (card.delivery === 'failed' && card.deliveryError !== 'حالة الإرسال غير مؤكدة؛ راجع القروب قبل إعادة المحاولة' && Date.now() - (card.lastDeliveryAttemptAt || 0) > 30_000)) {
      await dispatchCard(userId, wa, card.id);
    }
    if (card.receiptFollowup === 'sending' && Date.now() - (card.lastReceiptAttemptAt || 0) > 60_000) {
      const target = store.config.receivedGroupId;
      const sent = wa.getMessages().find((message) => message.isFromMe && message.chatJid === target
        && message.text === `وصل الحوالة المرتبط بـ ${card.name}` && (message.timestampMs || 0) >= (card.lastReceiptAttemptAt || 0));
      if (sent) { card.receiptFollowup = 'sent'; card.receiptSentMessageId = sent.id; saveInbox(userId, store); }
      else { card.receiptFollowup = 'failed'; card.deliveryError = 'حالة إرسال الوصل غير مؤكدة؛ راجع القروب'; saveInbox(userId, store); }
    }
    if (card.receiptFollowup === 'queued' || (card.receiptFollowup === 'failed' && card.deliveryError !== 'حالة إرسال الوصل غير مؤكدة؛ راجع القروب' && Date.now() - (card.lastReceiptAttemptAt || 0) > 30_000)) await dispatchReceiptFollowup(userId, wa, card.id);
  }
}
