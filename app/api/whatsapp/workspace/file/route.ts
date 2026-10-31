import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { getAuthUserFromRequest } from '@/lib/auth';
import { readWorkspace, saveWorkspace } from '@/lib/whatsapp-workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const filePath = (userId: string, mentionId: string) => {
  const cleanUser = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const hash = createHash('sha256').update(mentionId).digest('hex');
  return path.join(process.cwd(), 'whatsapp_auth', `user_${cleanUser}`, 'task_files', hash);
};
const bad = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function GET(req: NextRequest) {
  const user = getAuthUserFromRequest(req);
  if (!user) return bad('غير مصرح', 401);
  const id = req.nextUrl.searchParams.get('id') || '';
  const workspace = readWorkspace(user.id);
  const task = workspace.mentions.find((item) => item.id === id)?.task || workspace.messageTasks.find((item) => item.id === id)?.task || workspace.manualTasks.find((item) => item.id === id)?.task;
  if (!task?.attachment) return bad('الملف غير موجود', 404);
  const file = filePath(user.id, id);
  if (!fs.existsSync(file)) return bad('الملف غير موجود', 404);
  return new Response(fs.readFileSync(file), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(task.attachment.name)}`,
      'Content-Length': String(task.attachment.size),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function POST(req: NextRequest) {
  const user = getAuthUserFromRequest(req);
  if (!user) return bad('غير مصرح', 401);
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin) return bad('مصدر الطلب غير صالح', 403);
  const form = await req.formData();
  const id = String(form.get('id') || '');
  const upload = form.get('file');
  if (!upload || typeof upload === 'string' || !('arrayBuffer' in upload)) return bad('اختر ملفًا');
  const file = upload as File;
  if (file.size < 1 || file.size > 10 * 1024 * 1024) return bad('حجم الملف يجب أن يكون أقل من 10 ميغابايت');
  const data = readWorkspace(user.id);
  const task = data.mentions.find((item) => item.id === id)?.task || data.messageTasks.find((item) => item.id === id)?.task || data.manualTasks.find((item) => item.id === id)?.task;
  if (!task) return bad('المهمة غير موجودة', 404);
  const target = filePath(user.id, id);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from(await file.arrayBuffer()));
  task.attachment = { name: file.name.replace(/[\\/\r\n]/g, '_').slice(0, 180), size: file.size };
  saveWorkspace(user.id, data);
  return NextResponse.json({ success: true, attachment: task.attachment });
}
