import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { receiptUrl, receiptBase64, participantName } = body;

    let fileBlob: Blob | null = null;
    let fileName = `receipt_${(participantName || 'trainee').replace(/\s+/g, '_')}.jpg`;

    // 1. فحص إذا كان ملف محلي على القرص
    if (receiptUrl) {
      const cleanRel = receiptUrl
        .replace(/^https?:\/\/[^\/]+/, '')
        .replace(/^\/?(public\/)?/, '');
      const publicDir = path.join(process.cwd(), 'public');
      const localPath = path.resolve(publicDir, cleanRel);

      // منع الخروج من مجلد public (مثل ../.env.local)
      const isInsidePublic = localPath.startsWith(publicDir + path.sep);

      if (isInsidePublic && fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
        const buf = fs.readFileSync(localPath);
        const mime = localPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
        fileBlob = new Blob([buf], { type: mime });
        fileName = `receipt_${(participantName || 'trainee').replace(/\s+/g, '_')}.${localPath.endsWith('.png') ? 'png' : 'jpg'}`;
      }
    }

    // 2. فحص إذا كان Base64
    if (!fileBlob && (receiptBase64 || (receiptUrl && receiptUrl.startsWith('data:')))) {
      const rawB64 = receiptBase64 || receiptUrl;
      const cleanB64 = rawB64.replace(/^data:image\/[a-z]+;base64,/, '');
      const buf = Buffer.from(cleanB64, 'base64');
      const mime = rawB64.includes('image/png') ? 'image/png' : 'image/jpeg';
      fileBlob = new Blob([buf], { type: mime });
      fileName = `receipt_${(participantName || 'trainee').replace(/\s+/g, '_')}.${mime === 'image/png' ? 'png' : 'jpg'}`;
    }

    // 3. إذا كان رابط ويب عام
    if (!fileBlob && receiptUrl && receiptUrl.startsWith('http')) {
      const resImg = await fetch(receiptUrl);
      if (resImg.ok) {
        fileBlob = await resImg.blob();
      }
    }

    if (!fileBlob) {
      return NextResponse.json({ error: 'لم يتم العثور على صورة الوصل' }, { status: 400 });
    }

    // جلب الـ Nonce من صفحة بوابة عقليات
    const initialRes = await fetch('https://portal.aqleeat.com/delegate-registration/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });

    const html = await initialRes.text();
    const cookies = initialRes.headers.get('set-cookie') || '';
    const nonceMatch = html.match(/var\s+um_scripts\s*=\s*\{[^}]*"nonce":"([^"]+)"/) || html.match(/"nonce":"([a-f0-9]{10})"/);
    const nonce = nonceMatch ? nonceMatch[1] : '';

    if (!nonce) {
      return NextResponse.json({ error: 'تعذر استخراج مفتاح الأمان من البوابة' }, { status: 500 });
    }

    // إرسال الصورة إلى ووردبريس
    const fd = new FormData();
    fd.append('action', 'um_fileupload');
    fd.append('key', 'payment-slip1');
    fd.append('set_id', '37303');
    fd.append('set_mode', 'register');
    fd.append('_wpnonce', nonce);
    fd.append('timestamp', String(Math.floor(Date.now() / 1000)));
    fd.append('payment-slip1', fileBlob, fileName);

    const uploadRes = await fetch('https://portal.aqleeat.com/wp-admin/admin-ajax.php', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': cookies,
        'Referer': 'https://portal.aqleeat.com/delegate-registration/',
      },
      body: fd,
    });

    if (!uploadRes.ok) {
      return NextResponse.json({ error: 'فشل خادم البوابة في استقبال الصورة' }, { status: 500 });
    }

    const json = await uploadRes.json();
    if (json.success && json.data?.filename) {
      return NextResponse.json({
        success: true,
        filename: json.data.filename,
        url: json.data.url,
        originalName: json.data.original_name || fileName,
      });
    } else {
      return NextResponse.json({ error: json.data?.error || 'فشلت معالجة صورة الوصل' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('خطأ رفع الوصل للبوابة:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
