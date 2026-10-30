import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import readline from 'node:readline';
import { getWhatsAppManager, type WhatsAppGroupItem } from '@/lib/whatsapp-client';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

type SavedConnection = { refreshToken: string; email: string; connectedAt: string };
type BackupEntry = { id: string; name: string; size?: string; createdTime?: string; md5Checksum?: string };

function credentials() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new Error('إعداد ربط Google Drive غير مكتمل على الخادم.');
  return { clientId, clientSecret, redirectUri };
}

export function isDriveConfigured() {
  try { credentials(); encryptionKey(); return true; } catch { return false; }
}

function encryptionKey() {
  const secret = process.env.GOOGLE_DRIVE_BACKUP_KEY;
  if (!secret || secret.length < 32) throw new Error('مفتاح حماية النسخ غير مضبوط.');
  return crypto.createHash('sha256').update(`hawalat-drive-backup-v1:${secret}`).digest();
}

function connectionPath(userId: string) {
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(process.cwd(), 'whatsapp_auth', `user_${safeId}`, 'google_drive_connection.json');
}

function readConnection(userId: string): SavedConnection | null {
  try {
    const payload = JSON.parse(fs.readFileSync(connectionPath(userId), 'utf8'));
    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]);
    return JSON.parse(plain.toString('utf8')) as SavedConnection;
  } catch { return null; }
}

export function saveDriveConnection(userId: string, connection: SavedConnection) {
  const file = connectionPath(userId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(connection), 'utf8'), cipher.final()]);
  const payload = JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
  fs.writeFileSync(`${file}.tmp`, payload, { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
}

export function getDriveConnection(userId: string) {
  const connection = readConnection(userId);
  return connection ? { email: connection.email, connectedAt: connection.connectedAt } : null;
}

export function disconnectDrive(userId: string) {
  try { fs.unlinkSync(connectionPath(userId)); } catch (error: any) { if (error?.code !== 'ENOENT') throw error; }
}

export function createGoogleAuthUrl(state: string) {
  const { clientId, redirectUri } = credentials();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', `${DRIVE_SCOPE} https://www.googleapis.com/auth/userinfo.email`);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'select_account consent');
  url.searchParams.set('state', state);
  return url;
}

async function tokenRequest(params: URLSearchParams) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params, cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('تعذر إتمام ربط حساب Google.');
  return data as { access_token: string; refresh_token?: string };
}

export async function exchangeGoogleCode(userId: string, code: string) {
  const { clientId, clientSecret, redirectUri } = credentials();
  const tokens = await tokenRequest(new URLSearchParams({
    code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code',
  }));
  const previous = readConnection(userId);
  if (!tokens.refresh_token && !previous) throw new Error('لم يمنح Google إذن النسخ المستمر. أعد الربط.');
  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: 'no-store',
  });
  if (!profileResponse.ok) throw new Error('تعذر التحقق من بريد Google المختار.');
  const profile = await profileResponse.json();
  const email = String(profile.email || '');
  if (!email) throw new Error('تعذر قراءة بريد Google المختار.');
  if (!tokens.refresh_token && previous?.email !== email) throw new Error('لم يصل رمز وصول مستمر للحساب الجديد. أعد اختيار الحساب.');
  saveDriveConnection(userId, { refreshToken: tokens.refresh_token || previous!.refreshToken, email, connectedAt: new Date().toISOString() });
}

async function accessToken(userId: string) {
  const connection = readConnection(userId);
  if (!connection) throw new Error('اربط حساب Google Drive أولاً.');
  const { clientId, clientSecret } = credentials();
  const tokens = await tokenRequest(new URLSearchParams({
    refresh_token: connection.refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token',
  }));
  return tokens.access_token;
}

async function driveRequest(userId: string, url: string, init: RequestInit = {}) {
  const token = await accessToken(userId);
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`تعذر الاتصال بـ Google Drive (${response.status}).`);
  return response;
}

