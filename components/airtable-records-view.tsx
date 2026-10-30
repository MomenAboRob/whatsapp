'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, Copy, ExternalLink, FileImage, Image as ImageIcon, Pencil, Plus, RefreshCw, Search } from 'lucide-react';
import { toast } from '@/components/ui/floating-toast';

type Tab = 'transfers' | 'deposits';
type WalletFilter = 'all' | 'cash' | 'zain' | 'with_slip';
type ReceiptFilter = 'all' | 'with' | 'without';
type Preview = { url: string; title: string };

export type Receipt = { url: string; filename?: string; type?: string; thumbnails?: { large?: { url: string } } };
export type TransferRecord = {
  id: string;
  createdTime?: string;
  fields: {
    'اسم المشترك'?: string;
    'اسم المرسل'?: string;
    'رقم الحوالة'?: string;
    'بريد الاكتروني'?: string;
    'التاريخ'?: string;
    'المحفظة/الاستلام'?: string;
    'الحالة'?: string;
    'صورة الوصل'?: Receipt[];
    'المبلغ المودع (بعد العمولة)'?: number;
    'المبلغ الأصلي (قبل العمولة)'?: number;
    [key: string]: string | number | Receipt[] | undefined;
  };
};
export type Deposit = {
  id: string;
  amount: number;
  date: string;
  createdTime?: string;
  receipt?: Receipt | null;
};

const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const surface = 'border border-[#2c3b3e] bg-[#151e22]';
const chip = 'min-h-9 rounded-lg border px-3 text-xs font-semibold transition-colors';

function isPdf(receipt: { filename?: string; type?: string; url?: string } | null | undefined) {
  return Boolean(receipt && (receipt.type === 'application/pdf' || /\.pdf(?:$|\?)/i.test(receipt.filename || receipt.url || '')));
}

