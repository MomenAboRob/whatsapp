import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth';
import { createPortableBackup, restorePortableBackup } from '@/lib/portable-backup';

export async function GET(request: NextRequest) {
  const user = getAuthUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  try {
    const archive = await createPortableBackup(user.id);
    const size = (await fs.promises.stat(archive.filePath)).size;
    async function* chunks() {
      try {
        for await (const chunk of fs.createReadStream(archive.filePath)) yield chunk;
      } finally {
        await fs.promises.rm(archive.tempDir, { recursive: true, force: true });
      }
    }
    return new Response(Readable.toWeb(Readable.from(chunks())) as ReadableStream, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Length': String(size),
        'Content-Disposition': `attachment; filename="hawalat-${new Date().toISOString().slice(0, 10)}.jsonl.gz"`,
        'Cache-Control': 'no-store',
        'X-Hawalat-Missing-Media': String(archive.counts.missingMedia),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'تعذر إنشاء النسخة.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = getAuthUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: 'مصدر الطلب غير صالح' }, { status: 403 });
  if (!request.body) return NextResponse.json({ error: 'اختر ملف نسخة.' }, { status: 400 });
  const maxBytes = 2 * 1024 * 1024 * 1024;
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > maxBytes) return NextResponse.json({ error: 'الملف أكبر من الحد المسموح.' }, { status: 413 });
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hawalat-upload-'));
  const target = path.join(tempDir, 'uploaded.jsonl.gz');
  try {
    let received = 0;
    async function* limitedChunks() {
      for await (const chunk of Readable.fromWeb(request.body as any)) {
        received += chunk.length;
        if (received > maxBytes) throw new Error('الملف أكبر من الحد المسموح.');
        yield chunk;
      }
    }
    await pipeline(Readable.from(limitedChunks()), fs.createWriteStream(target));
    const result = await restorePortableBackup(user.id, target);
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'تعذر استرجاع النسخة.' }, { status: 400 });
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}