export async function listDriveBackups(userId: string): Promise<BackupEntry[]> {
  if (!readConnection(userId)) return [];
  const result: BackupEntry[] = [];
  let pageToken = '';
  do {
    const url = new URL(DRIVE_API);
    url.searchParams.set('q', `appProperties has { key='hawalatUserId' and value='${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}' } and trashed = false`);
    url.searchParams.set('fields', 'nextPageToken,files(id,name,size,createdTime,md5Checksum)');
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const data = await (await driveRequest(userId, url.toString())).json();
    result.push(...(data.files || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return result.sort((a, b) => String(b.createdTime || '').localeCompare(String(a.createdTime || '')));
}

function referencedMedia(messages: any[]) {
  const names = new Set<string>();
  for (const message of messages) {
    for (const value of [message.mediaUrl, message.linkedReceiptUrl, message.quotedMessage?.mediaUrl]) {
      if (typeof value !== 'string' || !value.startsWith('/media/')) continue;
      const name = value.slice('/media/'.length).split('?')[0];
      if (/^[a-zA-Z0-9_.-]{1,255}$/.test(name) && !name.includes('..')) names.add(name);
    }
  }
  return Array.from(names);
}

function tempDirectory() {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), 'hawalat-drive-'));
}

async function buildArchive(userId: string, outputFile: string) {
  const wa = getWhatsAppManager(userId);
  const messages = wa.getMessages();
  const groups = wa.getUserGroups();
  const mediaDir = path.join(process.cwd(), 'whatsapp_media');
  const names = referencedMedia(messages);
  const present = names.filter((name) => fs.existsSync(path.join(mediaDir, name)));
  const missingMedia = names.length - present.length;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const output = fs.createWriteStream(outputFile, { flags: 'wx', mode: 0o600 });
  output.write(iv);
  async function* records() {
    yield `${JSON.stringify({ type: 'header', version: 1, userId, createdAt: new Date().toISOString(), messageCount: messages.length, chatCount: groups.length, mediaCount: present.length, missingMedia })}\n`;
    yield `${JSON.stringify({ type: 'messages', data: messages })}\n`;
    yield `${JSON.stringify({ type: 'groups', data: groups })}\n`;
    for (const name of present) {
      const data = await fs.promises.readFile(path.join(mediaDir, name));
      yield `${JSON.stringify({ type: 'media', name, data: data.toString('base64') })}\n`;
    }
  }
  await pipeline(Readable.from(records()), createGzip(), cipher, output);
  await fs.promises.appendFile(outputFile, cipher.getAuthTag());
  return { messages: messages.length, chats: groups.length, media: present.length, missingMedia };
}

export async function backupToDrive(userId: string) {
  const tempDir = await tempDirectory();
  try {
    const archive = path.join(tempDir, 'backup.bin');
    const counts = await buildArchive(userId, archive);
    const size = (await fs.promises.stat(archive)).size;
    const name = `hawalat-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.hbk`;
    const metadata = {
      name, mimeType: 'application/octet-stream',
      appProperties: { hawalatUserId: userId.replace(/[^a-zA-Z0-9_-]/g, '_') },
    };
    const start = await driveRequest(userId, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,md5Checksum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/octet-stream', 'X-Upload-Content-Length': String(size) },
      body: JSON.stringify(metadata),
    });
    const uploadUrl = start.headers.get('Location');
    if (!uploadUrl || !uploadUrl.startsWith('https://www.googleapis.com/')) throw new Error('لم يبدأ رفع النسخة إلى Drive.');
    const uploaded = await driveRequest(userId, uploadUrl, {
      method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) },
      body: Readable.toWeb(fs.createReadStream(archive)) as ReadableStream,
      duplex: 'half',
    } as RequestInit);
    const file = await uploaded.json() as BackupEntry;
    if (!file.id || Number(file.size) !== size) throw new Error('لم يتأكد اكتمال النسخة على Drive.');
    if (file.md5Checksum) {
      const digest = crypto.createHash('md5');
      for await (const chunk of fs.createReadStream(archive)) digest.update(chunk);
      if (digest.digest('hex') !== file.md5Checksum) throw new Error('فشل التحقق من سلامة النسخة على Drive.');
    }
    return { ...counts, fileId: file.id, fileName: name };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

