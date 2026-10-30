"use client";

import { useCallback, useEffect, useState } from 'react';
import { CloudUpload, CloudDownload, HardDrive, Loader2, RefreshCw, Unplug } from 'lucide-react';
import { toast } from '@/components/ui/floating-toast';
import { DesktopDriveSettings } from '@/components/desktop-drive-settings';

type Backup = { id: string; name: string; size?: string; createdTime?: string };
type DriveStatus = {
  configured: boolean;
  connection: { email: string; connectedAt: string } | null;
  backups: Backup[];
  job: { status: 'running' | 'completed' | 'failed'; action: 'backup' | 'restore'; startedAt: string; result?: any; error?: string } | null;
  error?: string;
};

export function DriveBackupSettings() {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/drive', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'تعذر قراءة حالة Drive.');
      setStatus(data);
    } catch (error: any) {
      toast.error(error.message || 'تعذر الاتصال بـ Google Drive.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (status?.job?.status !== 'running') return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch('/api/drive?job=1', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (data.job?.status === 'running') setStatus((prev) => prev ? { ...prev, job: data.job } : prev);
        else await refresh();
      } catch {}
    }, 5000);
    return () => window.clearInterval(timer);
  }, [status?.job?.status, refresh]);

  const run = async (action: 'backup' | 'restore' | 'disconnect', fileId?: string) => {
    setBusy(true);
    try {
      const response = await fetch('/api/drive', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, fileId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'تعذرت العملية.');
      toast.info(action === 'backup' ? 'بدأ حفظ النسخة على Drive.' : action === 'restore' ? 'بدأ استرجاع النسخة داخل التطبيق.' : 'تم فصل حساب Drive.');
      await refresh();
    } catch (error: any) {
      toast.error(error.message || 'تعذرت العملية.');
    } finally { setBusy(false); }
  };

  if (loading) return <div className="flex items-center gap-2 text-sm text-[#a5a5a5]"><Loader2 className="h-4 w-4 animate-spin" /> جاري قراءة حالة النسخ...</div>;
  const running = status?.job?.status === 'running';

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="rounded-xl border border-[#2e2f2f] bg-[#1c1d1d] p-4">
        <div className="flex items-center gap-2 font-bold text-white"><HardDrive className="h-5 w-5 text-[#21c063]" /> نسخة تطبيق الحوالات على Google Drive</div>
        <p className="mt-2 text-xs leading-relaxed text-[#a5a5a5]">هذا حساب Drive مستقل تختاره للتطبيق. لا يقرأ التطبيق حساب النسخ المحدد داخل واتساب، ولا يعيد الرسائل إلى واتساب الرسمي. الاسترجاع يضيف الرسائل والصور المحفوظة إلى تطبيق الحوالات دون حذف الموجود.</p>
      </div>

      <DesktopDriveSettings />

      {status?.configured && <div className="border-t border-[#2e2f2f] pt-3 text-xs font-bold text-[#a5a5a5]">ربط مباشر اختياري عبر Google API</div>}
      {!status?.configured ? null : !status.connection ? (
        <a href="/api/drive/connect" className="flex min-h-11 items-center justify-center rounded-xl bg-[#21c063] px-4 text-sm font-bold text-white">ربط حساب Google Drive</a>
      ) : (
        <>
          <div className="rounded-xl border border-[#2e2f2f] bg-[#1c1d1d] p-4">
            <div className="text-xs text-[#a5a5a5]">حساب Drive الحالي</div>
            <div dir="ltr" className="mt-1 text-left font-semibold text-white break-all">{status.connection.email}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href="/api/drive/connect" className="flex min-h-10 items-center gap-1.5 rounded-lg border border-[#3b4b44] px-3 text-xs font-bold text-[#21c063]"><RefreshCw className="h-3.5 w-3.5" /> تغيير الحساب</a>
              <button type="button" disabled={busy || running} onClick={() => void run('disconnect')} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-[#3b3b3b] px-3 text-xs text-[#a5a5a5] disabled:opacity-50"><Unplug className="h-3.5 w-3.5" /> فصل الحساب</button>
            </div>
          </div>
          <button type="button" disabled={busy || running} onClick={() => void run('backup')} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#21c063] px-4 font-bold text-white disabled:opacity-50"><CloudUpload className="h-4 w-4" /> حفظ نسخة جديدة الآن</button>
          {status.error && <div className="text-xs text-amber-300">{status.error}</div>}
          {status.job && (
            <div className={`rounded-xl border p-3 text-xs ${status.job.status === 'failed' ? 'border-rose-500/40 text-rose-300' : 'border-[#2e2f2f] text-[#a5a5a5]'}`}>
              {running ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {status.job.action === 'backup' ? 'جاري رفع النسخة...' : 'جاري استرجاع النسخة...'}</span> : status.job.status === 'failed' ? status.job.error : status.job.action === 'backup' ? `اكتمل الحفظ: ${status.job.result?.messages || 0} رسالة، ${status.job.result?.media || 0} ملف وسائط. ${status.job.result?.missingMedia ? `${status.job.result.missingMedia} ملف وسائط لم يكن موجوداً على الجهاز.` : ''}` : `اكتمل الاسترجاع: أضيفت ${status.job.result?.addedMessages || 0} رسالة و${status.job.result?.media || 0} ملف وسائط.`}
              {status.job.status === 'completed' && status.job.action === 'restore' && <button type="button" onClick={() => window.location.reload()} className="mt-2 block rounded-lg bg-[#21c063] px-3 py-2 font-bold text-white">عرض المحادثات المسترجعة</button>}
            </div>
          )}
          <div className="text-xs font-bold text-white">النسخ المتاحة في الحساب الحالي</div>
          {status.backups.length === 0 ? <div className="text-xs text-[#a5a5a5]">لا توجد نسخ محفوظة بعد.</div> : status.backups.map((backup) => (
            <div key={backup.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2e2f2f] bg-[#1c1d1d] p-3">
              <div className="min-w-0"><div className="truncate text-xs font-semibold text-white">{backup.name}</div><div className="mt-1 text-[11px] text-[#a5a5a5]">{backup.createdTime ? new Date(backup.createdTime).toLocaleString('ar-JO') : ''} · {backup.size ? `${(Number(backup.size) / 1024 / 1024).toFixed(1)} MB` : ''}</div></div>
              <button type="button" disabled={busy || running} onClick={() => void run('restore', backup.id)} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-[#3b4b44] px-3 text-xs font-bold text-[#21c063] disabled:opacity-50"><CloudDownload className="h-3.5 w-3.5" /> استرجاع إلى التطبيق</button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