export function AirtableRecordsView({ records, deposits, loading, error, onRefresh, onNewDeposit, onEditDeposit, onEditTransfer, onPreview, backBlocked = false }: {
  records: TransferRecord[];
  deposits: Deposit[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onNewDeposit: () => void;
  onEditDeposit: (deposit: Deposit) => void;
  onEditTransfer: (record: TransferRecord) => void;
  onPreview: (preview: Preview) => void;
  backBlocked?: boolean;
}) {
  const [tab, setTab] = useState<Tab>('transfers');
  const tabTrailRef = useRef<Tab[]>([]);
  const lastTabRef = useRef<Tab>('transfers');
  const restoringTabRef = useRef(false);
  const [query, setQuery] = useState('');
  const [walletFilter, setWalletFilter] = useState<WalletFilter>('all');
  const [sortMode, setSortMode] = useState<'recent' | 'date'>('date');
  const [receiptFilter, setReceiptFilter] = useState<ReceiptFilter>('all');
  const [visibleTransfers, setVisibleTransfers] = useState(30);
  const [visibleDeposits, setVisibleDeposits] = useState(12);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (tab === lastTabRef.current) return;
    if (!restoringTabRef.current) tabTrailRef.current.push(lastTabRef.current);
    restoringTabRef.current = false;
    lastTabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    const onMobileBack = (event: Event) => {
      const back = event as CustomEvent<{ scope: string; handled: boolean }>;
      if (back.detail.scope !== 'dashboard' || back.detail.handled || backBlocked || !tabTrailRef.current.length) return;
      restoringTabRef.current = true;
      setTab(tabTrailRef.current.pop()!);
      back.detail.handled = true;
    };
    window.addEventListener('hawalat-mobile-back', onMobileBack);
    return () => window.removeEventListener('hawalat-mobile-back', onMobileBack);
  }, [backBlocked]);

  const changeTab = (next: Tab) => { setTab(next); setQuery(''); setVisibleTransfers(30); setVisibleDeposits(12); };

  const filteredTransfers = useMemo(() => records.filter((record) => {
    const fields = record.fields || {};
    const needle = query.trim().toLowerCase();
    const matches = !needle || [fields['اسم المشترك'], fields['اسم المرسل'], fields['رقم الحوالة'], fields['بريد الاكتروني']]
      .some((value) => String(value || '').toLowerCase().includes(needle));
    if (!matches) return false;
    const wallet = String(fields['المحفظة/الاستلام'] || '');
    return walletFilter === 'all' || (walletFilter === 'cash' && /كاش|يدوي/.test(wallet))
      || (walletFilter === 'zain' && wallet.includes('زين'))
      || (walletFilter === 'with_slip' && Boolean(fields['صورة الوصل']?.length));
  }).sort((a, b) => {
    const date = (record: TransferRecord) => Date.parse(String(record.fields?.['التاريخ'] || '')) || 0;
    const created = (record: TransferRecord) => Date.parse(String(record.createdTime || '')) || date(record);
    return sortMode === 'recent' ? created(b) - created(a) || date(b) - date(a) : date(b) - date(a) || created(b) - created(a);
  }), [records, query, walletFilter, sortMode]);

  const filteredDeposits = useMemo(() => deposits.filter((deposit) => {
    const needle = query.trim().toLowerCase();
    const matches = !needle || [deposit.date, deposit.amount, deposit.id].some((value) => String(value || '').toLowerCase().includes(needle));
    return matches && (receiptFilter === 'all' || (receiptFilter === 'with' ? Boolean(deposit.receipt) : !deposit.receipt));
  }).sort((a, b) => (Date.parse(b.date) || Date.parse(b.createdTime || '') || 0) - (Date.parse(a.date) || Date.parse(a.createdTime || '') || 0)), [deposits, query, receiptFilter]);

  const copyTransfer = async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      toast.success('تم نسخ رقم الحوالة');
      setTimeout(() => setCopiedId((current) => current === id ? null : current), 2000);
    } catch { toast.error('تعذر نسخ رقم الحوالة'); }
  };
  const openReceipt = (receipt: Deposit['receipt'], title: string) => {
    if (!receipt?.url) return;
    if (isPdf(receipt)) window.open(receipt.url, '_blank', 'noopener,noreferrer');
    else onPreview({ url: receipt.url, title });
  };

  return <section className={`overflow-hidden rounded-2xl ${surface}`} dir="rtl">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2c3b3e] px-3 sm:px-5">
      <div className="flex max-w-full gap-4 overflow-x-auto" role="tablist" aria-label="سجلات Airtable">
        <button type="button" role="tab" aria-selected={tab === 'transfers'} onClick={() => changeTab('transfers')} className={`flex min-h-14 shrink-0 items-center gap-2 border-b-2 text-xs font-bold sm:text-sm ${tab === 'transfers' ? 'border-emerald-400 text-white' : 'border-transparent text-[#9cb0ac]'}`}>حوالات المشتركين <span className="rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-[11px] tabular-nums text-emerald-300">{error ? '—' : records.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === 'deposits'} onClick={() => changeTab('deposits')} className={`flex min-h-14 shrink-0 items-center gap-2 border-b-2 text-xs font-bold sm:text-sm ${tab === 'deposits' ? 'border-emerald-400 text-white' : 'border-transparent text-[#9cb0ac]'}`}>مدفوعات الشركة <span className="rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-[11px] tabular-nums text-emerald-300">{error ? '—' : deposits.length}</span></button>
      </div>
      <div className="flex items-center gap-2 pb-2 sm:pb-0">
        <a href="https://airtable.com/appa4QwIo3HKC7NAM" target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#34433f] px-2.5 text-xs text-[#9eddb5]"><ExternalLink className="h-3.5 w-3.5" />أيرتيبل</a>
        <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#34433f] px-2.5 text-xs text-[#cbd9d4] disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />تحديث</button>
      </div>
    </div>

    {error && <div className="m-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"><span>{error}</span>{!error.includes('الشهرية') && <button type="button" onClick={onRefresh} className="font-bold underline">إعادة المحاولة</button>}</div>}

    {tab === 'transfers' ? <div role="tabpanel" className="min-w-0">
      <div className="flex flex-col gap-3 border-b border-[#2c3b3e] p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#33444a] bg-[#10181b] px-3 sm:min-w-60 sm:max-w-sm"><Search className="h-4 w-4 shrink-0 text-[#91a8a5]" /><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleTransfers(30); setVisibleDeposits(12); }} placeholder="الاسم، المرسل أو رقم الحوالة" className="min-w-0 w-full bg-transparent text-sm text-white outline-none placeholder:text-[#788e8b]" /></label>
          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0" aria-label="طريقة الاستلام">{([
            ['all', 'الكل'], ['cash', 'كاش يدوي'], ['zain', 'زين كاش'], ['with_slip', 'مع وصل'],
          ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={walletFilter === value} onClick={() => { setWalletFilter(value); setVisibleTransfers(30); }} className={`${chip} shrink-0 ${walletFilter === value ? 'border-emerald-600 bg-emerald-500/15 text-emerald-300' : 'border-[#34433f] bg-[#1a2529] text-[#c4d4cf]'}`}>{label}</button>)}</div>
        </div>
        <label className="flex items-center gap-2 text-xs text-[#9db1ad]">ترتيب<select value={sortMode} onChange={(event) => { setSortMode(event.target.value as 'recent' | 'date'); setVisibleTransfers(30); }} className="min-h-10 rounded-lg border border-[#34433f] bg-[#1a2529] px-2 text-xs text-white"><option value="recent">الأحدث إضافة</option><option value="date">الأحدث بتاريخ الحوالة</option></select></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-[#91a8a5]"><span>{error ? 'تعذر عرض الحوالات' : `عرض ${Math.min(visibleTransfers, filteredTransfers.length)} من ${filteredTransfers.length} حوالة`}</span><span>اضغط على رقم الحوالة لنسخه</span></div>
      <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,.8fr)_minmax(0,1fr)_minmax(0,.9fr)_64px_76px] gap-3 border-y border-[#2c3b3e] bg-[#1b272b] px-4 py-3 text-[11px] font-bold text-[#a8bcb7] xl:grid"><span>المشترك / المرسل</span><span>الحوالة / التاريخ</span><span>المبلغ</span><span>الاستلام</span><span>الحالة</span><span>الوصل</span><span>تعديل</span></div>
      {loading && records.length === 0 ? <div className="p-12 text-center text-sm text-[#9db1ad]">جارٍ تحميل الحوالات...</div> : error ? <div className="p-12 text-center text-sm text-[#9db1ad]">الحوالات غير متاحة حالياً.</div> : filteredTransfers.length === 0 ? <div className="p-12 text-center text-sm text-[#9db1ad]">لا توجد حوالات مطابقة.</div> : <div className="divide-y divide-[#29383b]">
        {filteredTransfers.slice(0, visibleTransfers).map((record) => {
          const f = record.fields || {};
          const receipt = f['صورة الوصل']?.[0] || null;
          const amount = f['المبلغ المودع (بعد العمولة)'] ?? f['المبلغ الأصلي (قبل العمولة)'];
          const transferNumber = String(f['رقم الحوالة'] || '');
          const sender = f['اسم المرسل'] && f['اسم المرسل'] !== f['اسم المشترك'] ? f['اسم المرسل'] : '';
          const receiptThumb = !isPdf(receipt) && (receipt?.thumbnails?.large?.url || receipt?.url);
          return <div key={record.id}>
            <div className="hidden min-h-20 grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,.8fr)_minmax(0,1fr)_minmax(0,.9fr)_64px_76px] items-center gap-3 px-4 py-3 text-xs xl:grid">
              <div className="min-w-0"><div className="truncate font-bold text-[#f3f8f5]">{f['اسم المشترك'] || 'بدون اسم'}</div><div className="mt-1 truncate text-[11px] text-[#93a9a4]">{sender ? `المرسل: ${sender}` : f['بريد الاكتروني'] || '—'}</div></div>
              <div className="min-w-0">{transferNumber ? <button type="button" onClick={() => void copyTransfer(transferNumber, record.id)} className="flex max-w-full items-center gap-1 truncate font-bold text-[#e1ede8]"><span className="truncate" dir="ltr">{transferNumber}</span>{copiedId === record.id ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" /> : <Copy className="h-3.5 w-3.5 shrink-0 text-[#89a39b]" />}</button> : <span>—</span>}<div className="mt-1 text-[11px] text-[#93a9a4]">{f['التاريخ'] || 'دون تاريخ'}</div></div>
              <strong className="whitespace-nowrap text-sm tabular-nums text-[#eef8f1]" dir="ltr">{amount == null ? '—' : `${money.format(Number(amount))} JOD`}</strong>
              <span className="truncate text-[#ccd9d3]">{f['المحفظة/الاستلام'] || 'غير محدد'}</span>
              <span className="max-w-fit rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-300">{f['الحالة'] || 'غير محددة'}</span>
              {receipt?.url ? <button type="button" onClick={() => openReceipt(receipt, `وصل حوالة: ${f['اسم المشترك'] || ''}`)} className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-[#3b504b] bg-[#263431]" aria-label="فتح الوصل">{receiptThumb ? <img src={receiptThumb} alt="" loading="lazy" className="h-full w-full object-contain" /> : <FileImage className="h-5 w-5 text-emerald-300" />}</button> : <span className="text-[#7b918c]">—</span>}
              <button type="button" onClick={() => onEditTransfer(record)} className="inline-flex min-h-9 items-center gap-1 text-xs font-bold text-emerald-300"><Pencil className="h-3.5 w-3.5" />تعديل</button>
            </div>
            <article className="p-3.5 xl:hidden"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-bold text-white">{f['اسم المشترك'] || 'بدون اسم'}</h3><p className="mt-1 truncate text-xs text-[#96aaa5]">{sender ? `المرسل: ${sender}` : f['بريد الاكتروني'] || 'دون مرسل'}</p></div><strong className="shrink-0 whitespace-nowrap text-sm tabular-nums text-[#e5f6eb]" dir="ltr">{amount == null ? '—' : `${money.format(Number(amount))} JOD`}</strong></div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#a9bdb6]"><span className="rounded-md bg-[#243337] px-2 py-1">{f['الحالة'] || 'غير محددة'}</span><span>{f['المحفظة/الاستلام'] || 'غير محدد'}</span><span>{f['التاريخ'] || 'دون تاريخ'}</span></div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#2b3b3d] pt-3">{transferNumber ? <button type="button" onClick={() => void copyTransfer(transferNumber, record.id)} className="flex min-w-0 items-center gap-1 text-xs text-[#c7dad0]"><Copy className="h-3.5 w-3.5 shrink-0" /><span className="truncate" dir="ltr">{copiedId === record.id ? 'تم النسخ' : transferNumber}</span></button> : <span className="text-xs text-[#8fa6a0]">دون رقم</span>}<div className="flex shrink-0 items-center gap-2">{receipt?.url && <button type="button" onClick={() => openReceipt(receipt, `وصل حوالة: ${f['اسم المشترك'] || ''}`)} className="flex min-h-10 items-center gap-1 rounded-lg border border-[#3a5148] px-2.5 text-xs text-emerald-300"><ImageIcon className="h-4 w-4" />الوصل</button>}<button type="button" onClick={() => onEditTransfer(record)} className="flex min-h-10 items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 text-xs font-bold text-emerald-300"><Pencil className="h-4 w-4" />تعديل</button></div></div>
            </article>
          </div>;
        })}
      </div>}
      {visibleTransfers < filteredTransfers.length && <div className="p-4 text-center"><button type="button" onClick={() => setVisibleTransfers((current) => current + 30)} className="min-h-10 rounded-lg border border-[#3b5048] px-4 text-xs font-bold text-[#c9dbd0]">عرض حوالات أقدم</button></div>}
    </div> : <div role="tabpanel" className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4"><div><h2 className="text-sm font-bold text-white">مدفوعات الشركة</h2><p className="mt-1 text-xs text-[#95aaa5]">الوصل، المبلغ والتاريخ في بطاقة واحدة · الأحدث أولاً</p></div><span className="text-xs text-[#93aaa3]">{error ? 'غير متاح' : `${filteredDeposits.length} عملية`}</span></div>
      <div className="flex flex-col gap-2 border-b border-[#2c3b3e] p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-4"><div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"><label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#33444a] bg-[#10181b] px-3 sm:min-w-56 sm:max-w-sm"><Search className="h-4 w-4 shrink-0 text-[#91a8a5]" /><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleTransfers(30); setVisibleDeposits(12); }} placeholder="ابحث بالمبلغ أو التاريخ" className="min-w-0 w-full bg-transparent text-sm text-white outline-none placeholder:text-[#788e8b]" /></label><div className="flex gap-1.5" aria-label="تصفية الوصولات">{([['all', 'الكل'], ['with', 'مع وصل'], ['without', 'بدون وصل']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={receiptFilter === value} onClick={() => { setReceiptFilter(value); setVisibleDeposits(12); }} className={`${chip} ${receiptFilter === value ? 'border-emerald-600 bg-emerald-500/15 text-emerald-300' : 'border-[#34433f] bg-[#1a2529] text-[#c4d4cf]'}`}>{label}</button>)}</div></div><button type="button" onClick={onNewDeposit} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 text-xs font-bold text-[#09251a] hover:bg-emerald-400"><Plus className="h-4 w-4" />تسجيل إيداع</button></div>
      {loading && deposits.length === 0 ? <div className="p-12 text-center text-sm text-[#9db1ad]">جارٍ تحميل الإيداعات...</div> : error ? <div className="p-12 text-center text-sm text-[#9db1ad]">الإيداعات غير متاحة حالياً.</div> : filteredDeposits.length === 0 ? <div className="p-12 text-center text-sm text-[#9db1ad]">لا توجد إيداعات مطابقة.</div> : <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">{filteredDeposits.slice(0, visibleDeposits).map((deposit) => {
        const receipt = deposit.receipt;
        const thumbnail = receipt && !isPdf(receipt) ? receipt.thumbnails?.large?.url || receipt.url : '';
        return <article key={deposit.id} className="min-w-0 overflow-hidden rounded-xl border border-[#334348] bg-[#1b272b]">
          {receipt?.url ? <button type="button" onClick={() => openReceipt(receipt, `وصل إيداع ${money.format(deposit.amount)} JOD`)} className="relative flex h-40 w-full items-center justify-center overflow-hidden border-b border-[#334348] bg-[#263338]" aria-label="فتح صورة الوصل">{thumbnail ? <img src={thumbnail} alt="معاينة وصل الإيداع" loading="lazy" className="h-full w-full object-contain" /> : <FileImage className="h-10 w-10 text-[#a4c5b5]" />}<span className="absolute bottom-2 right-2 rounded-md bg-[#101a1b]/90 px-2 py-1 text-[11px] font-bold text-[#d6efe0]">فتح الوصل</span></button> : <div className="flex h-40 flex-col items-center justify-center gap-2 border-b border-dashed border-[#3d5054] bg-[#202c30] text-xs text-[#91aaa4]"><ImageIcon className="h-7 w-7" />لا توجد صورة وصل</div>}
          <div className="p-3.5"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-bold text-white">إيداع الشركة</h3><p className="mt-1 flex items-center gap-1 text-xs text-[#9eb3ac]"><CalendarDays className="h-3.5 w-3.5" />{deposit.date || 'دون تاريخ'}</p></div><strong className="text-base font-bold tabular-nums text-[#f2f8f3]" dir="ltr">{money.format(deposit.amount)} JOD</strong></div><div className="mt-4 flex items-center justify-between gap-2 border-t border-[#344449] pt-3"><span className="text-[11px] text-emerald-300">{receipt ? 'وصل مرفق' : 'الوصل غير مرفق'}</span><button type="button" onClick={() => onEditDeposit(deposit)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#3b5149] px-2.5 text-xs font-bold text-[#d5e8dc]"><Pencil className="h-3.5 w-3.5" />{receipt ? 'تعديل البيانات' : 'تعديل / إضافة وصل'}</button></div></div>
        </article>;
      })}</div>}
      {visibleDeposits < filteredDeposits.length && <div className="p-4 text-center"><button type="button" onClick={() => setVisibleDeposits((current) => current + 12)} className="min-h-10 rounded-lg border border-[#3b5048] px-4 text-xs font-bold text-[#c9dbd0]">عرض إيداعات أقدم</button></div>}
    </div>}
  </section>;
}
