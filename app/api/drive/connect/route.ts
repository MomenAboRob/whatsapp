import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth';
import { createGoogleAuthUrl } from '@/lib/google-drive-backup';

export async function GET(request: NextRequest) {
  const user = getAuthUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  try {
    const state = crypto.randomBytes(24).toString('base64url');
    const response = NextResponse.redirect(createGoogleAuthUrl(state));
    response.cookies.set('hawalat_drive_state', state, {
      httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:',
      path: '/api/drive', maxAge: 600,
    });
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'تعذر بدء الربط' }, { status: 503 });
  }
}
