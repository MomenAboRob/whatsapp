"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileText, Loader2, Search, Upload, Users } from 'lucide-react';

type FileSummary = { id: string; name: string; createdAt: string; total: number; remaining: number };
type AllocationSummary = { id: string; fileId: string; personJid: string; personName: string; count: number; createdAt: string };
type Contact = { id: string; name: string; phone?: string };
type Snapshot = { files: FileSummary[]; allocations: AllocationSummary[]; contacts: Contact[] };

export function WhatsAppNumberCenter() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [fileId, setFileId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [perPerson, setPerPerson] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const response = await fetch('/api/whatsapp/number-center', { cache: 'no-store' });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || 'تعذر تحميل مركز الملفات');
    setData(json);
    setFileId((current) => json.files.some((file: FileSummary) => file.id === current) ? current : (json.files[0]?.id || ''));
  }, []);
  useEffect(() => { void refresh().catch((err) => setError(err.message)); }, [refresh]);

  const currentFile = data?.files.find((file) => file.id === fileId);
  const filteredContacts = useMemo(() => (data?.contacts || []).filter((contact) =>
    `${contact.name} ${contact.phone || ''}`.toLowerCase().includes(search.toLowerCase().trim())
  ), [data, search]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const form = new FormData();
      for (const file of Array.from(files)) form.append('files', file);
      const response = await fetch('/api/whatsapp/number-center', { method: 'POST', body: form });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'تعذر رفع الملفات');
      setNotice(`تمت إضافة ${json.uploaded.reduce((sum: number, item: { added: number }) => sum + item.added, 0)} رقم جديد. الأرقام المكررة لم تُضف.`);
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر رفع الملفات'); }
    finally { setBusy(false); }
  };

  const allocate = async () => {
    if (!fileId || !selected.length) { setError('اختر الملف والأشخاص أولًا'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/whatsapp/number-center', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'allocate', fileId, recipientIds: selected, perPerson }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'تعذر توزيع الأرقام');
      setNotice(`تم حجز ${selected.length * perPerson} رقم لـ ${selected.length} أشخاص. يمكنك تنزيل نصيب كل شخص من السجل أدناه.`);
      setSelected([]);
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر توزيع الأرقام'); }
    finally { setBusy(false); }
  };

  return <div dir="rtl" className="h-full overflow-y-auto bg-[#111716] px-4 py-5 text-[#f5f7f6] sm:px-7">
    <div className="mx-auto max-w-6xl space-y-5">
      <header><p className="text-xs font-bold text-[#21c063]">توزيع الأرقام</p><h1 className="mt-1 text-2xl font-bold">مركز الملفات</h1><p className="mt-1 text-sm text-[#98aaa2]">ارفع ملفات TXT أو CSV، ثم احجز أرقامًا جديدة لكل شخص. الأرقام المحجوزة لا تدخل في أي توزيع لاحق.</p></header>
      {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</div>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-[#2a3933] bg-[#18201d] p-4">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-bold">ملفات الأرقام</h2><p className="mt-1 text-xs text-[#98aaa2]">تُقبل عدة ملفات. الرقم الموجود سابقًا لا يُضاف مرة ثانية.</p></div><label className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-[#21c063] px-3 py-2 text-xs font-bold text-[#092116]"><Upload className="h-4 w-4" />رفع ملفات<input type="file" multiple accept=".txt,.csv,text/plain,text/csv" className="hidden" disabled={busy} onChange={(event) => { void upload(event.target.files); event.target.value = ''; }} /></label></div>
          <div className="mt-4 space-y-2">{data?.files.map((file) => <button key={file.id} type="button" onClick={() => setFileId(file.id)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-right ${file.id === fileId ? 'border-[#21c063] bg-[#203328]' : 'border-[#34453c] hover:bg-[#223228]'}`}><FileText className="h-5 w-5 shrink-0 text-[#21c063]" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{file.name}</span><span className="text-xs text-[#98aaa2]">{file.total} رقم · المتبقي {file.remaining}</span></span>{file.remaining === 0 && <span className="rounded-full bg-amber-500/15 px-2 py-1 text-xs text-amber-300">خلصت الأرقام</span>}</button>)}{data && !data.files.length && <p className="rounded-xl border border-dashed border-[#34453c] p-6 text-center text-sm text-[#98aaa2]">ارفع أول ملف أرقام للبدء.</p>}</div>
        </section>
        <section className="rounded-2xl border border-[#2a3933] bg-[#18201d] p-4">
          <h2 className="font-bold">توزيع جديد</h2><p className="mt-1 text-xs text-[#98aaa2]">اختر الأشخاص وعدد الأرقام لكل شخص. الحجز نهائي حتى لا يتكرر أي رقم.</p>
          <label className="mt-4 block text-xs font-semibold">عدد الأرقام لكل شخص<input type="number" min={1} max={1000} value={perPerson} onChange={(event) => setPerPerson(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-[#34453c] bg-[#111716] p-2 text-sm outline-none focus:border-[#21c063]" /></label>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#98aaa2]"><Users className="h-4 w-4" />اخترت {selected.length} أشخاص · المطلوب {selected.length * (Number.isFinite(perPerson) ? perPerson : 0)} رقم · المتبقي في الملف {currentFile?.remaining || 0}</div>
          <div className="relative mt-3"><Search className="absolute right-3 top-2.5 h-4 w-4 text-[#98aaa2]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن شخص بالاسم أو الرقم" className="w-full rounded-lg border border-[#34453c] bg-[#111716] py-2 pr-9 pl-3 text-sm outline-none focus:border-[#21c063]" /></div>
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">{filteredContacts.slice(0, 300).map((contact) => <label key={contact.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-[#223228]"><input type="checkbox" checked={selected.includes(contact.id)} onChange={() => setSelected((current) => current.includes(contact.id) ? current.filter((id) => id !== contact.id) : [...current, contact.id])} className="h-4 w-4 accent-[#21c063]" /><span className="min-w-0 flex-1 truncate">{contact.name}</span><span dir="ltr" className="text-xs text-[#98aaa2]">{contact.phone || ''}</span></label>)}</div>
          <button type="button" disabled={busy || !fileId || !selected.length || !currentFile?.remaining} onClick={() => void allocate()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#21c063] px-4 py-2.5 text-sm font-bold text-[#092116] disabled:cursor-not-allowed disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}حجز الأرقام المختارة</button>
          <p className="mt-2 text-xs text-[#98aaa2]">الحجز والتوزيع داخل النظام فقط؛ لا تُرسل رسائل واتساب تلقائيًا.</p>
        </section>
      </div>
      <section className="rounded-2xl border border-[#2a3933] bg-[#18201d] p-4"><h2 className="font-bold">سجل التوزيع</h2><p className="mt-1 text-xs text-[#98aaa2]">كل دفعة محفوظة باسم الشخص والملف وتاريخ الحجز.</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{data?.allocations.map((item) => <div key={item.id} className="rounded-xl border border-[#34453c] bg-[#111716] p-3"><div className="font-semibold">{item.personName}</div><div className="mt-1 truncate text-xs text-[#98aaa2]">{data.files.find((file) => file.id === item.fileId)?.name || 'ملف أرقام'} · {item.count} رقم</div><div className="mt-1 text-xs text-[#98aaa2]">{new Date(item.createdAt).toLocaleString('ar-JO')}</div><a href={`/api/whatsapp/number-center?download=${encodeURIComponent(item.id)}`} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#21c063] hover:underline"><Download className="h-4 w-4" />تنزيل أرقام الشخص</a></div>)}{data && !data.allocations.length && <p className="text-sm text-[#98aaa2]">لم تُحجز أرقام بعد.</p>}</div></section>
    </div>
  </div>;
}
