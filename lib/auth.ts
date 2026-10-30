import crypto from 'crypto';
import { airtableFetch } from './airtable-request';

const AIRTABLE_API_URL = 'https://api.airtable.com/v0';
// المفاتيح تُقرأ من ملف .env.local فقط (لا تكتب أي مفتاح داخل الكود)
const BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const USERS_TABLE = encodeURIComponent('المستخدمين');
const TOKEN = process.env.AIRTABLE_API_TOKEN || '';

export const SESSION_COOKIE_NAME = 'hawalat_session';

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

/**
 * التحقق اللحظي والمباشر من جدول (المستخدمين) في أيرتيبل
 * إذا تم تعديل الباسورد أو الإيميل أو إضافة أي مستخدم جديد، سيعمل فوراً
 */
export async function authenticateWithAirtable(email: string, password: string): Promise<AuthResult> {
  if (!email || !password) {
    return { success: false, error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const inputPassword = password.trim();

  try {
    const url = `${AIRTABLE_API_URL}/${BASE_ID}/${USERS_TABLE}`;
    const res = await airtableFetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Airtable Auth Fetch Error:', res.status, errText);
      return { success: false, error: 'تعذر الاتصال بقاعدة بيانات أيرتيبل حالياً' };
    }

    const data = await res.json();
    const records = data.records || [];

    // البحث عن المستخدم بمطابقة البريد الإلكتروني
    const userRecord = records.find((r: any) => {
      const recEmail = String(r.fields['الايميل'] || r.fields['البريد الالكتروني'] || r.fields['Email'] || '').trim().toLowerCase();
      return recEmail === cleanEmail;
    });

    if (!userRecord) {
      return { success: false, error: 'البريد الإلكتروني غير مسجل في النظام' };
    }

    const fields = userRecord.fields;

    // التحقق من حالة التفعيل
    const isActive = Boolean(fields['مفعل'] ?? fields['نشط'] ?? true);
    if (!isActive) {
      return { success: false, error: 'هذا الحساب غير مفعل حالياً، يرجى مراجعة المسؤول' };
    }

    // التحقق من كلمة المرور
    const storedPassword = String(fields['كلمة المرور'] || fields['الباسورد'] || fields['Password'] || '').trim();
    if (!storedPassword || storedPassword !== inputPassword) {
      return { success: false, error: 'كلمة المرور غير صحيحة' };
    }

    const userName = String(fields['الاسم'] || fields['اسم المستخدم'] || fields['Name'] || cleanEmail.split('@')[0]);

    return {
      success: true,
      user: {
        id: userRecord.id,
        name: userName,
        email: cleanEmail,
      },
    };
  } catch (error: any) {
    console.error('Authentication error:', error);
    return { success: false, error: 'حدث خطأ غير متوقع أثناء تسجيل الدخول' };
  }
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
export function getAuthUserFromRequest(req?: any): AuthUser | null {
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


