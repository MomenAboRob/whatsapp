'use client';

import { useEffect, useState } from 'react';
import { Archive, Download, Loader2, Trash2 } from 'lucide-react';

type ArchiveInfo = {
  id: string;
  batchName: string;
  createdAt: number;
  counts: { trainees: number; payments: number };
  attachments: { trainees: number; payments: number };
  downloaded: { trainees: boolean; payments: boolean };
};

export function AirtableBatchArchive({ onCleared }: { onCleared: () => void }) {
  const [currentBatch, setCurrentBatch] = useState('150');
  const [batchName, setBatchName] = useState('دفعة 150');
  const [nextBatch, setNextBatch] = useState('151');
  const [archive, setArchive] = useState<ArchiveInfo | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<'prepare' | 'clear' | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function refresh() {
    const response = await fetch('/api/transfers/airtable/archive', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    setCurrentBatch(data.currentBatch);
    setNextBatch(String(Number(data.currentBatch) + 1));
    setBatchName((previous) => previous === 'دفعة 150' ? `دفعة ${data.currentBatch}` : previous);
    setArchive(data.archive || null);
  }

  useEffect(() => { void refresh(); }, []);

  async function post(payload: Record<string, unknown>) {
    const response = await fetch('/api/transfers/airtable/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'تعذرت العملية');
    return data;
  }

  async function prepare() {
    setBusy('prepare'); setError(''); setSuccess(''); setSaved(false); setConfirmation('');
    try {
      const data = await post({ action: 'prepare', batchName });
      setArchive(data.archive);
      setSuccess('تم تجهيز الملفين. نزّلهما وافتحهما للتأكد من البيانات والمرفقات.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تجهيز الأرشيف'); }
    finally { setBusy(null); }
  }

  async function clear() {
    if (!archive) return;
    setBusy('clear'); setError(''); setSuccess('');
    try {
      await post({ action: 'clear', id: archive.id, confirmation, confirmSaved: saved, nextBatch });
      setArchive(null); setSaved(false); setConfirmation('');
      setCurrentBatch(nextBatch); setBatchName(`دفعة ${nextBatch}`);
      setSuccess(`تم تفريغ سجلات الدفعة السابقة. الدفعة الحالية الآن ${nextBatch}.`);
      window.dispatchEvent(new CustomEvent('hawalat-batch-changed', { detail: { batchNumber: nextBatch } }));
      onCleared();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تفريغ الدفعة'); }
    finally { setBusy(null); }
  }

  const canClear = Boolean(archive && archive.downloaded.trainees && archive.downloaded.payments && saved && confirmation === archive.batchName && /^\d{1,6}$/.test(nextBatch) && nextBatch !== currentBatch && !busy);

  return (
    <section className="rounded-2xl border border-[#34423f] bg-[#182125] p-4 sm:p-5" aria-label="أرشفة الدفعة">
      <div className="mb-3 flex items-center gap-2 text-[#f0f6f3]"><Archive className="h-5 w-5 text-emerald-400" /><h2 className="text-lg font-bold">أرشفة الدفعة والبدء بدفعة جديدة</h2></div>
      <p className="mb-4 text-sm leading-6 text-[#a9beb7]">الدفعة الحالية: {currentBatch}. جهّز ملف ZIP للمتدربين وملفًا مستقلًا للمدفوعات. داخل كل ملف Excel والبيانات الأصلية ومجلد صور الوصول والمرفقات.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm text-[#c6d9d0]">اسم الدفعة للأرشيف<input value={batchName} onChange={(event) => setBatchName(event.target.value)} disabled={Boolean(busy)} className="mt-1 block min-h-10 rounded-lg border border-[#455b53] bg-[#101918] px-3 text-white" /></label>
        <button type="button" disabled={Boolean(busy) || !batchName.trim()} onClick={prepare} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 font-semibold text-white disabled:opacity-50">{busy === 'prepare' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />} تجهيز الملفين</button>
      </div>
      {busy === 'prepare' && <p className="mt-3 text-sm text-amber-200">جارٍ قراءة جميع السجلات وتنزيل المرفقات الأصلية؛ قد تستغرق العملية عدة دقائق.</p>}
      {archive && <div className="mt-5 rounded-xl border border-[#41554d] bg-[#111b1a] p-4">
        <p className="mb-3 font-bold text-white">{archive.batchName} — جاهز للتنزيل</p>
        <div className="flex flex-wrap gap-2">
          {(['trainees', 'payments'] as const).map((kind) => <a key={kind} href={`/api/transfers/airtable/archive?id=${encodeURIComponent(archive.id)}&kind=${kind}`} download onClick={() => setArchive((previous) => previous ? { ...previous, downloaded: { ...previous.downloaded, [kind]: true } } : previous)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-600 px-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-950"><Download className="h-4 w-4" />{kind === 'trainees' ? 'تنزيل المتدربين' : 'تنزيل المدفوعات'} ({archive.counts[kind]} سجل، {archive.attachments[kind]} مرفق)</a>)}
        </div>
        <p className="mt-3 text-xs text-[#a9beb7]">بعد فتح الملفين والتأكد من حفظهما على جهازك، اكتب اسم الدفعة وأكّد التفريغ. سيحذف التفريغ سجلات المتدربين والمدفوعات فقط من Airtable.</p>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="text-sm text-[#c6d9d0]">رقم الدفعة الجديدة<input value={nextBatch} onChange={(event) => setNextBatch(event.target.value.replace(/\D/g, ''))} inputMode="numeric" className="mt-1 block min-h-10 w-36 rounded-lg border border-[#455b53] bg-[#101918] px-3 text-white" /></label>
          <label className="text-sm text-[#c6d9d0]">اكتب «{archive.batchName}» للتأكيد<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 block min-h-10 rounded-lg border border-[#455b53] bg-[#101918] px-3 text-white" /></label>
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm text-[#d5e4dc]"><input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} className="mt-1" /> حفظت ملفي ZIP وفتحت Excel والصور داخلهما</label>
        <button type="button" onClick={clear} disabled={!canClear} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-red-700 px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">{busy === 'clear' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} تفريغ الدفعة السابقة</button>
      </div>}
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
      {success && <p role="status" className="mt-3 text-sm text-emerald-300">{success}</p>}
    </section>
  );
}
