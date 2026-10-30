import fs from 'node:fs';
import path from 'node:path';

const settingsPath = path.join(process.cwd(), 'app_data', 'batch-settings.json');

export function getCurrentBatchNumber(): string {
  try {
    const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (typeof data.batchNumber === 'string' && /^\d{1,6}$/.test(data.batchNumber)) return data.batchNumber;
  } catch {}
  const fallback = process.env.CURRENT_BATCH_NUMBER || '150';
  return /^\d{1,6}$/.test(fallback) ? fallback : '150';
}

export async function setCurrentBatchNumber(batchNumber: string) {
  if (!/^\d{1,6}$/.test(batchNumber)) throw new Error('رقم الدفعة الجديدة غير صالح');
  await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
  const temporary = `${settingsPath}.${process.pid}.tmp`;
  await fs.promises.writeFile(temporary, JSON.stringify({ batchNumber, updatedAt: new Date().toISOString() }), 'utf8');
  await fs.promises.rename(temporary, settingsPath);
}
