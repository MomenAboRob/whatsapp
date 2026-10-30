import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth';

// مسارات API مسموحة بدون تسجيل دخول
function isPublicApi(pathname: string, method: string): boolean {
  if (pathname === '/api/auth/login' || pathname === '/api/auth/logout') return true;
  // إضافة كروم تقرأ البيانات المعلقة وصورة الوصل من صفحة البوابة
  if (pathname === '/api/portal/pending' && (method === 'GET' || method === 'OPTIONS')) return true;
  if (pathname === '/api/portal/receipt' && (method === 'GET' || method === 'OPTIONS')) return true;
  return false;
}

// بناء رابط التوجيه الصحيح عبر الأنفاق والبروكسي
function getRedirectUrl(targetPath: string, request: NextRequest): URL {
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host;
  const forwardedProto = request.headers.get('x-forwarded-proto') || (request.nextUrl.protocol ? request.nextUrl.protocol.replace(':', '') : 'http');
  return new URL(targetPath, `${forwardedProto}://${forwardedHost}`);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const rawCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = verifySessionToken(rawCookie);

  // حماية جميع مسارات الـ API (يجب فحصها قبل استثناء الملفات الثابتة)
  if (pathname.startsWith('/api/')) {
    if (!user && !isPublicApi(pathname, request.method)) {
      return NextResponse.json({ error: 'غير مصرح، يرجى تسجيل الدخول' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // صور ورسائل واتساب قد تُخدم من public أو من Route Handler؛ لا تُعرض دون جلسة.
  if (pathname.startsWith('/media/') || pathname.startsWith('/avatars/') || pathname.startsWith('/uploads/') || pathname === '/mousa-receipt.svg') {
    return user ? NextResponse.next() : NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  // استثناء الملفات الثابتة والصور وموارد التطوير
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/media') ||
    pathname.includes('.') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const isLoginPage = pathname === '/login';

  // إذا لم يكن مسجل الدخول -> توجيه لصفحة تسجيل الدخول
  if (!user && !isLoginPage) {
    const response = NextResponse.redirect(getRedirectUrl('/login', request));
    if (rawCookie) {
      // فقط إذا كان الكوكي موجوداً لكنه منتهي أو غير صالح نحذفه
      response.cookies.delete(SESSION_COOKIE_NAME);
    }
    return response;
  }

  // إذا كان مسجل الدخول بالفعل وحاول فتح صفحة تسجيل الدخول -> توجيه للوحة التحكم
  if (user && isLoginPage) {
    return NextResponse.redirect(getRedirectUrl('/', request));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
