import { NextRequest, NextResponse } from 'next/server';
import { getWhatsAppManager } from '@/lib/whatsapp-client';

export async function GET(req: NextRequest) {
  const wa = getWhatsAppManager(req);
  const status = wa.getStatus();
  return NextResponse.json(status);
}

export async function POST(req: NextRequest) {
  try {
    const wa = getWhatsAppManager(req);
    const { action } = await req.json();
    if (action === 'connect' || action === 'reconnect') {
      void wa.connect();
      return NextResponse.json({ success: true, message: 'جاري تهيئة جلسة واتساب وتوليد الرمز QR...' });
    }
    if (action === 'logout') {
      const res = await wa.logout();
      return NextResponse.json(res);
    }
    return NextResponse.json({ success: false, message: 'إجراء غير معروف' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
