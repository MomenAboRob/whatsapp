import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithAirtable, createSessionToken } from '@/lib/auth';

const windowMs = 15 * 60 * 1000;
const maxFailures = 8;
const failures = new Map<string, { count: number; expiresAt: number }>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || password.length > 256) {
      return NextResponse.json({ success: false, error: 'بيانات الدخول غير صحيحة' }, { status: 400 });
    }

    const key = email.trim().toLowerCase();
    const now = Date.now();
    const previous = failures.get(key);
    if (previous && previous.expiresAt > now && previous.count >= maxFailures) {
      return NextResponse.json({ success: false, error: 'محاولات كثيرة. حاول بعد 15 دقيقة.' }, {
        status: 429, headers: { 'Retry-After': String(Math.ceil((previous.expiresAt - now) / 1000)) },
      });
    }

    const result = await authenticateWithAirtable(email, password);

    if (!result.success || !result.user) {
      if (failures.size > 1000) {
        for (const [account, entry] of failures) if (entry.expiresAt <= now) failures.delete(account);
      }
      failures.set(key, { count: previous && previous.expiresAt > now ? previous.count + 1 : 1, expiresAt: previous && previous.expiresAt > now ? previous.expiresAt : now + windowMs });
      return NextResponse.json(
        { success: false, error: 'بيانات الدخول غير صحيحة' },
        { status: 401 }
      );
    }

    failures.delete(key);

    const token = createSessionToken(result.user);

    const response = NextResponse.json({
      success: true,
      user: result.user,
    });

    const isHttps =
      req.headers.get('x-forwarded-proto') === 'https' ||
      req.nextUrl.protocol === 'https:' ||
      process.env.NODE_ENV === 'production';

    // تعيين الكوكي الآمن للجلسة (صالحة لمدة 30 يوماً)
    response.cookies.set({
      name: 'hawalat_session',
      value: token,
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 يوماً
    });

    return response;
  } catch (error: unknown) {
    console.error('Login API error:', error);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ في الخادم أثناء المعالجة' },
      { status: 500 }
    );
  }
}
