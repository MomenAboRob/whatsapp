import fs from 'fs';
import path from 'path';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import nodemailer from 'nodemailer';
import type { ChatMessage, WhatsAppManager } from '@/lib/whatsapp-client';
import { rawWhatsAppText } from '@/lib/whatsapp-message-text';

export type MentionDecision = 'new' | 'dismissed' | 'important';
export type TaskStatus = 'open' | 'done';
export type ScheduleStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'canceled';

export interface MentionItem {
  id: string;
  chatJid: string;
  chatName: string;
  sender: string;
  text: string;
  timestampMs: number;
  decision: MentionDecision;
  task?: { title: string; dueAt: string; status: TaskStatus; attachment?: { name: string; size: number } };
  emailError?: string;
}

export interface RecipientList {
  id: string;
  name: string;
  targetJids: string[];
}

export interface ScheduledMessage {
  id: string;
  text: string;
  targetJids: string[];
  scheduledAt: string;
  status: ScheduleStatus;
  createdAt: string;
  sentTargets: string[];
  errors: Record<string, string>;
}

export interface WorkspaceSettings {
  emailTo: string;
  emailEnabled: boolean;
  browserEnabled: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPasswordEncrypted?: string;
}

export interface WorkspaceData {
  mentions: MentionItem[];
  recipientLists: RecipientList[];
  schedules: ScheduledMessage[];
  settings: WorkspaceSettings;
}

const schedulerKeys = new Set<string>();
const busyKeys = new Set<string>();
const scannedFingerprints = new Map<string, string>();

const cleanUserId = (userId: string) => userId.replace(/[^a-zA-Z0-9_-]/g, '_');
const dataPath = (userId: string) => path.join(process.cwd(), 'whatsapp_auth', `user_${cleanUserId(userId)}`, 'workspace.json');
const initialData = (): WorkspaceData => ({
  mentions: [],
  recipientLists: [],
  schedules: [],
  settings: { emailTo: '', emailEnabled: true, browserEnabled: true },
});

export function readWorkspace(userId: string): WorkspaceData {
  try {
    const data = JSON.parse(fs.readFileSync(dataPath(userId), 'utf8'));
    const defaults = initialData();
    return {
      mentions: Array.isArray(data.mentions) ? data.mentions : [],
      recipientLists: Array.isArray(data.recipientLists) ? data.recipientLists : [],
      schedules: Array.isArray(data.schedules) ? data.schedules : [],
      settings: { ...defaults.settings, ...(data.settings || {}) },
    };
  } catch {
    return initialData();
  }
}

export function saveWorkspace(userId: string, data: WorkspaceData): void {
  const file = dataPath(userId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temp, file);
}

export function smtpConfigured(settings?: WorkspaceSettings): boolean {
  return Boolean(
    (settings?.smtpHost && settings.smtpUser && settings.smtpPasswordEncrypted && process.env.SESSION_SECRET) ||
    (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  );
}

function cipherKey(): Buffer {
  if (!process.env.SESSION_SECRET) throw new Error('مفتاح تشفير الإعدادات غير متاح');
  return createHash('sha256').update(process.env.SESSION_SECRET).digest();
}

export function encryptSmtpPassword(password: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

function decryptSmtpPassword(value: string): string {
  const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', cipherKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function mentionJids(raw: unknown): string[] {
  const found = new Set<string>();
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 8) return;
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, depth + 1));
      return;
    }
    const record = node as Record<string, unknown>;
    if (Array.isArray(record.mentionedJid)) {
      record.mentionedJid.forEach((jid: unknown) => {
        if (typeof jid === 'string') found.add(jid);
      });
    }
    for (const [key, value] of Object.entries(record)) {
      if (key === 'rawBaileysMessage' || key === 'quotedMessage') continue;
      if (value && typeof value === 'object') visit(value, depth + 1);
    }
  };
  const message = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).message : undefined;
  visit(message || raw, 0);
  return [...found];
}

export function isMentionForMe(message: ChatMessage, wa: WhatsAppManager): boolean {
  if (message.isFromMe || !message.chatJid?.endsWith('@g.us')) return false;
  const me = wa.getStatus().user;
  if (!me) return false;
  const ownJid = wa.getCanonicalChatJid(me.jid);
  const ownPhone = me.phone.replace(/\D/g, '');
  return mentionJids(message.rawBaileysMessage).some((jid) => {
    const canonical = wa.getCanonicalChatJid(jid);
    const digits = canonical.split('@')[0].replace(/\D/g, '');
    return canonical === ownJid || (ownPhone && digits === ownPhone);
  });
}

