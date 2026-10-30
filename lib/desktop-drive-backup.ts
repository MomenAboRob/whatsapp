import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { createPortableBackupAt, restorePortableBackup } from '@/lib/portable-backup';

type DesktopConfig = { folder: string; intervalHours: 24 | 168; lastBackupAt?: string };
type BackupFile = { name: string; size: number; createdAt: string };

const activeBackups = new Set<string>();
const globalScheduler = globalThis as typeof globalThis & { hawalatDesktopBackupScheduler?: NodeJS.Timeout };

function safeUserId(userId: string) { return userId.replace(/[^a-zA-Z0-9_-]/g, '_'); }
function configFile(userId: string) {
  return path.join(process.cwd(), 'whatsapp_auth', `user_${safeUserId(userId)}`, 'desktop_drive_backup.json');
}

function readConfig(userId: string): DesktopConfig | null {
  try {
    const config = JSON.parse(fs.readFileSync(configFile(userId), 'utf8'));
    if (typeof config.folder !== 'string' || ![24, 168].includes(config.intervalHours)) return null;
    return config;
  } catch { return null; }
}

function writeConfig(userId: string, config: DesktopConfig) {
  const file = configFile(userId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(config));
  fs.renameSync(`${file}.tmp`, file);
}

export function findDriveFolders() {
  if (process.platform !== 'win32') return [];
  const candidates = new Set<string>();
  for (let code = 67; code <= 90; code++) {
    const root = `${String.fromCharCode(code)}:\\`;
    const myDrive = path.join(root, 'My Drive');
    try {
      if (fs.existsSync(myDrive) && fs.statSync(myDrive).isDirectory()) candidates.add(path.resolve(myDrive));
    } catch {}
  }
  for (const candidate of [path.join(os.homedir(), 'My Drive'), path.join(os.homedir(), 'Google Drive', 'My Drive')]) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) candidates.add(path.resolve(candidate));
    } catch {}
  }
  return Array.from(candidates);
}

function backupFolder(userId: string, config: DesktopConfig) {
  const allowed = findDriveFolders();
  const selected = path.resolve(config.folder);
  if (!allowed.some((candidate) => candidate.toLowerCase() === selected.toLowerCase())) {
    throw new Error('مجلد Google Drive المختار غير متصل الآن. افتح Drive للكمبيوتر أو اختر المجلد مجددًا.');
  }
  return path.join(selected, 'Hawalat Backups', safeUserId(userId));
}

export function getDesktopBackupStatus(userId: string) {
  const folders = findDriveFolders();
  const config = readConfig(userId);
  let backups: BackupFile[] = [];
  let folderAvailable = false;
  if (config) {
    try {
      const destination = backupFolder(userId, config);
      folderAvailable = true;
      if (fs.existsSync(destination)) {
        backups = fs.readdirSync(destination, { withFileTypes: true })
          .filter((item) => item.isFile() && item.name.startsWith(`hawalat-${safeUserId(userId)}-`) && item.name.endsWith('.jsonl.gz'))
          .map((item) => {
            const stat = fs.statSync(path.join(destination, item.name));
            return { name: item.name, size: stat.size, createdAt: stat.birthtime.toISOString() };
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }
    } catch { folderAvailable = false; }
  }
  return { folders, config, folderAvailable, backups, busy: activeBackups.has(userId) };
}

export function selectDriveFolder(userId: string, folder: string, intervalHours: 24 | 168) {
  if (![24, 168].includes(intervalHours)) throw new Error('تكرار النسخ غير صالح.');
  const selected = path.resolve(folder);
  if (!findDriveFolders().some((candidate) => candidate.toLowerCase() === selected.toLowerCase())) {
    throw new Error('اختر مجلدًا من مجلدات Google Drive المكتشفة.');
  }
  const previous = readConfig(userId);
  writeConfig(userId, { folder: selected, intervalHours, lastBackupAt: previous?.folder.toLowerCase() === selected.toLowerCase() ? previous.lastBackupAt : undefined });
}

export async function backupToDesktopDrive(userId: string) {
  const config = readConfig(userId);
  if (!config) throw new Error('اختر حساب Drive ومجلده أولًا.');
  if (activeBackups.has(userId)) throw new Error('هناك نسخة قيد الحفظ.');
  const destination = backupFolder(userId, config);
  activeBackups.add(userId);
  try {
    await fs.promises.mkdir(destination, { recursive: true });
    const name = `hawalat-${safeUserId(userId)}-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl.gz`;
    const target = path.join(destination, name);
    const pending = `${target}.uploading`;
    try {
      const archive = await createPortableBackupAt(userId, pending);
      await pipeline(fs.createReadStream(pending), createGunzip(), new Writable({ write(_chunk, _encoding, callback) { callback(); } }));
      await fs.promises.rename(pending, target);
      writeConfig(userId, { ...config, lastBackupAt: new Date().toISOString() });
      return { ...archive.counts, name, size: (await fs.promises.stat(target)).size, folder: destination };
    } catch (error) {
      await fs.promises.rm(pending, { force: true }).catch(() => {});
      throw error;
    }
  } finally { activeBackups.delete(userId); }
}

export async function restoreFromDesktopDrive(userId: string, name: string) {
  if (!/^hawalat-[a-zA-Z0-9_-]+-\d{4}-.*\.jsonl\.gz$/.test(name) || name !== path.basename(name) || !name.startsWith(`hawalat-${safeUserId(userId)}-`)) {
    throw new Error('اسم النسخة غير صالح.');
  }
  const config = readConfig(userId);
  if (!config) throw new Error('اختر مجلد Drive أولًا.');
  const file = path.join(backupFolder(userId, config), name);
  if (!fs.existsSync(file)) throw new Error('لم تعد النسخة موجودة في مجلد Drive المختار.');
  return restorePortableBackup(userId, file);
}

export function startDesktopBackupScheduler() {
  if (globalScheduler.hawalatDesktopBackupScheduler) return;
  const check = async () => {
    const root = path.join(process.cwd(), 'whatsapp_auth');
    if (!fs.existsSync(root)) return;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('user_')) continue;
      const userId = entry.name.slice(5);
      const config = readConfig(userId);
      if (!config || activeBackups.has(userId)) continue;
      const last = config.lastBackupAt ? Date.parse(config.lastBackupAt) : 0;
      if (Number.isFinite(last) && Date.now() - last < config.intervalHours * 60 * 60 * 1000) continue;
      try { await backupToDesktopDrive(userId); }
      catch (error: any) { console.warn(`[Drive Desktop] تعذر النسخ التلقائي للمستخدم ${userId}:`, error?.message || error); }
    }
  };
  globalScheduler.hawalatDesktopBackupScheduler = setInterval(() => { void check(); }, 30 * 60 * 1000);
  globalScheduler.hawalatDesktopBackupScheduler.unref();
  setTimeout(() => { void check(); }, 60 * 1000).unref();
}
