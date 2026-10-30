import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth';
import {
  backupToDesktopDrive, getDesktopBackupStatus, restoreFromDesktopDrive,
  selectDriveFolder,
} from '@/lib/desktop-drive-backup';

type Job = { status: 'running' | 'completed' | 'failed'; action: 'backup' | 'restore'; result?: unknown; error?: string };
const globalJobs = globalThis as typeof globalThis & { hawalatDesktopJobs?: Map<string, Job> };
const jobs = globalJobs.hawalatDesktopJobs ||= new Map<string, Job>();

export async function GET(request: NextRequest) {
  const user = getAuthUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  if (request.nextUrl.searchParams.get('job') === '1') return NextResponse.json({ job: jobs.get(user.id) || null });
  return NextResponse.json({ ...getDesktopBackupStatus(user.id), job: jobs.get(user.id) || null });
}

export async function POST(request: NextRequest) {
  const user = getAuthUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: 'مصدر الطلب غير صالح' }, { status: 403 });
  let body: { action?: string; folder?: string; intervalHours?: number; name?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }
  if (body.action === 'select') {
    if (jobs.get(user.id)?.status === 'running') return NextResponse.json({ error: 'انتظر اكتمال العملية الحالية.' }, { status: 409 });
    try {
      selectDriveFolder(user.id, body.folder || '', body.intervalHours === 168 ? 168 : 24);
      return NextResponse.json({ success: true, ...getDesktopBackupStatus(user.id) });
    } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 400 }); }
  }
  if (jobs.get(user.id)?.status === 'running') return NextResponse.json({ error: 'هناك عملية قيد التنفيذ.' }, { status: 409 });
  if (body.action !== 'backup' && body.action !== 'restore') return NextResponse.json({ error: 'عملية غير معروفة' }, { status: 400 });
  if (body.action === 'restore' && (!body.name || body.name.length > 255)) return NextResponse.json({ error: 'اختر نسخة صالحة.' }, { status: 400 });
  const action = body.action;
  const job: Job = { status: 'running', action };
  jobs.set(user.id, job);
  void (async () => {
    try {
      job.result = action === 'backup'
        ? await backupToDesktopDrive(user.id)
        : await restoreFromDesktopDrive(user.id, body.name!);
      job.status = 'completed';
    } catch (error: any) {
      job.error = error.message || 'فشلت العملية.';
      job.status = 'failed';
    }
  })();
  return NextResponse.json({ success: true, job }, { status: 202 });
}
