import fs from 'node:fs';
import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth';
import { getCurrentBatchNumber } from '@/lib/current-batch';
import {
  clearPreparedBatch, getLatestPreparedArchive, getPreparedArchive,
  markArchiveDownloaded, prepareBatchArchive, type ArchiveKind,
} from '@/lib/airtable-batch-archive';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const user = getAuthUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  const id = request.nextUrl.searchParams.get('id');
  const kind = request.nextUrl.searchParams.get('kind');
  if (!id && !kind) return NextResponse.json({ archive: getLatestPreparedArchive(user.id), currentBatch: getCurrentBatchNumber() });
  if (!id || (kind !== 'trainees' && kind !== 'payments')) return NextResponse.json({ error: 'طلب تنزيل غير صالح' }, { status: 400 });
  try {
    const batch = getPreparedArchive(user.id, id);
    const filePath = batch.files[kind as ArchiveKind];
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile() || stat.size === 0) throw new Error('ملف الأرشيف غير متاح؛ جهّز نسخة جديدة');
    markArchiveDownloaded(batch, kind as ArchiveKind);
    const filename = `${batch.batchName}-${kind === 'trainees' ? 'المتدربين' : 'المدفوعات'}.zip`;
    return new Response(Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(stat.size),
        'Content-Disposition': `attachment; filename="batch-${kind}.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر تنزيل الأرشيف' }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const user = getAuthUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  const origin = request.headers.get('origin');
  const allowedHosts = [request.nextUrl.host, request.headers.get('host'), request.headers.get('x-forwarded-host')].filter(Boolean);
  if (origin && !allowedHosts.includes(new URL(origin).host)) return NextResponse.json({ error: 'مصدر الطلب غير صالح' }, { status: 403 });
  let body: { action?: string; batchName?: string; id?: string; confirmation?: string; confirmSaved?: boolean; nextBatch?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }
  try {
    if (body.action === 'prepare') {
      const archive = await prepareBatchArchive(user.id, String(body.batchName || '').trim());
      return NextResponse.json({ success: true, archive });
    }
    if (body.action === 'clear') {
      if (body.confirmSaved !== true) return NextResponse.json({ error: 'أكد حفظ الملفين والتحقق من محتواهما أولاً' }, { status: 400 });
      const result = await clearPreparedBatch(user.id, String(body.id || ''), String(body.confirmation || ''), String(body.nextBatch || ''));
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: 'عملية غير معروفة' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذرت العملية' }, { status: 400 });
  }
}
