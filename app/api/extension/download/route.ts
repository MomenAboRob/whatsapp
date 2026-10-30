import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const zipPath = path.join(process.cwd(), 'public', 'aqleeat-extension.zip');

    if (!fs.existsSync(zipPath)) {
      return NextResponse.json({ error: 'ملف الإضافة غير موجود' }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(zipPath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="aqleeat-extension.zip"',
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'فشل تحميل الإضافة', details: error.message }, { status: 500 });
  }
}