function toMention(message: ChatMessage, wa: WhatsAppManager): MentionItem {
  const original = rawWhatsAppText(message.rawBaileysMessage);
  return {
    id: message.id,
    chatJid: message.chatJid || '',
    chatName: message.chatName || 'مجموعة',
    sender: message.senderName || message.sender || 'عضو',
    text: (original ? wa.decodeMentions(original) : message.text) || (message.hasMedia ? 'وسائط' : ''),
    timestampMs: message.timestampMs || Date.now(),
    decision: 'new',
  };
}

export function scanMentions(wa: WhatsAppManager): WorkspaceData {
  const data = readWorkspace(wa.userId);
  const messages = wa.getMessages();
  const fingerprint = `${wa.getStatus().user?.jid || ''}:${messages.length}:${messages[0]?.id || ''}`;
  if (scannedFingerprints.get(wa.userId) === fingerprint) return data;
  const known = new Map(data.mentions.map((mention) => [mention.id, mention]));
  let changed = false;
  for (const message of messages) {
    const existing = known.get(message.id);
    if (existing) {
      const original = rawWhatsAppText(message.rawBaileysMessage);
      if (original && existing.text.includes('(رسائلي)')) {
        const cleanText = wa.decodeMentions(original);
        if (cleanText !== existing.text) {
          const oldText = existing.text;
          existing.text = cleanText;
          if (existing.task?.title === oldText.slice(0, 160)) existing.task.title = cleanText.slice(0, 160);
          changed = true;
        }
      }
      continue;
    }
    if (!isMentionForMe(message, wa)) continue;
    const mention = toMention(message, wa);
    data.mentions.push(mention);
    known.set(message.id, mention);
    changed = true;
  }
  if (changed) {
    data.mentions.sort((a, b) => b.timestampMs - a.timestampMs);
    data.mentions = data.mentions.slice(0, 3000);
    saveWorkspace(wa.userId, data);
  }
  scannedFingerprints.set(wa.userId, fingerprint);
  return data;
}

function smtpTransport(settings: WorkspaceSettings) {
  if (!smtpConfigured(settings)) throw new Error('أكمل بيانات SMTP أولًا');
  const custom = Boolean(settings.smtpHost && settings.smtpUser && settings.smtpPasswordEncrypted);
  const port = Number(custom ? settings.smtpPort || 465 : process.env.SMTP_PORT || 587);
  const host = custom ? settings.smtpHost : process.env.SMTP_HOST;
  const user = custom ? settings.smtpUser : process.env.SMTP_USER;
  const password = custom ? decryptSmtpPassword(settings.smtpPasswordEncrypted!) : process.env.SMTP_PASS;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: user!, pass: password! },
  });
  return { transporter, user, custom };
}

export async function verifySmtp(settings: WorkspaceSettings): Promise<void> {
  const { transporter } = smtpTransport(settings);
  await transporter.verify();
}

async function sendMentionEmail(mention: MentionItem, settings: WorkspaceSettings): Promise<void> {
  if (!settings.emailEnabled || !settings.emailTo || !smtpConfigured(settings)) return;
  const { transporter, user, custom } = smtpTransport(settings);
  await transporter.sendMail({
    from: custom ? user : process.env.SMTP_FROM || user,
    to: settings.emailTo,
    subject: `منشن جديد في ${mention.chatName}`,
    text: `ذكرك ${mention.sender} في مجموعة ${mention.chatName}.\n\n${mention.text}\n\nافتح لوحة المنشنات في التطبيق للمتابعة.`,
  });
}

export async function recordLiveMention(wa: WhatsAppManager, message: ChatMessage): Promise<void> {
  if (!isMentionForMe(message, wa)) return;
  const data = readWorkspace(wa.userId);
  if (data.mentions.some((item) => item.id === message.id)) return;
  const mention = toMention(message, wa);
  data.mentions.unshift(mention);
  data.mentions = data.mentions.slice(0, 3000);
  saveWorkspace(wa.userId, data);
  try {
    await sendMentionEmail(mention, data.settings);
  } catch (error) {
    const latest = readWorkspace(wa.userId);
    const stored = latest.mentions.find((item) => item.id === mention.id);
    if (stored) {
      stored.emailError = error instanceof Error ? error.message.slice(0, 180) : 'تعذر إرسال البريد';
      saveWorkspace(wa.userId, latest);
    }
  }
}

export function knownDirectTargets(wa: WhatsAppManager): Map<string, string> {
  return new Map(wa.getUserGroups()
    .filter((group) => group.name && /@(s\.whatsapp\.net|lid)$/.test(group.id))
    .map((group) => [group.id, group.name]));
}

