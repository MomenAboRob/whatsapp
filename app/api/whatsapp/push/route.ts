import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth';
import { getPushPublicKey, removePushSubscription, savePushSubscription } from '@/lib/whatsapp-workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = getAuthUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  return NextResponse.json({ publicKey: getPushPublicKey() });
}

export async function POST(request: NextRequest) {
  const user = getAuthUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '');
  if (origin && host && origin !== `${proto}://${host}`) return NextResponse.json({ error: 'مصدر الطلب غير صالح' }, { status: 403 });
  try {
    const body = await request.json();
    if (body.action === 'unsubscribe') {
      if (typeof body.endpoint !== 'string') return NextResponse.json({ error: 'الاشتراك غير صالح' }, { status: 400 });
      removePushSubscription(user.id, body.endpoint);
      return NextResponse.json({ success: true });
    }
    savePushSubscription(user.id, body.subscription);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر حفظ الإشعارات' }, { status: 400 });
  }
}
