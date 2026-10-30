import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ZipWriter } from './zip-writer';
import { writeSimpleXlsx } from './simple-xlsx';
import { invalidateAirtableOverview } from './airtable';
import { airtableFetch } from './airtable-request';
import { getCurrentBatchNumber, setCurrentBatchNumber } from './current-batch';

const API = 'https://api.airtable.com/v0';
const TABLES = {
  trainees: 'بيانات المتدربين',
  payments: 'مدفوعات المندوب للشركة',
} as const;
export type ArchiveKind = keyof typeof TABLES;
type AirtableRecord = { id: string; createdTime?: string; fields: Record<string, unknown> };
type PreparedBatch = {
  id: string;
  userId: string;
  baseId: string;
  batchName: string;
  currentBatch: string;
  directory: string;
  createdAt: number;
  files: Record<ArchiveKind, string>;
  ids: Record<ArchiveKind, string[]>;
  fingerprints: Record<ArchiveKind, Map<string, string>>;
  attachmentCounts: Record<ArchiveKind, number>;
  downloaded: Set<ArchiveKind>;
  deleting: boolean;
  completed: boolean;
};

const globalArchive = globalThis as typeof globalThis & { hawalatBatchArchives?: Map<string, PreparedBatch> };
const archives = globalArchive.hawalatBatchArchives ||= new Map<string, PreparedBatch>();

function recordFingerprint(record: AirtableRecord): string {
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sort(item)]));
    return value;
  };
  return crypto.createHash('sha256').update(JSON.stringify(sort(record.fields || {}))).digest('hex');
}

function verifySnapshot(batch: PreparedBatch, kind: ArchiveKind, current: AirtableRecord[]) {
  const expected = batch.fingerprints[kind];
  for (const record of current) {
    if (!expected.has(record.id) || expected.get(record.id) !== recordFingerprint(record)) {
      throw new Error(`تغيّر جدول ${TABLES[kind]} بعد تجهيز النسخة؛ جهّز أرشيفًا جديدًا`);
    }
  }
}

function credentials() {
  const baseId = process.env.AIRTABLE_BASE_ID || '';
  const token = process.env.AIRTABLE_API_TOKEN || '';
  if (!/^app[A-Za-z0-9]{10,}$/.test(baseId) || !token) throw new Error('إعدادات Airtable غير مكتملة');
  return { baseId, token };
}

async function airtableRequest(url: string, token: string, init?: RequestInit): Promise<Response> {
  return airtableFetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    cache: 'no-store',
  });
}

async function fetchAll(table: string, baseId: string, token: string): Promise<AirtableRecord[]> {
  const result: AirtableRecord[] = [];
  let offset = '';
  do {
    const url = new URL(`${API}/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const response = await airtableRequest(url.toString(), token);
    if (!response.ok) throw new Error(`تعذر قراءة جدول ${table} من Airtable (${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data.records) || data.records.some((record: AirtableRecord) => typeof record?.id !== 'string' || !record.fields || typeof record.fields !== 'object')) throw new Error(`استجابة جدول ${table} غير مكتملة`);
    result.push(...data.records);
    offset = typeof data.offset === 'string' ? data.offset : '';
  } while (offset);
  return result;
}

function safeName(value: string): string {
  return value.normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\.\./g, '_').slice(0, 100) || 'ملف';
}

function safeTemporaryDirectory(directory: string): boolean {
  const resolved = path.resolve(directory);
  return resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('hawalat-batch-');
}

async function removeTemporaryDirectory(directory: string) {
  if (!safeTemporaryDirectory(directory)) throw new Error('مسار الأرشيف المؤقت غير صالح');
  await fs.promises.rm(directory, { recursive: true, force: true });
}

function pruneExpiredArchives() {
  for (const [id, batch] of archives) {
    if (Date.now() - batch.createdAt <= 24 * 3600_000 || batch.deleting) continue;
    archives.delete(id);
    void removeTemporaryDirectory(batch.directory).catch(() => {});
  }
}

function attachmentFields(record: AirtableRecord): { field: string; url: string; filename: string }[] {
  const attachments: { field: string; url: string; filename: string }[] = [];
  for (const [field, value] of Object.entries(record.fields || {})) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== 'object' || typeof item.url !== 'string') continue;
      attachments.push({ field, url: item.url, filename: String(item.filename || 'مرفق') });
    }
  }
  return attachments;
}