export function validateTargets(wa: WhatsAppManager, targets: unknown): string[] {
  if (!Array.isArray(targets) || targets.length < 1 || targets.length > 100) throw new Error('اختر من 1 إلى 100 جهة اتصال');
  const known = knownDirectTargets(wa);
  const unique = [...new Set(targets)];
  if (unique.some((jid) => typeof jid !== 'string' || !known.has(jid))) throw new Error('توجد جهة اتصال غير صالحة');
  return unique as string[];
}

export function createSchedule(wa: WhatsAppManager, text: string, targets: string[], scheduledAt: string): ScheduledMessage {
  const when = new Date(scheduledAt).getTime();
  if (!Number.isFinite(when) || when < Date.now() + 60_000 || when > Date.now() + 365 * 86400_000) {
    throw new Error('اختر موعدًا بعد دقيقة على الأقل وخلال سنة');
  }
  const data = readWorkspace(wa.userId);
  const schedule: ScheduledMessage = {
    id: randomUUID(), text, targetJids: targets, scheduledAt: new Date(when).toISOString(),
    status: 'pending', createdAt: new Date().toISOString(), sentTargets: [], errors: {},
  };
  data.schedules.unshift(schedule);
  data.schedules = data.schedules.slice(0, 500);
  saveWorkspace(wa.userId, data);
  return schedule;
}

export async function sendToTargets(wa: WhatsAppManager, text: string, targets: string[]): Promise<Record<string, { success: boolean; error?: string }>> {
  const results: Record<string, { success: boolean; error?: string }> = {};
  for (const jid of targets) {
    try {
      const result = await wa.forwardMessage(jid, text);
      results[jid] = result.success ? { success: true } : { success: false, error: result.message };
    } catch (error) {
      results[jid] = { success: false, error: error instanceof Error ? error.message : 'تعذر الإرسال' };
    }
  }
  return results;
}

export async function processDueSchedules(wa: WhatsAppManager): Promise<void> {
  if (busyKeys.has(wa.userId)) return;
  busyKeys.add(wa.userId);
  try {
    const dueIds = readWorkspace(wa.userId).schedules
      .filter((item) => item.status === 'pending' && new Date(item.scheduledAt).getTime() <= Date.now())
      .map((item) => item.id);
    for (const id of dueIds) {
      let data = readWorkspace(wa.userId);
      let item = data.schedules.find((schedule) => schedule.id === id);
      if (!item || item.status !== 'pending') continue;
      item.status = 'sending';
      saveWorkspace(wa.userId, data);
      if (Date.now() - new Date(item.scheduledAt).getTime() > 5 * 60_000) {
        data = readWorkspace(wa.userId);
        item = data.schedules.find((schedule) => schedule.id === id);
        if (!item) continue;
        item.status = 'failed';
        item.errors._timing = 'فات الموعد أثناء توقف الخادم؛ لم تُرسل الرسالة';
        saveWorkspace(wa.userId, data);
        continue;
      }
      if (wa.getStatus().status !== 'CONNECTED') {
        data = readWorkspace(wa.userId);
        item = data.schedules.find((schedule) => schedule.id === id);
        if (!item) continue;
        item.status = 'failed';
        item.errors._connection = 'واتساب غير متصل وقت الإرسال';
        saveWorkspace(wa.userId, data);
        continue;
      }
      for (const jid of [...item.targetJids]) {
        if (item.sentTargets.includes(jid)) continue;
        const result = await sendToTargets(wa, item.text, [jid]);
        data = readWorkspace(wa.userId);
        item = data.schedules.find((schedule) => schedule.id === id);
        if (!item) break;
        if (result[jid]?.success) item.sentTargets.push(jid);
        else item.errors[jid] = result[jid]?.error || 'تعذر الإرسال';
        saveWorkspace(wa.userId, data);
      }
      data = readWorkspace(wa.userId);
      item = data.schedules.find((schedule) => schedule.id === id);
      if (!item) continue;
      item.status = Object.keys(item.errors).length ? 'failed' : 'sent';
      saveWorkspace(wa.userId, data);
    }
  } finally {
    busyKeys.delete(wa.userId);
  }
}

export function startWorkspaceScheduler(wa: WhatsAppManager): void {
  if (schedulerKeys.has(wa.userId)) return;
  schedulerKeys.add(wa.userId);
  const timer = setInterval(() => {
    void processDueSchedules(wa).catch((error) => console.error('Scheduled message error:', error));
  }, 15_000);
  timer.unref();
}
