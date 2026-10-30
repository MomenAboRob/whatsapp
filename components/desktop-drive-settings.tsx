"use client";

import { useCallback, useEffect, useState } from 'react';
import { CloudDownload, CloudUpload, HardDrive, Loader2, RefreshCw } from 'lucide-react';
import { toast } from '@/components/ui/floating-toast';

type Status = {
  folders: string[];
  config: { folder: string; intervalHours: 24 | 168; lastBackupAt?: string } | null;
  folderAvailable: boolean;
  backups: { name: string; size: number; createdAt: string }[];
  busy: boolean;
  job: { status: 'running' | 'completed' | 'failed'; action: 'backup' | 'restore'; result?: any; error?: string } | null;
};

export function DesktopDriveSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [folder, setFolder] = useState('');
  const [intervalHours, setIntervalHours] = useState<24 | 168>(24);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const response = await fetch('/api/backup/desktop', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'تعذر قراءة حالة النسخ.');
    setStatus(data);
    setFolder((current) => current || data.config?.folder || data.folders?.[0] || '');
    setIntervalHours(data.config?.intervalHours || 24);
  }, []);

  useEffect(() => { void refresh().catch((error) => toast.error(error.message)); }, [refresh]);
  useEffect(() => {
    if (status?.job?.status !== 'running' && status?.folders.length) return;
    const timer = window.setInterval(async () => {
      try {
        if (status?.job?.status === 'running') {
          const response = await fetch('/api/backup/desktop?job=1', { cache: 'no-store' });
          const data = await response.json();
          if (data.job?.status === 'running') setStatus((prev) => prev ? { ...prev, job: data.job } : prev);
          else await refresh();
        } else await refresh();
      } catch {}
    }, 5000);
    return () => window.clearInterval(timer);
  }, [status?.job?.status, status?.folders.length, refresh]);

  const send = async (action: 'backup' | 'restore', name?: string) => {
    setBusy(true);
    try {
      const response = await fetch('/api/backup/desktop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'تعذرت العملية.');
      toast.info(action === 'backup' ? 'بدأ حفظ النسخة في مجلد Google Drive.' : 'بدأ استرجاع النسخة داخل التطبيق.');
      await refresh();
    } catch (error: any) { toast.error(error.message || 'تعذرت العملية.'); }
    finally { setBusy(false); }
  };

  const saveFolder = async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/backup/desktop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'select', folder, intervalHours }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'تعذر حفظ المجلد.');
      await refresh();
      toast.success('تم اختيار مجلد Drive. سيُحفظ فيه ملف النسخة تلقائيًا.');
      await send('backup');
    } catch (error: any) { toast.error(error.message || 'تعذر حفظ المجلد.'); }
    finally { setBusy(false); }
  };

  const importFile = async (file: File) => {
    setBusy(true);
    try {
      const response = await fetch('/api/backup/file', { method: 'POST', body: file });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'تعذر استرجاع الملف.');
      toast.success(`أضيفت ${data.result?.addedMessages || 0} رسالة من الملف.`);
      await refresh();
      window.location.reload();
    } catch (error: any) { toast.error(error.message || 'تعذر استرجاع الملف.'); }
    finally { setBusy(false); }
  };

  const running = status?.job?.status === 'running' || status?.busy;
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="rounded-xl border border-[#2e2f2f] bg-[#1c1d1d] p-4">
        <div className="flex items-center gap-2 font-bold text-white"><HardDrive className="h-5 w-5 text-[#21c063]" /> نسخ تلقائي بحساب Google عادي</div>
        <p className="mt-2 text-xs leading-relaxed text-[#a5a5a5]">يسجل Google Drive للكمبيوتر الدخول بحسابك، ويحفظ التطبيق ملف النسخة في مجلده المتزامن. لا تحتاج حساب مطوّر. يمكنك تغيير حساب Google من برنامج Drive ثم اختيار مجلده هنا. ملف النسخة قابل للقراءة لمن يملك الوصول إلى حساب Drive.</p>
      </div>
      <div className="rounded-xl border border-[#2e2f2f] bg-[#1c1d1d] p-4">
        <div className="text-xs font-bold text-white">نسخة ملفية تعمل حتى قبل ربط Drive</div>
        <p className="mt-1 text-[11px] leading-relaxed text-[#a5a5a5]">يمكنك تنزيل الملف ورفعه بنفسك لأي حساب Google Drive، أو اختيار ملف سابق لاسترجاعه. يحتوي الملف على الرسائل والوسائط دون تشفير إضافي، فاحتفظ به في حساب موثوق.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href="/api/backup/file" className="flex min-h-10 items-center gap-1.5 rounded-lg border border-[#3b4b44] px-3 text-xs font-bold text-[#21c063]"><CloudDownload className="h-3.5 w-3.5" /> تنزيل نسخة</a>
          <label className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-[#3b4b44] px-3 text-xs font-bold text-[#21c063]">
            <CloudUpload className="h-3.5 w-3.5" /> {busy ? 'جاري الاسترجاع...' : 'استرجاع من ملف'}
            <input type="file" accept=".gz,.jsonl.gz" disabled={busy} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ''; }} />
          </label>
        </div>
      </div>
      {!status ? <div className="flex items-center gap-2 text-xs text-[#a5a5a5]"><Loader2 className="h-4 w-4 animate-spin" /> جاري البحث عن مجلد Drive...</div> : status.folders.length === 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-200">
          لم يظهر مجلد Google Drive بعد. أكمل تثبيت برنامج Drive للكمبيوتر وسجّل الدخول بحسابك، ثم اضغط تحديث.
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void refresh()} className="rounded-lg border border-amber-400/40 px-3 py-2 font-bold">تحديث</button><a href="https://support.google.com/drive/answer/10838124" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-amber-400/40 px-3 py-2 font-bold">تعليمات Google</a></div>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-[#2e2f2f] bg-[#1c1d1d] p-4">
            <label className="block text-xs font-bold text-white">مجلد حساب Drive</label>
            <select value={folder} onChange={(event) => setFolder(event.target.value)} className="mt-2 w-full rounded-lg border border-[#3b4b44] bg-[#111212] p-2 text-xs text-white" dir="ltr">
              {status.folders.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
            </select>
            <label className="mt-3 block text-xs font-bold text-white">النسخ التلقائي</label>
            <select value={intervalHours} onChange={(event) => setIntervalHours(Number(event.target.value) as 24 | 168)} className="mt-2 w-full rounded-lg border border-[#3b4b44] bg-[#111212] p-2 text-xs text-white">
              <option value={24}>كل يوم</option><option value={168}>كل أسبوع</option>
            </select>
            <button type="button" disabled={busy || running || !folder} onClick={() => void saveFolder()} className="mt-3 min-h-10 rounded-lg bg-[#21c063] px-4 text-xs font-bold text-white disabled:opacity-50">حفظ المجلد ورفع نسخة الآن</button>
            {status.config?.lastBackupAt && <p className="mt-2 text-[11px] text-[#a5a5a5]">آخر حفظ محلي: {new Date(status.config.lastBackupAt).toLocaleString('ar-JO')}</p>}
          </div>
          {status.config && status.folderAvailable && <button type="button" disabled={busy || running} onClick={() => void send('backup')} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#3b4b44] text-xs font-bold text-[#21c063] disabled:opacity-50"><CloudUpload className="h-4 w-4" /> احفظ نسخة جديدة الآن</button>}
          {status.job && <div className={`rounded-xl border p-3 text-xs ${status.job.status === 'failed' ? 'border-rose-500/40 text-rose-300' : 'border-[#2e2f2f] text-[#a5a5a5]'}`}>
            {status.job.status === 'running' ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {status.job.action === 'backup' ? 'جاري تجهيز ملف النسخة ونسخه إلى Drive...' : 'جاري استرجاع المحادثات...'}</span> : status.job.status === 'failed' ? status.job.error : status.job.action === 'backup' ? `اكتمل نسخ الملف إلى مجلد Drive: ${status.job.result?.messages || 0} رسالة، ${status.job.result?.media || 0} ملف وسائط. ${status.job.result?.missingMedia ? `${status.job.result.missingMedia} ملف وسائط غير موجود محليًا.` : ''}` : `اكتمل الاسترجاع: أضيفت ${status.job.result?.addedMessages || 0} رسالة.`}
            {status.job.status === 'completed' && status.job.action === 'restore' && <button type="button" onClick={() => window.location.reload()} className="mt-2 block rounded-lg bg-[#21c063] px-3 py-2 font-bold text-white">عرض المحادثات المسترجعة</button>}
          </div>}
          <div className="text-xs font-bold text-white">النسخ الموجودة في مجلد Drive</div>
          {status.backups.length === 0 ? <div className="text-xs text-[#a5a5a5]">لا توجد نسخ بعد.</div> : status.backups.map((backup) => <div key={backup.name} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2e2f2f] bg-[#1c1d1d] p-3">
            <div className="min-w-0"><div className="truncate text-xs font-semibold text-white">{backup.name}</div><div className="mt-1 text-[11px] text-[#a5a5a5]">{new Date(backup.createdAt).toLocaleString('ar-JO')} · {(backup.size / 1024 / 1024).toFixed(1)} MB</div></div>
            <button type="button" disabled={busy || running} onClick={() => void send('restore', backup.name)} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-[#3b4b44] px-3 text-xs font-bold text-[#21c063] disabled:opacity-50"><CloudDownload className="h-3.5 w-3.5" /> استرجاع</button>
          </div>)}
          <p className="text-[11px] leading-relaxed text-[#a5a5a5]">ظهور الملف هنا يؤكد نسخه إلى مجلد Drive على الكمبيوتر. تحقق من اكتمال المزامنة في برنامج Google Drive قبل حذف أي بيانات محلية. الاسترجاع يضيف النسخة داخل تطبيق الحوالات، ولا يعيدها إلى واتساب الرسمي.</p>
        </>
      )}
    </div>
  );
}
