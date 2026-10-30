import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getAuthUserFromRequest } from '@/lib/auth';

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
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
      return NextResponse.json({ error: 'مسار الصورة مفقود' }, { status: 400 });
    }

    if (pathSegments.length !== 1 || !/^\d{7,25}(?:-full)?\.(?:jpg|jpeg|png|webp)$/i.test(pathSegments[0])) {
      return NextResponse.json({ error: 'مسار غير صالح' }, { status: 400 });
    }
    const digits = pathSegments[0].replace(/-full\.(?:jpg|jpeg|png|webp)$/i, '').replace(/\.(?:jpg|jpeg|png|webp)$/i, '');
    const { getWhatsAppManager } = await import('@/lib/whatsapp-client');
    const wa = getWhatsAppManager(request);
    if (!wa.canAccessAvatar(digits)) return NextResponse.json({ error: 'الصورة غير موجودة' }, { status: 404 });

    const storageAvatarsDir = path.join(process.cwd(), 'whatsapp_avatars');
    const publicAvatarsDir = path.join(process.cwd(), 'public', 'avatars');
    const targetFile = path.join(storageAvatarsDir, ...pathSegments);
    const legacyFile = path.join(publicAvatarsDir, ...pathSegments);
    const existingFile = fs.existsSync(targetFile) ? targetFile : fs.existsSync(legacyFile) ? legacyFile : null;

    if (existingFile) {
      const ext = path.extname(existingFile).toLowerCase();
      const mime = MIME_MAP[ext] || 'image/jpeg';
      const fileBuffer = fs.readFileSync(existingFile);

      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Content-Length': fileBuffer.length.toString(),
          'Cache-Control': 'private, max-age=86400',
        },
      });
    }

    // إذا لم تكن الصورة على القرص بعد، محاولة جلبها لحظياً من واتساب عبر الجلسات المتصلة
    const lastSeg = pathSegments[pathSegments.length - 1];
    const cleanKey = lastSeg.replace(/\.[^.]+$/, '').replace(/[^0-9a-zA-Z_\-@]/g, '');

    if (cleanKey) {
      try {
        for (const inst of [wa]) {
          if (inst.getStatus().status !== 'CONNECTED') continue;

          let candidateJid: string | undefined;
          const grp = inst.getUserGroups().find(
            (g) => g.id.includes(cleanKey) || g.avatarUrl?.includes(cleanKey)
          );
          if (grp) {
            candidateJid = grp.id;
          } else if (cleanKey.startsWith('1203') || cleanKey.length >= 17) {
            candidateJid = `${cleanKey}@g.us`;
          } else if (/^\d{8,15}$/.test(cleanKey)) {
            candidateJid = `${cleanKey}@s.whatsapp.net`;
          }

          if (candidateJid) {
            try {
              const dlUrl = await inst.getProfilePicture(candidateJid);
              if (dlUrl) {
                const subPath = dlUrl.replace(/^\/avatars\//, '').replace(/^\//, '');
                const freshSaved = path.join(storageAvatarsDir, subPath);
                const legacySaved = path.join(process.cwd(), 'public', dlUrl.replace(/^\//, ''));
                const foundFresh = fs.existsSync(freshSaved) ? freshSaved : fs.existsSync(legacySaved) ? legacySaved : null;
                if (foundFresh) {
                  const fileBuffer = fs.readFileSync(foundFresh);
                  return new NextResponse(fileBuffer, {
                    status: 200,
                    headers: {
                      'Content-Type': 'image/jpeg',
                      'Content-Length': fileBuffer.length.toString(),
                      'Cache-Control': 'private, max-age=86400',
                    },
                  });
                }
              }
            } catch {}
          }
        }
      } catch {}
    }

    return NextResponse.json({ error: 'الصورة غير موجودة' }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ غير متوقع' }, { status: 500 });
  }
}
