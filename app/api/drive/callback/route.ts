import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth';
import { exchangeGoogleCode } from '@/lib/google-drive-backup';

export async function GET(request: NextRequest) {
  const user = getAuthUserFromRequest(request);
  const state = request.nextUrl.searchParams.get('state') || '';
  const cookieState = request.cookies.get('hawalat_drive_state')?.value || '';
  const code = request.nextUrl.searchParams.get('code') || '';
  const validState = state.length === cookieState.length && state.length > 0 &&
    crypto.timingSafeEqual(Buffer.from(state), Buffer.from(cookieState));
  const destination = new URL('/', request.url);
  try {
    if (!user || !validState || !code) throw new Error('انتهت صلاحية طلب الربط. أعد المحاولة.');
    await exchangeGoogleCode(user.id, code);
    destination.searchParams.set('drive', 'connected');
  } catch (error: any) {
    destination.searchParams.set('drive', 'error');
    destination.searchParams.set('driveMessage', String(error.message || 'فشل الربط').slice(0, 150));
  }
  const response = NextResponse.redirect(destination);
  response.cookies.set('hawalat_drive_state', '', { path: '/api/drive', maxAge: 0 });
  return response;
}
