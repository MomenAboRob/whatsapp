"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileText, Loader2, MessageSquare, Pencil, Plus, Search, Trash2, Upload, Users, X } from 'lucide-react';

type FileSummary = { id: string; name: string; createdAt: string; total: number; remaining: number };
type AllocationSummary = { id: string; fileId: string; fileName?: string; personJid: string; personName: string; count: number; createdAt: string };
type Contact = { id: string; name: string; phone?: string };
type Branch = { id: string; name: string; members: Array<{ id: string; name: string }>; createdAt: string };
type Snapshot = { files: FileSummary[]; allocations: AllocationSummary[]; contacts: Contact[]; branches: Branch[] };

export function WhatsAppNumberCenter({ onPrepareMessage }: { onPrepareMessage: (target: string, text: string) => void }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [fileId, setFileId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [editingBranchId, setEditingBranchId] = useState('');
  const [branchName, setBranchName] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
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
    setFileId((current) => json.files.some((file: FileSummary) => file.id === current) ? current : '');
    setBranchId((current) => json.branches.some((branch: Branch) => branch.id === current) ? current : '');
  }, []);
  useEffect(() => { void refresh().catch((err) => setError(err.message)); }, [refresh]);

  const currentFile = data?.files.find((file) => file.id === fileId);
  const currentBranch = data?.branches.find((branch) => branch.id === branchId);
  const editingBranch = data?.branches.find((branch) => branch.id === editingBranchId);
  const filteredContacts = useMemo(() => search.trim().length >= 2 ? (data?.contacts || []).filter((contact) =>
    `${contact.name} ${contact.phone || ''}`.toLowerCase().includes(search.toLowerCase().trim()) &&
    !data?.branches.find((branch) => branch.id === editingBranchId)?.members.some((member) => member.id === contact.id)
  ).slice(0, 30) : [], [data, search, editingBranchId]);

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
    if (!fileId || !branchId || !currentBranch?.members.length) { setError('اختر الملف وفرعًا فيه أشخاص أولًا'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/whatsapp/number-center', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'allocate', fileId, branchId, perPerson }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'تعذر توزيع الأرقام');
      setNotice(`تم حجز ${currentBranch.members.length * perPerson} رقم لـ ${currentBranch.members.length} أشخاص في فرع ${currentBranch.name}. يمكنك تنزيل نصيب كل شخص من السجل أدناه.`);
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر توزيع الأرقام'); }
    finally { setBusy(false); }
  };

  const deleteFile = async (file: FileSummary) => {
    if (!window.confirm(`حذف ملف «${file.name}» من المركز؟\nستبقى الأرقام الموزعة سابقًا محفوظة في السجل ولن تُوزع مرة أخرى.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/whatsapp/number-center', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_file', fileId: file.id }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'تعذر حذف الملف');
      await refresh();
      setNotice(`تم حذف ملف «${file.name}». الأرقام الموزعة سابقًا ما زالت محجوزة.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر حذف الملف'); }
    finally { setBusy(false); }
  };

  const branchAction = async (body: Record<string, unknown>) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/whatsapp/number-center', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'تعذر حفظ الفرع');
      await refresh();
      return json;
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر حفظ الفرع'); return null; }
    finally { setBusy(false); }
  };
  const createBranch = async () => {
    const json = await branchAction({ action: 'create_branch', name: newBranchName });
    if (!json) return;
    setNewBranchName(''); setBranchId(json.branch.id); setEditingBranchId(json.branch.id); setBranchName(json.branch.name); setSearch('');
  };
  const openBranchEditor = (branch: Branch) => {
    setEditingBranchId(branch.id); setBranchName(branch.name); setSearch(''); setError('');
  };
  const deleteBranch = async (branch: Branch) => {
    if (!window.confirm(`حذف فرع «${branch.name}»؟\nسجل توزيعات الأرقام السابقة سيبقى محفوظًا.`)) return;
    if (await branchAction({ action: 'delete_branch', branchId: branch.id })) setEditingBranchId('');
  };
  const prepareMessage = async (allocation: AllocationSummary) => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/whatsapp/number-center?draft=${encodeURIComponent(allocation.id)}`, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'تعذر تجهيز الرسالة');
      if (json.text.length > 4096) throw new Error('هذه الدفعة أطول من رسالة واتساب واحدة. نزّل الملف أو وزّع عددًا أقل في المرة القادمة.');
      onPrepareMessage(json.personJid, json.text);
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر تجهيز الرسالة'); }
    finally { setBusy(false); }
  };

  return <div dir="rtl" className="h-full overflow-y-auto bg-[#111716] px-4 py-5 text-[#f5f7f6] sm:px-7">
    <div className="mx-auto max-w-6xl space-y-5">
      <header><p className="text-xs font-bold text-[#21c063]">توزيع الأرقام</p><h1 className="mt-1 text-2xl font-bold">مركز الملفات</h1><p className="mt-1 text-sm text-[#98aaa2]">ارفع ملفات TXT أو CSV، ثم احجز أرقامًا جديدة لكل شخص. الأرقام المحجوزة لا تدخل في أي توزيع لاحق.</p></header>
      {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</div>}
      <section className="rounded-2xl border border-[#2a3933] bg-[#18201d] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">قوائم الفروع</h2><p className="mt-1 text-xs text-[#98aaa2]">احفظ الأشخاص داخل كل فرع، ثم اختر الفرع عند توزيع الأرقام.</p></div><form onSubmit={(event) => { event.preventDefault(); void createBranch(); }} className="flex gap-2"><input required maxLength={80} value={newBranchName} onChange={(event) => setNewBranchName(event.target.value)} placeholder="اسم الفرع، مثل ليبيا" className="min-w-0 rounded-lg border border-[#34453c] bg-[#111716] px-3 py-2 text-sm outline-none focus:border-[#21c063]" /><button disabled={busy} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#21c063] px-3 py-2 text-xs font-bold text-[#092116] disabled:opacity-50"><Plus className="h-4 w-4" />إضافة فرع</button></form></div>
        <div className="mt-4 flex flex-wrap gap-2">{data?.branches.map((branch) => <div key={branch.id} className={`inline-flex items-center gap-1 rounded-xl border p-1 ${branch.id === branchId ? 'border-[#21c063] bg-[#203328]' : 'border-[#34453c] bg-[#111716]'}`}><button type="button" onClick={() => setBranchId(branch.id)} className="px-2 py-1.5 text-sm font-semibold">{branch.name} <span className="text-xs text-[#98aaa2]">({branch.members.length})</span></button><button type="button" onClick={() => openBranchEditor(branch)} aria-label={`تعديل فرع ${branch.name}`} title={`تعديل فرع ${branch.name}`} className="rounded-lg p-1.5 text-[#98aaa2] hover:bg-[#304437] hover:text-white"><Pencil className="h-3.5 w-3.5" /></button></div>)}{data && !data.branches.length && <p className="text-sm text-[#98aaa2]">أضف فرعًا ثم اختر الأشخاص التابعين له.</p>}</div>
      </section>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-[#2a3933] bg-[#18201d] p-4">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-bold">ملفات الأرقام</h2><p className="mt-1 text-xs text-[#98aaa2]">تُقبل عدة ملفات. الرقم الموجود سابقًا لا يُضاف مرة ثانية.</p></div><label className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-[#21c063] px-3 py-2 text-xs font-bold text-[#092116]"><Upload className="h-4 w-4" />رفع ملفات<input type="file" multiple accept=".txt,.csv,text/plain,text/csv" className="hidden" disabled={busy} onChange={(event) => { void upload(event.target.files); event.target.value = ''; }} /></label></div>
          <div className="mt-4 space-y-2">{data?.files.map((file) => <div key={file.id} className={`flex w-full items-center gap-1 rounded-xl border p-1 ${file.id === fileId ? 'border-[#21c063] bg-[#203328]' : 'border-[#34453c] hover:bg-[#223228]'}`}><button type="button" onClick={() => setFileId(file.id)} className="flex min-w-0 flex-1 items-center gap-3 p-2 text-right"><FileText className="h-5 w-5 shrink-0 text-[#21c063]" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{file.name}</span><span className="text-xs text-[#98aaa2]">{file.total} رقم · المتبقي {file.remaining}</span></span>{file.remaining === 0 && <span className="rounded-full bg-amber-500/15 px-2 py-1 text-xs text-amber-300">خلصت الأرقام</span>}</button><button type="button" onClick={() => void deleteFile(file)} disabled={busy} title={`حذف ${file.name}`} aria-label={`حذف ${file.name}`} className="shrink-0 rounded-lg p-2 text-[#98aaa2] hover:bg-rose-500/10 hover:text-rose-300 focus-visible:outline-2 focus-visible:outline-rose-400 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></div>)}{data && !data.files.length && <p className="rounded-xl border border-dashed border-[#34453c] p-6 text-center text-sm text-[#98aaa2]">ارفع أول ملف أرقام للبدء.</p>}</div>
        </section>
        <section className="rounded-2xl border border-[#2a3933] bg-[#18201d] p-4">
          <h2 className="font-bold">توزيع جديد</h2><p className="mt-1 text-xs text-[#98aaa2]">اختر ملف المصدر والفرع. نأخذ الأرقام بالترتيب من أول رقم غير موزع في الملف المختار.</p>
          <label className="mt-4 block text-xs font-semibold">ملف المصدر<select required value={fileId} onChange={(event) => setFileId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#34453c] bg-[#111716] p-2 text-sm outline-none focus:border-[#21c063]"><option value="">اختر الملف الذي يبدأ التوزيع منه</option>{data?.files.map((file) => <option key={file.id} value={file.id} disabled={file.remaining === 0}>{file.name} · المتبقي {file.remaining}</option>)}</select></label>
          <label className="mt-4 block text-xs font-semibold">الفرع<select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#34453c] bg-[#111716] p-2 text-sm outline-none focus:border-[#21c063]"><option value="">اختر فرعًا</option>{data?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} · {branch.members.length} أشخاص</option>)}</select></label>
          <label className="mt-4 block text-xs font-semibold">عدد الأرقام لكل شخص<input type="number" min={1} max={1000} value={perPerson} onChange={(event) => setPerPerson(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-[#34453c] bg-[#111716] p-2 text-sm outline-none focus:border-[#21c063]" /></label>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#98aaa2]"><Users className="h-4 w-4" />{currentBranch?.members.length || 0} أشخاص · المطلوب {(currentBranch?.members.length || 0) * (Number.isFinite(perPerson) ? perPerson : 0)} رقم · المتبقي في الملف {currentFile?.remaining || 0}</div>
          {currentBranch && <div className="mt-3 rounded-xl border border-[#34453c] bg-[#111716] p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">أعضاء فرع {currentBranch.name}</span><button type="button" onClick={() => openBranchEditor(currentBranch)} className="text-xs font-bold text-[#21c063] hover:underline">تعديل الأعضاء</button></div><p className="mt-2 text-xs leading-6 text-[#98aaa2]">{currentBranch.members.length ? currentBranch.members.map((member) => member.name).join('، ') : 'لا يوجد أشخاص في هذا الفرع بعد.'}</p></div>}
          <button type="button" disabled={busy || !fileId || !currentBranch?.members.length || !currentFile?.remaining} onClick={() => void allocate()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#21c063] px-4 py-2.5 text-sm font-bold text-[#092116] disabled:cursor-not-allowed disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}حجز أرقام للفرع</button>
          <p className="mt-2 text-xs text-[#98aaa2]">بعد الحجز، جهّز رسالة واحدة لكل شخص تحتوي أرقامه، رقمًا في كل سطر. لن تُرسل تلقائيًا.</p>
        </section>
      </div>
      <section className="rounded-2xl border border-[#2a3933] bg-[#18201d] p-4"><h2 className="font-bold">سجل التوزيع</h2><p className="mt-1 text-xs text-[#98aaa2]">كل دفعة محفوظة باسم الشخص والملف وتاريخ الحجز.</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{data?.allocations.map((item) => <div key={item.id} className="rounded-xl border border-[#34453c] bg-[#111716] p-3"><div className="font-semibold">{item.personName}</div><div className="mt-1 truncate text-xs text-[#98aaa2]">{item.fileName || data.files.find((file) => file.id === item.fileId)?.name || 'ملف أرقام'} · {item.count} رقم</div><div className="mt-1 text-xs text-[#98aaa2]">{new Date(item.createdAt).toLocaleString('ar-JO')}</div><div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => void prepareMessage(item)} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#21c063] hover:underline disabled:opacity-50"><MessageSquare className="h-4 w-4" />تجهيز رسالة الأرقام</button><a href={`/api/whatsapp/number-center?download=${encodeURIComponent(item.id)}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#98aaa2] hover:underline"><Download className="h-4 w-4" />تنزيل الأرقام</a></div></div>)}{data && !data.allocations.length && <p className="text-sm text-[#98aaa2]">لم تُحجز أرقام بعد.</p>}</div></section>
      {editingBranch && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingBranchId(''); }}><div role="dialog" aria-modal="true" aria-label={`تعديل فرع ${editingBranch.name}`} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#3b5445] bg-[#18201d] p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#21c063]">قائمة الفرع</p><h2 className="mt-1 text-xl font-bold">{editingBranch.name}</h2></div><button type="button" onClick={() => setEditingBranchId('')} aria-label="إغلاق" className="rounded-lg p-1 text-[#98aaa2] hover:bg-white/10"><X className="h-5 w-5" /></button></div>
        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-500/10 p-2 text-xs text-rose-300">{error}</p>}
        <form onSubmit={(event) => { event.preventDefault(); void branchAction({ action: 'rename_branch', branchId: editingBranch.id, name: branchName }); }} className="mt-4 flex gap-2"><input required maxLength={80} value={branchName} onChange={(event) => setBranchName(event.target.value)} aria-label="اسم الفرع" className="min-w-0 flex-1 rounded-lg border border-[#34453c] bg-[#111716] px-3 py-2 text-sm outline-none focus:border-[#21c063]" /><button disabled={busy || branchName.trim() === editingBranch.name} className="rounded-lg border border-[#3b5445] px-3 py-2 text-xs font-bold disabled:opacity-50">حفظ الاسم</button></form>
        <h3 className="mt-5 text-sm font-bold">الأشخاص في الفرع · {editingBranch.members.length}</h3><div className="mt-2 max-h-40 space-y-1 overflow-y-auto">{editingBranch.members.map((member) => <div key={member.id} className="flex items-center justify-between gap-2 rounded-lg bg-[#111716] px-3 py-2 text-sm"><span className="truncate">{member.name}</span><button type="button" disabled={busy} onClick={() => void branchAction({ action: 'remove_branch_member', branchId: editingBranch.id, memberId: member.id })} aria-label={`إزالة ${member.name}`} className="shrink-0 rounded-lg p-1 text-[#98aaa2] hover:bg-rose-500/10 hover:text-rose-300"><X className="h-4 w-4" /></button></div>)}{!editingBranch.members.length && <p className="text-xs text-[#98aaa2]">أضف أشخاصًا إلى هذا الفرع.</p>}</div>
        <h3 className="mt-5 text-sm font-bold">إضافة شخص</h3><div className="relative mt-2"><Search className="absolute right-3 top-2.5 h-4 w-4 text-[#98aaa2]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="اكتب الاسم أو الرقم للبحث" className="w-full rounded-lg border border-[#34453c] bg-[#111716] py-2 pr-9 pl-3 text-sm outline-none focus:border-[#21c063]" /></div><p className="mt-1 text-xs text-[#98aaa2]">تظهر النتائج بعد كتابة حرفين على الأقل؛ لن تُعرض كل جهات الاتصال.</p><div className="mt-2 max-h-48 space-y-1 overflow-y-auto">{filteredContacts.map((contact) => <button key={contact.id} type="button" disabled={busy} onClick={() => void branchAction({ action: 'add_branch_member', branchId: editingBranch.id, memberId: contact.id })} className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-right text-sm hover:bg-[#223228] disabled:opacity-50"><span className="min-w-0 truncate">{contact.name}</span><span className="flex shrink-0 items-center gap-2 text-xs text-[#21c063]"><span dir="ltr" className="text-[#98aaa2]">{contact.phone || ''}</span><Plus className="h-4 w-4" /></span></button>)}{search.trim().length >= 2 && !filteredContacts.length && <p className="p-2 text-xs text-[#98aaa2]">لا توجد نتائج جديدة.</p>}</div>
        <div className="mt-5 border-t border-[#34453c] pt-4"><button type="button" disabled={busy} onClick={() => void deleteBranch(editingBranch)} className="inline-flex items-center gap-2 text-xs font-bold text-rose-300 hover:underline"><Trash2 className="h-4 w-4" />حذف الفرع</button></div>
      </div></div>}
    </div>
  </div>;
}
