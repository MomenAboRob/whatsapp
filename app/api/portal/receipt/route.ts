import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getPendingPortalData } from '../pending/route';
import { localExtensionCors } from '@/lib/local-extension-cors';

export async function GET(req: NextRequest) {
  try {
    const data = getPendingPortalData();
    if (!data) {
      return new NextResponse('No pending receipt available', { status: 404 });
    }

    const imageSrc = data.receiptBase64 || data.receiptUrl;
    if (!imageSrc) {
      return new NextResponse('No receipt image in pending data', { status: 404 });
    }

    // 1. Data URL
    if (imageSrc.startsWith('data:image')) {
      const parts = imageSrc.split(';');
      const mime = parts[0].replace('data:', '') || 'image/jpeg';
      const base64Data = imageSrc.replace(/^data:image\/[a-z]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': mime,
          'Content-Disposition': 'inline; filename="receipt.jpg"',
          ...localExtensionCors(req, 'GET, OPTIONS'),
          'Cache-Control': 'no-store',
        },
      });
    }

    // 2. Local file path or /media/ URL (including http://localhost:3010/media/...)
    const isLocalOrRel =
      imageSrc.startsWith('/media/') ||
      imageSrc.startsWith('public/media/') ||
      imageSrc.startsWith('/avatars/') ||
      imageSrc.includes('/media/') ||
      imageSrc.includes('/avatars/');

    if (isLocalOrRel) {
      const fileName = path.basename(imageSrc.split('?')[0].split('#')[0]);
      const candidates = [
        path.join(process.cwd(), 'whatsapp_media', fileName),
        path.join(process.cwd(), 'whatsapp_avatars', fileName),
        path.join(process.cwd(), 'public', 'media', fileName),
        path.join(process.cwd(), 'public', 'avatars', fileName),
        path.join(process.cwd(), 'media', fileName),
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          const buffer = fs.readFileSync(cand);
          const ext = path.extname(cand).toLowerCase();
          const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.pdf' ? 'application/pdf' : 'image/jpeg';
          return new NextResponse(buffer, {
            headers: {
              'Content-Type': mime,
              'Content-Disposition': `inline; filename="${fileName}"`,
              ...localExtensionCors(req, 'GET, OPTIONS'),
              'Cache-Control': 'no-store',
            },
          });
        }
      }
    }

    // 3. External HTTP / HTTPS URL
    if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://')) {
      try {
        const res = await fetch(imageSrc);
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          const mime = res.headers.get('content-type') || 'image/jpeg';
          return new NextResponse(Buffer.from(arrayBuffer), {
            headers: {
              'Content-Type': mime,
              'Content-Disposition': 'inline; filename="receipt.jpg"',
              ...localExtensionCors(req, 'GET, OPTIONS'),
              'Cache-Control': 'no-store',
            },
          });
        }
      } catch (err) {
        console.warn('Failed to proxy external receipt URL:', err);
      }
    }

    return new NextResponse('Receipt image format not supported', { status: 400 });
  } catch (error: any) {
    return new NextResponse(error.message, { status: 500 });
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: localExtensionCors(req, 'GET, OPTIONS'),
  });
}
