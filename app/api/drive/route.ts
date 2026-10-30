import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth';
import {
  backupToDrive, disconnectDrive, getDriveConnection, isDriveConfigured,
  listDriveBackups, restoreFromDrive,
} from '@/lib/google-drive-backup';

type DriveJob = {
  status: 'running' | 'completed' | 'failed';
  action: 'backup' | 'restore';
  startedAt: string;
  result?: unknown;
  error?: string;
};

const globalJobs = globalThis as typeof globalThis & { hawalatDriveJobs?: Map<string, DriveJob> };
const jobs = globalJobs.hawalatDriveJobs ||= new Map<string, DriveJob>();

export async function GET(request: NextRequest) {
  const user = getAuthUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  if (request.nextUrl.searchParams.get('job') === '1') {
    return NextResponse.json({ job: jobs.get(user.id) || null });
  }
  const configured = isDriveConfigured();
  const connection = getDriveConnection(user.id);
  try {
    const backups = configured && connection ? await listDriveBackups(user.id) : [];
    return NextResponse.json({ configured, connection, backups, job: jobs.get(user.id) || null });
  } catch (error: any) {
    return NextResponse.json({ configured, connection, backups: [], job: jobs.get(user.id) || null, error: error.message }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  const user = getAuthUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: 'مصدر الطلب غير صالح' }, { status: 403 });
  let body: { action?: string; fileId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }
  if (body.action === 'disconnect') {
    if (jobs.get(user.id)?.status === 'running') return NextResponse.json({ error: 'انتظر اكتمال العملية الحالية.' }, { status: 409 });
    disconnectDrive(user.id);
    return NextResponse.json({ success: true });
  }
  if (!getDriveConnection(user.id)) return NextResponse.json({ error: 'اربط Google Drive أولاً.' }, { status: 400 });
  if (jobs.get(user.id)?.status === 'running') return NextResponse.json({ error: 'هناك عملية نسخ أو استرجاع قيد التنفيذ.' }, { status: 409 });
  if (body.action !== 'backup' && body.action !== 'restore') return NextResponse.json({ error: 'عملية غير معروفة' }, { status: 400 });
  if (body.action === 'restore' && (!body.fileId || !/^[a-zA-Z0-9_-]{10,200}$/.test(body.fileId))) {
    return NextResponse.json({ error: 'اختر نسخة صالحة للاسترجاع.' }, { status: 400 });
  }
  const action = body.action;
  const job: DriveJob = { status: 'running', action, startedAt: new Date().toISOString() };
  jobs.set(user.id, job);
  void (async () => {
    try {
      job.result = action === 'backup' ? await backupToDrive(user.id) : await restoreFromDrive(user.id, body.fileId!);
      job.status = 'completed';
    } catch (error: any) {
      job.error = error.message || 'فشلت العملية.';
      job.status = 'failed';
    }
  })();
  return NextResponse.json({ success: true, job }, { status: 202 });
}
