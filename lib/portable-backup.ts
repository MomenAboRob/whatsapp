import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { getWhatsAppManager, type WhatsAppGroupItem } from '@/lib/whatsapp-client';

export type PortableBackupCounts = { messages: number; chats: number; media: number; missingMedia: number };

function backupScratchRoot() {
  const preferred = process.env.HAWALAT_BACKUP_TEMP_DIR;
  if (preferred) {
    fs.mkdirSync(preferred, { recursive: true });
    return preferred;
  }
  const systemTemp = os.tmpdir();
  if (process.platform !== 'win32') return systemTemp;
  try {
    const stat = fs.statfsSync(systemTemp);
    if (stat.bavail * stat.bsize >= 2 * 1024 ** 3) return systemTemp;
  } catch {}
  for (let code = 68; code <= 90; code++) {
    const root = `${String.fromCharCode(code)}:\\`;
    try {
      const stat = fs.statfsSync(root);
      if (stat.bavail * stat.bsize < 5 * 1024 ** 3) continue;
      const scratch = path.join(root, 'HawalatBackupTemp');
      fs.mkdirSync(scratch, { recursive: true });
      return scratch;
    } catch {}
  }
  return systemTemp;
}

function mediaNames(messages: any[]) {
  const names = new Set<string>();
  for (const message of messages) {
    for (const url of [message.mediaUrl, message.linkedReceiptUrl, message.quotedMessage?.mediaUrl]) {
      if (typeof url !== 'string' || !url.startsWith('/media/')) continue;
      const name = url.slice('/media/'.length).split('?')[0];
      if (/^[a-zA-Z0-9_.-]{1,255}$/.test(name) && !name.includes('..')) names.add(name);
    }
  }
  return Array.from(names);
}

export async function createPortableBackupAt(userId: string, filePath: string) {
  const manager = getWhatsAppManager(userId);
  const messages = manager.getMessages();
  const groups = manager.getUserGroups();
  const mediaDir = path.join(process.cwd(), 'whatsapp_media');
  const names = mediaNames(messages);
  const present = names.filter((name) => fs.existsSync(path.join(mediaDir, name)));
  const listsFile = path.join(process.cwd(), 'whatsapp_auth', `user_${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}`, 'custom_lists.json');
  let lists: Record<string, string[]> = {};
  try { lists = JSON.parse(await fs.promises.readFile(listsFile, 'utf8')); } catch {}
  const counts: PortableBackupCounts = {
    messages: messages.length, chats: groups.length, media: present.length, missingMedia: names.length - present.length,
  };
  async function* records() {
    yield `${JSON.stringify({ type: 'header', version: 1, userId, createdAt: new Date().toISOString(), ...counts })}\n`;
    yield `${JSON.stringify({ type: 'messages', data: messages })}\n`;
    yield `${JSON.stringify({ type: 'groups', data: groups })}\n`;
    yield `${JSON.stringify({ type: 'lists', data: lists })}\n`;
    for (const name of present) {
      const bytes = await fs.promises.readFile(path.join(mediaDir, name));
      yield `${JSON.stringify({ type: 'media', name, data: bytes.toString('base64') })}\n`;
    }
  }
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await pipeline(Readable.from(records()), createGzip(), fs.createWriteStream(filePath, { mode: 0o600 }));
    return { filePath, counts };
  } catch (error) {
    await fs.promises.rm(filePath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function createPortableBackup(userId: string) {
  const tempDir = await fs.promises.mkdtemp(path.join(backupScratchRoot(), 'hawalat-export-'));
  try {
    const archive = await createPortableBackupAt(userId, path.join(tempDir, 'hawalat-backup.jsonl.gz'));
    return { ...archive, tempDir };
  } catch (error) {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

export async function restorePortableBackup(userId: string, compressedFile: string) {
  const tempDir = await fs.promises.mkdtemp(path.join(backupScratchRoot(), 'hawalat-import-'));
  try {
    const recordsFile = path.join(tempDir, 'records.jsonl');
    await pipeline(fs.createReadStream(compressedFile), createGunzip(), fs.createWriteStream(recordsFile, { mode: 0o600 }));
    const stagedMediaDir = path.join(tempDir, 'media');
    await fs.promises.mkdir(stagedMediaDir);
    const lines = readline.createInterface({ input: fs.createReadStream(recordsFile), crlfDelay: Infinity });
    let header: any;
    let messages: any[] | null = null;
    let groups: WhatsAppGroupItem[] | null = null;
    let lists: Record<string, string[]> | null = null;
    let mediaCount = 0;
    for await (const line of lines) {
      const record = JSON.parse(line);
      if (record.type === 'header') {
        if (header || record.version !== 1 || record.userId !== userId) throw new Error('هذه النسخة لا تخص حسابك في التطبيق.');
        header = record;
      } else if (record.type === 'messages') {
        if (!header || !Array.isArray(record.data)) throw new Error('سجل الرسائل غير صالح.');
        messages = record.data;
      } else if (record.type === 'groups') {
        if (!header || !Array.isArray(record.data)) throw new Error('قائمة المحادثات غير صالحة.');
        groups = record.data;
      } else if (record.type === 'lists') {
        if (!header || !record.data || typeof record.data !== 'object' || Array.isArray(record.data)) throw new Error('قوائم التطبيق غير صالحة.');
        lists = record.data;
      } else if (record.type === 'media') {
        if (!header || typeof record.name !== 'string' || !/^[a-zA-Z0-9_.-]{1,255}$/.test(record.name) || record.name.includes('..') || typeof record.data !== 'string') throw new Error('ملف وسائط غير صالح.');
        await fs.promises.writeFile(path.join(stagedMediaDir, record.name), Buffer.from(record.data, 'base64'));
        mediaCount++;
      } else throw new Error('صيغة النسخة غير معروفة.');
    }
    if (!header || !messages || !groups || messages.length !== header.messages || groups.length !== header.chats || mediaCount !== header.media) throw new Error('النسخة غير مكتملة.');
    const mediaDir = path.join(process.cwd(), 'whatsapp_media');
    await fs.promises.mkdir(mediaDir, { recursive: true });
    for (const name of await fs.promises.readdir(stagedMediaDir)) {
      const target = path.join(mediaDir, name);
      if (!fs.existsSync(target)) await fs.promises.copyFile(path.join(stagedMediaDir, name), target);
    }
    const merged = getWhatsAppManager(userId).mergeRestoredHistory(messages, groups);
    if (lists) {
      const file = path.join(process.cwd(), 'whatsapp_auth', `user_${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}`, 'custom_lists.json');
      let current: Record<string, string[]> = {};
      try { current = JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch {}
      for (const [name, members] of Object.entries(lists)) {
        if (!name || name.length > 80 || !Array.isArray(members) || members.some((member) => typeof member !== 'string')) continue;
        current[name] = Array.from(new Set([...(current[name] || []), ...members]));
      }
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(`${file}.tmp`, JSON.stringify(current));
      await fs.promises.rename(`${file}.tmp`, file);
    }
    return { ...merged, media: mediaCount, missingMediaInBackup: header.missingMedia || 0 };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}
