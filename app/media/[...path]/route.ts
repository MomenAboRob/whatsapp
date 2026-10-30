import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getWhatsAppManager } from '@/lib/whatsapp-client';
import { getAuthUserFromRequest } from '@/lib/auth';

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg; codecs=opus',
  '.m4a': 'audio/mp4',
  '.pdf': 'application/pdf',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  if (!getAuthUserFromRequest(request)) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  try {
    const resolvedParams = await params;
    const pathSegments = resolvedParams.path || [];

    if (pathSegments.length === 0) {
      return NextResponse.json({ error: 'مسار الوسائط مفقود' }, { status: 400 });
    }

    let cleanSegments: string[];
    try {
      cleanSegments = pathSegments.map((segment) => decodeURIComponent(segment));
    } catch {
      return NextResponse.json({ error: 'مسار غير صالح' }, { status: 400 });
    }
    if (cleanSegments.some((segment) => !segment || segment === '.' || segment === '..' || /[\\/:%\0]/.test(segment))) {
      return NextResponse.json({ error: 'مسار غير صالح' }, { status: 400 });
    }

    const wa = getWhatsAppManager(request);
    const mediaUrl = `/media/${cleanSegments.join('/')}`;
    const lastSegment = cleanSegments[cleanSegments.length - 1];
    const rawMsgId = lastSegment.replace(/\.[^.]+$/, '');
    const cleanMsgId = rawMsgId.replace(/^(wa_img_|whatsapp_img_|wa_album_)/, '');
    if (wa.getMessages().some((message) => message.isViewOnce &&
      (message.id === rawMsgId || message.id === cleanMsgId || message.mediaUrl === mediaUrl))) {
      return NextResponse.json({ error: 'محتوى العرض لمرة واحدة غير متاح هنا' }, { status: 404 });
    }
    const ownsMedia = wa.getMessages().some((message) =>
      [message.mediaUrl, message.quotedMessage?.mediaUrl, message.linkedReceiptUrl, message.status?.linkedImageUrl]
        .some((url) => typeof url === 'string' && url.split('?')[0] === mediaUrl) ||
      (message.hasMedia && (message.id === rawMsgId || message.id === cleanMsgId))
    );
    if (!ownsMedia) return NextResponse.json({ error: 'الملف غير موجود' }, { status: 404 });

    const storageMediaDir = path.join(process.cwd(), 'whatsapp_media');
    const publicMediaDir = path.join(process.cwd(), 'public', 'media');
    const rootMediaDir = path.join(process.cwd(), 'media');

    const targetFile = path.join(storageMediaDir, ...cleanSegments);
    const legacyPublicFile = path.join(publicMediaDir, ...cleanSegments);
    const altTargetFile = path.join(rootMediaDir, ...cleanSegments);

    const existingFile = fs.existsSync(targetFile)
      ? targetFile
      : fs.existsSync(legacyPublicFile)
      ? legacyPublicFile
      : fs.existsSync(altTargetFile)
      ? altTargetFile
      : null;

    // 1. فحص توفر الملف على القرص فوراً
    if (existingFile) {
      const ext = path.extname(existingFile).toLowerCase();
      const mime = MIME_MAP[ext] || 'application/octet-stream';
      const fileBuffer = await fs.promises.readFile(existingFile);

      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Content-Length': fileBuffer.length.toString(),
          'Cache-Control': 'private, max-age=31536000, immutable',
        },
      });
    }

    // 2. إذا لم يكن الملف محملاً على القرص بعد، تشغيل التنزيل في الخلفية بهدوء دون حظر استجابة المتصفح
    const msg = wa.getMessages().find((m) => m.id === rawMsgId || m.id === cleanMsgId);

    if (msg?.rawBaileysMessage && wa.getStatus().status === 'CONNECTED') {
      const msgAgeHours = (Date.now() - (msg.timestampMs || 0)) / (1000 * 3600);
      // تشغيل التنزيل بهدوء في الخلفية دون await لمنع خنق وتجميد اتصالات المتصفح لـ 6 ثوانٍ
      if (msgAgeHours < 48) {
        wa.downloadMediaInBackground(
          msg.id,
          msg.rawBaileysMessage,
          msg.rawBaileysMessage.message
        ).catch(() => {});
      }
    }

    return NextResponse.json(
      { error: 'الملف غير موجود أو قيد التنزيل في الخلفية' },
      {
        status: 404,
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ غير متوقع' }, { status: 500 });
  }
}
