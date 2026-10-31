import crypto from 'crypto';

export const SESSION_COOKIE_NAME = 'whatsapp_session';

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET غير موجود أو قصير جداً في ملف .env.local');
  }
  return secret;
}

function sign(base64Payload: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(base64Payload).digest('base64url');
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

/** Authenticate the account configured in the server environment. */
export async function authenticateLocal(email: string, password: string): Promise<AuthResult> {
  if (!email || !password) {
    return { success: false, error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const configuredEmail = process.env.LOCAL_AUTH_EMAIL?.trim().toLowerCase();
  const configuredPassword = process.env.LOCAL_AUTH_PASSWORD;
  if (!configuredEmail || !configuredPassword || cleanEmail !== configuredEmail) {
    return { success: false, error: 'بيانات الدخول غير صحيحة' };
  }
  const expected = Buffer.from(configuredPassword);
  const received = Buffer.from(password.trim());
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return { success: false, error: 'بيانات الدخول غير صحيحة' };
  }
  return { success: true, user: { id: 'local-dev', name: process.env.LOCAL_AUTH_NAME || 'Momen', email: configuredEmail } };
}

/**
 * إنشاء توكن جلسة موقع ومشفر باستخدام HMAC-SHA256
 */
export function createSessionToken(user: AuthUser): string {
  const payload = JSON.stringify({
    ...user,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 يوماً
  });

  const base64Payload = Buffer.from(payload).toString('base64url');
  const signature = sign(base64Payload);

  return `${base64Payload}.${signature}`;
}

/**
 * التحقق من صحة وصلاحية توكن الجلسة
 */
export function verifySessionToken(token?: string | null): AuthUser | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }

  try {
    const [base64Payload, signature] = token.split('.');
    if (!base64Payload || !signature) return null;

    const expected = Buffer.from(sign(base64Payload));
    const received = Buffer.from(signature);

    // مقارنة ثابتة الزمن لمنع هجمات التوقيت
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(base64Payload, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) {
      return null; // انتهت صلاحية الجلسة
    }

    return {
      id: payload.id,
      name: payload.name,
      email: payload.email,
    };
  } catch {
    return null;
  }
}

/**
 * استخراج بيانات المستخدم المعتمد من الطلب (Request) سواء من الكوكيز أو الهيدر
 */
type AuthRequest = {
  cookies?: { get?: (name: string) => { value?: string } | undefined };
  headers?: { get?: (name: string) => string | null };
};

export function getAuthUserFromRequest(req?: AuthRequest): AuthUser | null {
  if (!req) return null;
  let token: string | undefined | null;

  try {
    if (typeof req.cookies?.get === 'function') {
      token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    } else if (req.headers && typeof req.headers.get === 'function') {
      const cookieHeader = req.headers.get('cookie') || '';
      const match = cookieHeader.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
      token = match ? decodeURIComponent(match[1]) : null;
      if (!token) {
        const authHeader = req.headers.get('authorization');
        if (authHeader?.startsWith('Bearer ')) {
          token = authHeader.slice(7).trim();
        }
      }
    }
  } catch {}

  const verified = verifySessionToken(token);
  if (verified) return verified;

  return null;
}


