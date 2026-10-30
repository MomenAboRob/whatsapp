import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth';

function fileFor(userId: string) {
  return path.join(process.cwd(), 'whatsapp_auth', `user_${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}`, 'custom_lists.json');
}

export async function GET(request: NextRequest) {
  const user = getAuthUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  const file = fileFor(user.id);
  try {
    const lists = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    return NextResponse.json({ userId: user.id, exists: true, lists });
  } catch {
    return NextResponse.json({ userId: user.id, exists: false, lists: {} });
  }
}

export async function PUT(request: NextRequest) {
  const user = getAuthUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: 'مصدر الطلب غير صالح' }, { status: 403 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }
  const input = body?.lists;
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 100) {
    return NextResponse.json({ error: 'القوائم غير صالحة' }, { status: 400 });
  }
  const lists: Record<string, string[]> = {};
  for (const [name, members] of Object.entries(input)) {
    if (!name || name.length > 80 || !Array.isArray(members) || members.length > 10000 || members.some((member) => typeof member !== 'string' || member.length > 300)) {
      return NextResponse.json({ error: 'القوائم غير صالحة' }, { status: 400 });
    }
    lists[name] = Array.from(new Set(members));
  }
  const file = fileFor(user.id);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(`${file}.tmp`, JSON.stringify(lists), 'utf8');
  await fs.promises.rename(`${file}.tmp`, file);
  return NextResponse.json({ success: true });
}