export async function restoreFromDrive(userId: string, fileId: string) {
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(fileId)) throw new Error('معرّف النسخة غير صالح.');
  const backups = await listDriveBackups(userId);
  const selected = backups.find((backup) => backup.id === fileId);
  if (!selected) throw new Error('النسخة غير موجودة في حساب Drive المختار.');
  const tempDir = await tempDirectory();
  try {
    const encryptedFile = path.join(tempDir, 'backup.bin');
    const response = await driveRequest(userId, `${DRIVE_API}/${encodeURIComponent(fileId)}?alt=media`);
    if (!response.body) throw new Error('النسخة فارغة.');
    await pipeline(Readable.fromWeb(response.body as any), fs.createWriteStream(encryptedFile));
    const stat = await fs.promises.stat(encryptedFile);
    if (stat.size < 29 || (selected.size && Number(selected.size) !== stat.size)) throw new Error('النسخة ناقصة.');
    if (selected.md5Checksum) {
      const digest = crypto.createHash('md5');
      for await (const chunk of fs.createReadStream(encryptedFile)) digest.update(chunk);
      if (digest.digest('hex') !== selected.md5Checksum) throw new Error('فشل التحقق من سلامة الملف.');
    }
    const handle = await fs.promises.open(encryptedFile, 'r');
    const iv = Buffer.alloc(12);
    const tag = Buffer.alloc(16);
    try {
      await handle.read(iv, 0, 12, 0);
      await handle.read(tag, 0, 16, stat.size - 16);
    } finally { await handle.close(); }
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const recordsFile = path.join(tempDir, 'records.jsonl');
    await pipeline(
      fs.createReadStream(encryptedFile, { start: 12, end: stat.size - 17 }),
      decipher,
      createGunzip(),
      fs.createWriteStream(recordsFile, { mode: 0o600 }),
    );
    const lines = readline.createInterface({ input: fs.createReadStream(recordsFile), crlfDelay: Infinity });
    let header: any = null;
    let messages: any[] | null = null;
    let groups: WhatsAppGroupItem[] | null = null;
    let mediaCount = 0;
    const stagedMediaDir = path.join(tempDir, 'media');
    await fs.promises.mkdir(stagedMediaDir);
    for await (const line of lines) {
      const record = JSON.parse(line);
      if (record.type === 'header') {
        if (header || record.version !== 1 || record.userId !== userId) throw new Error('النسخة لا تخص هذا المستخدم.');
        header = record;
      } else if (record.type === 'messages') {
        if (!header || !Array.isArray(record.data)) throw new Error('سجل الرسائل في النسخة غير صالح.');
        messages = record.data;
      } else if (record.type === 'groups') {
        if (!header || !Array.isArray(record.data)) throw new Error('سجل المحادثات في النسخة غير صالح.');
        groups = record.data;
      } else if (record.type === 'media') {
        if (!header || typeof record.name !== 'string' || !/^[a-zA-Z0-9_.-]{1,255}$/.test(record.name) || record.name.includes('..') || typeof record.data !== 'string') throw new Error('ملف وسائط غير صالح في النسخة.');
        await fs.promises.writeFile(path.join(stagedMediaDir, record.name), Buffer.from(record.data, 'base64'));
        mediaCount++;
      } else throw new Error('صيغة النسخة غير معروفة.');
    }
    if (!header || !messages || !groups || messages.length !== header.messageCount || groups.length !== header.chatCount || mediaCount !== header.mediaCount) throw new Error('النسخة غير مكتملة.');
    const mediaDir = path.join(process.cwd(), 'whatsapp_media');
    await fs.promises.mkdir(mediaDir, { recursive: true });
    for (const name of await fs.promises.readdir(stagedMediaDir)) {
      const target = path.join(mediaDir, name);
      if (!fs.existsSync(target)) await fs.promises.copyFile(path.join(stagedMediaDir, name), target);
    }
    const merged = getWhatsAppManager(userId).mergeRestoredHistory(messages, groups);
    return { ...merged, media: mediaCount, missingMediaInBackup: header.missingMedia || 0 };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}