async function downloadAttachment(url: string, target: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !(parsed.hostname === 'airtableusercontent.com' || parsed.hostname.endsWith('.airtableusercontent.com'))) {
    throw new Error('رابط مرفق غير متوقع من Airtable؛ أُوقفت الأرشفة لحماية النسخة');
  }
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error(`تعذر تنزيل مرفق (${response.status})؛ لم يُفتح التفريغ`);
  const handle = await fs.promises.open(target, 'w');
  try {
    let size = 0;
    const reader = response.body.getReader();
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.length;
      if (size > 1024 * 1024 * 1024) throw new Error('مرفق أكبر من 1 GB');
      let written = 0;
      while (written < chunk.length) {
        const result = await handle.write(chunk, written, chunk.length - written);
        if (!result.bytesWritten) throw new Error('تعذر حفظ المرفق');
        written += result.bytesWritten;
      }
    }
    if (!size) throw new Error('مرفق فارغ');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function createTableArchive(directory: string, kind: ArchiveKind, batchName: string, records: AirtableRecord[]) {
  const tableName = TABLES[kind];
  const prefix = safeName(batchName);
  const label = kind === 'trainees' ? 'المتدربين' : 'المدفوعات';
  const archivePath = path.join(directory, `${prefix}-${label}.zip`);
  const workbookPath = path.join(directory, `${kind}.xlsx`);
  const attachmentDir = path.join(directory, `${kind}-attachments`);
  await fs.promises.mkdir(attachmentDir);
  const media: { zipName: string; localPath: string }[] = [];
  const pathsByRecord = new Map<string, string[]>();
  for (const record of records) {
    const attachments = attachmentFields(record);
    for (let index = 0; index < attachments.length; index++) {
      const attachment = attachments[index];
      const filename = `${safeName(record.id)}-${index + 1}-${safeName(attachment.filename)}`;
      const localPath = path.join(attachmentDir, filename);
      const zipName = `المرفقات/${filename}`;
      await downloadAttachment(attachment.url, localPath);
      media.push({ zipName, localPath });
      pathsByRecord.set(record.id, [...(pathsByRecord.get(record.id) || []), `${attachment.field}: ${zipName}`]);
    }
  }
  const fieldNames = [...new Set(records.flatMap((record) => Object.keys(record.fields || {})))];
  const headers = ['معرف السجل', 'تاريخ الإنشاء', ...fieldNames, 'المرفقات المحفوظة'];
  const rows = records.map((record) => [
    record.id,
    record.createdTime || '',
    ...fieldNames.map((field) => record.fields?.[field] ?? ''),
    (pathsByRecord.get(record.id) || []).join('\n'),
  ]);
  await writeSimpleXlsx(workbookPath, label, headers, rows);
  const archive = new ZipWriter(archivePath);
  try {
    await archive.addFile(`${label}.xlsx`, workbookPath);
    await archive.addBuffer('البيانات-الكاملة.json', JSON.stringify({ batchName, tableName, exportedAt: new Date().toISOString(), records }, null, 2));
    await archive.addBuffer('اقرأني.txt', `الدفعة: ${batchName}\nالجدول: ${tableName}\nالسجلات: ${records.length}\nالمرفقات المحفوظة: ${media.length}\nملف Excel يحتوي كل الحقول. ملف JSON يحفظ بيانات Airtable الأصلية للاسترجاع عند الحاجة.\n`);
    for (const item of media) await archive.addFile(item.zipName, item.localPath);
    await archive.close();
  } catch (error) {
    await archive.abort();
    throw error;
  }
  return { archivePath, attachments: media.length };
}

function publicInfo(batch: PreparedBatch) {
  return {
    id: batch.id,
    batchName: batch.batchName,
    createdAt: batch.createdAt,
    counts: { trainees: batch.ids.trainees.length, payments: batch.ids.payments.length },
    attachments: batch.attachmentCounts,
    downloaded: { trainees: batch.downloaded.has('trainees'), payments: batch.downloaded.has('payments') },
    deleting: batch.deleting,
  };
}

export function getPreparedArchive(userId: string, id: string) {
  const batch = archives.get(id);
  if (!batch || batch.userId !== userId || Date.now() - batch.createdAt > 24 * 3600_000) throw new Error('انتهت صلاحية الأرشيف؛ جهّز نسخة جديدة');
  return batch;
}

export function getLatestPreparedArchive(userId: string) {
  pruneExpiredArchives();
  const batch = [...archives.values()].filter((item) => item.userId === userId && !item.completed && Date.now() - item.createdAt <= 24 * 3600_000).sort((a, b) => b.createdAt - a.createdAt)[0];
  return batch ? publicInfo(batch) : null;
}

