import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth';
import { getWhatsAppManager } from '@/lib/whatsapp-client';

export async function GET(request: NextRequest) {
  if (!getAuthUserFromRequest(request)) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  const jid = request.nextUrl.searchParams.get('jid') || '';
  if (!/^[0-9A-Za-z._:-]{1,128}@(s\.whatsapp\.net|g\.us|lid)$/.test(jid)) {
    return NextResponse.json({ error: 'معرف المحادثة غير صالح' }, { status: 400 });
  }
  const wa = getWhatsAppManager(request);
  const presences = await wa.subscribePresence(jid);
  return NextResponse.json({ success: true, jid, presences }, { headers: { 'Cache-Control': 'private, no-store' } });
}
