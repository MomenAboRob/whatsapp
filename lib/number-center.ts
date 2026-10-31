import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export type NumberFile = { id: string; name: string; createdAt: string; numbers: string[] };
export type NumberAllocation = { id: string; fileId: string; personJid: string; personName: string; numbers: string[]; createdAt: string };
export type NumberCenterData = { files: NumberFile[]; allocations: NumberAllocation[] };

const filePath = (userId: string) => path.join(process.cwd(), 'whatsapp_auth', `user_${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}`, 'number-center.json');

export function readNumberCenter(userId: string): NumberCenterData {
  try {
    const value = JSON.parse(fs.readFileSync(filePath(userId), 'utf8'));
    return {
      files: Array.isArray(value.files) ? value.files : [],
      allocations: Array.isArray(value.allocations) ? value.allocations : [],
    };
  } catch { return { files: [], allocations: [] }; }
}

function saveNumberCenter(userId: string, data: NumberCenterData) {
  const target = filePath(userId);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data), 'utf8');
  fs.renameSync(temp, target);
}

function normalizeNumber(value: string): string | null {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^07\d{8}$/.test(digits)) digits = `962${digits.slice(1)}`;
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

export function extractNumbers(text: string): string[] {
  const found = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    for (const part of line.split(/[,;|\t]+/)) {
      if (!part.trim()) continue;
      const whole = !/[A-Za-z\u0600-\u06ff]/.test(part) ? normalizeNumber(part) : null;
      if (whole) { found.add(whole); continue; }
      for (const token of part.match(/\+?\d[\d().-]*/g) || []) {
        const number = normalizeNumber(token);
        if (number) found.add(number);
      }
    }
  }
  return [...found];
}

export function addNumberFiles(userId: string, uploads: Array<{ name: string; text: string }>) {
  const data = readNumberCenter(userId);
  const existing = new Set(data.files.flatMap((file) => file.numbers));
  const results = uploads.map(({ name, text }) => {
    const parsed = extractNumbers(text);
    const numbers = parsed.filter((number) => !existing.has(number));
    numbers.forEach((number) => existing.add(number));
    if (numbers.length) data.files.unshift({ id: randomUUID(), name: name.slice(0, 180), createdAt: new Date().toISOString(), numbers });
    return { name, added: numbers.length, duplicates: parsed.length - numbers.length };
  });
  if (!results.some((item) => item.added)) throw new Error('الملفات لا تحتوي أرقامًا جديدة صالحة');
  saveNumberCenter(userId, data);
  return results;
}

export function allocateNumbers(userId: string, fileId: string, recipients: Array<{ id: string; name: string }>, perPerson: number) {
  if (!Number.isSafeInteger(perPerson) || perPerson < 1 || perPerson > 1000) throw new Error('حدد عددًا بين 1 و1000 لكل شخص');
  if (!recipients.length || recipients.length > 100) throw new Error('اختر من شخص واحد إلى 100 شخص');
  if (new Set(recipients.map((recipient) => recipient.id)).size !== recipients.length) throw new Error('توجد أسماء مكررة في الاختيار');
  const data = readNumberCenter(userId);
  const file = data.files.find((item) => item.id === fileId);
  if (!file) throw new Error('الملف غير موجود');
  const used = new Set(data.allocations.flatMap((allocation) => allocation.numbers));
  const available = file.numbers.filter((number) => !used.has(number));
  const needed = recipients.length * perPerson;
  if (available.length < needed) throw new Error(available.length ? `المتبقي ${available.length} رقم فقط، والمطلوب ${needed}. قلّل العدد أو الأشخاص.` : 'خلصت كل الأرقام الموجودة في هذا الملف');
  const createdAt = new Date().toISOString();
  const allocations = recipients.map((recipient, index): NumberAllocation => ({
    id: randomUUID(), fileId, personJid: recipient.id, personName: recipient.name,
    numbers: available.slice(index * perPerson, (index + 1) * perPerson), createdAt,
  }));
  data.allocations.unshift(...allocations);
  saveNumberCenter(userId, data);
  return allocations;
}

export function numberCenterSummary(data: NumberCenterData) {
  const used = new Set(data.allocations.flatMap((allocation) => allocation.numbers));
  return {
    files: data.files.map((file) => ({ id: file.id, name: file.name, createdAt: file.createdAt, total: file.numbers.length, remaining: file.numbers.filter((number) => !used.has(number)).length })),
    allocations: data.allocations.map((item) => ({ id: item.id, fileId: item.fileId, personJid: item.personJid, personName: item.personName, count: item.numbers.length, createdAt: item.createdAt })),
  };
}