export async function prepareBatchArchive(userId: string, batchName: string) {
  pruneExpiredArchives();
  if (!batchName.trim() || batchName.length > 80 || /[\\/:*?"<>|]/.test(batchName)) throw new Error('اسم الدفعة غير صالح');
  const { baseId, token } = credentials();
  const [trainees, payments] = await Promise.all([
    fetchAll(TABLES.trainees, baseId, token),
    fetchAll(TABLES.payments, baseId, token),
  ]);
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hawalat-batch-'));
  try {
    const traineeExport = await createTableArchive(directory, 'trainees', batchName, trainees);
    const paymentExport = await createTableArchive(directory, 'payments', batchName, payments);
    const batch: PreparedBatch = {
      id: crypto.randomUUID(), userId, baseId, batchName, currentBatch: getCurrentBatchNumber(), directory, createdAt: Date.now(),
      files: { trainees: traineeExport.archivePath, payments: paymentExport.archivePath },
      ids: { trainees: trainees.map((record) => record.id), payments: payments.map((record) => record.id) },
      fingerprints: { trainees: new Map(trainees.map((record) => [record.id, recordFingerprint(record)])), payments: new Map(payments.map((record) => [record.id, recordFingerprint(record)])) },
      attachmentCounts: { trainees: traineeExport.attachments, payments: paymentExport.attachments },
      downloaded: new Set(), deleting: false, completed: false,
    };
    archives.set(batch.id, batch);
    return publicInfo(batch);
  } catch (error) {
    await removeTemporaryDirectory(directory);
    throw error;
  }
}

export function markArchiveDownloaded(batch: PreparedBatch, kind: ArchiveKind) {
  batch.downloaded.add(kind);
  return batch.files[kind];
}

async function deleteRecords(batch: PreparedBatch, kind: ArchiveKind, token: string) {
  const current = await fetchAll(TABLES[kind], batch.baseId, token);
  verifySnapshot(batch, kind, current);
  for (let index = 0; index < current.length; index += 10) {
    const ids = current.slice(index, index + 10).map((record) => record.id);
    const url = new URL(`${API}/${batch.baseId}/${encodeURIComponent(TABLES[kind])}`);
    ids.forEach((id) => url.searchParams.append('records[]', id));
    const response = await airtableRequest(url.toString(), token, { method: 'DELETE' });
    if (!response.ok) throw new Error(`توقف تفريغ ${TABLES[kind]} عند السجل ${index + 1} (${response.status}). يمكن إعادة المحاولة.`);
    const data = await response.json();
    if (!Array.isArray(data.records) || data.records.length !== ids.length) throw new Error(`لم يؤكد Airtable حذف كل سجلات ${TABLES[kind]}`);
  }
  const remaining = await fetchAll(TABLES[kind], batch.baseId, token);
  if (remaining.length) throw new Error(`بقيت ${remaining.length} سجلات في ${TABLES[kind]}`);
}

export async function clearPreparedBatch(userId: string, id: string, confirmation: string, nextBatch: string) {
  const batch = getPreparedArchive(userId, id);
  if (batch.completed) throw new Error('تم تفريغ هذه الدفعة بالفعل');
  if (confirmation !== batch.batchName) throw new Error('اكتب اسم الدفعة كما يظهر في الأرشيف للتأكيد');
  if (!/^\d{1,6}$/.test(nextBatch) || nextBatch === getCurrentBatchNumber()) throw new Error('أدخل رقم الدفعة الجديدة');
  if (!batch.downloaded.has('trainees') || !batch.downloaded.has('payments')) throw new Error('نزّل الملفين قبل التفريغ');
  if (batch.deleting) throw new Error('التفريغ جارٍ بالفعل');
  const { baseId, token } = credentials();
  if (baseId !== batch.baseId) throw new Error('تغيّرت قاعدة Airtable بعد تجهيز الأرشيف');
  if (getCurrentBatchNumber() !== batch.currentBatch) throw new Error('تغيّرت الدفعة الحالية بعد تجهيز الأرشيف');
  batch.deleting = true;
  try {
    // Check both tables before the first delete, so a newly added record never enters the archived batch.
    for (const kind of ['payments', 'trainees'] as ArchiveKind[]) {
      const current = await fetchAll(TABLES[kind], baseId, token);
      verifySnapshot(batch, kind, current);
    }
    await deleteRecords(batch, 'payments', token);
    await deleteRecords(batch, 'trainees', token);
    await setCurrentBatchNumber(nextBatch);
    batch.completed = true;
    invalidateAirtableOverview();
    return { success: true, nextBatch, counts: { trainees: batch.ids.trainees.length, payments: batch.ids.payments.length } };
  } finally {
    batch.deleting = false;
  }
}
