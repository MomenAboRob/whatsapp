'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpLeft, Check, CheckCheck, ChevronDown, Clock3, Database, ExternalLink,
  FileImage, Filter, ImagePlus, Link2, Loader2, Pencil, Plus, RefreshCw, Search,
  Send, Settings2, ShieldAlert, Unlink2, Users, WalletCards, X,
} from 'lucide-react';
import { toast } from '@/components/ui/floating-toast';
import type { InboxCard, InboxConfig, InboxManualCollection, InboxReceipt } from '@/lib/transfer-inbox';
import { isPendingInboxCard, summarizePendingInbox } from '@/lib/inbox-summary';

type Group = { id: string; name: string };
type Snapshot = {
  cards: InboxCard[];
  receipts: InboxReceipt[];
  manualCollections: InboxManualCollection[];
  groups: Group[];
  config: InboxConfig;
  configured: InboxConfig;
  connected: boolean;
};
type Tab = 'new' | 'review' | 'manual' | 'receipts' | 'received' | 'history' | 'uploaded' | 'not_mine' | 'duplicate';

const tabs: { id: Tab; label: string; icon: typeof Clock3 }[] = [
  { id: 'new', label: 'بانتظار الاستلام', icon: Clock3 },
  { id: 'review', label: 'تحتاج مراجعة', icon: ShieldAlert },
  { id: 'manual', label: 'استلام بلا بيانات', icon: WalletCards },
  { id: 'receipts', label: 'وصولات بلا بيانات', icon: FileImage },
  { id: 'received', label: 'استلمتها اليوم', icon: CheckCheck },
  { id: 'history', label: 'سجل الاستلام', icon: Check },
  { id: 'uploaded', label: 'تم رفعها', icon: Database },
  { id: 'not_mine', label: 'مش إلي', icon: ShieldAlert },
  { id: 'duplicate', label: 'المكررة', icon: Filter },
];

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const summaryNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
const day = new Intl.DateTimeFormat('ar-JO', { timeZone: 'Asia/Amman', year: 'numeric', month: 'numeric', day: 'numeric' });
const dateTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const formatDateTime = (value: number) => dateTime.format(value).replace(', ', ' · ');
function sameAmmanDay(value: number) { return day.format(value) === day.format(Date.now()); }
function nameTokens(value: string) { return value.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').split(/[^\p{L}]+/u).filter((token) => token.length > 2); }

export function TransferInbox({ onOpenMessage, active = true }: { onOpenMessage: (chatJid: string, chatName: string, messageId: string) => void; active?: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<Tab>('new');
  const tabTrailRef = useRef<Tab[]>([]);
  const lastTabRef = useRef<Tab>('new');
  const restoringTabRef = useRef(false);
  const [query, setQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(30);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState<InboxCard | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', amount: '', draftText: '' });
  const [linking, setLinking] = useState<InboxCard | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showIgnoredReceipts, setShowIgnoredReceipts] = useState(false);
  const [receiptNames, setReceiptNames] = useState<Record<string, string>>({});
  const [manualOpen, setManualOpen] = useState(false);
  const [manualEditing, setManualEditing] = useState<InboxManualCollection | null>(null);
  const [manualForm, setManualForm] = useState({ nameOnTransfer: '', reference: '', amount: '', currency: 'JOD', notes: '' });
  const [manualLinking, setManualLinking] = useState<InboxManualCollection | null>(null);
  const [linkSearch, setLinkSearch] = useState('');
  const [configForm, setConfigForm] = useState<InboxConfig>({ sourceGroupIds: [], receivedGroupId: '', uploadedGroupId: '' });
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsOpenRef = useRef(false);
  const lastRefreshAt = useRef(0);

  useEffect(() => { settingsOpenRef.current = settingsOpen; }, [settingsOpen]);

  useEffect(() => {
    if (tab === lastTabRef.current) return;
    if (!restoringTabRef.current) tabTrailRef.current.push(lastTabRef.current);
    restoringTabRef.current = false;
    lastTabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    if (!active) return;
    const onMobileBack = (event: Event) => {
      const back = event as CustomEvent<{ scope: string; handled: boolean }>;
      if (back.detail.scope !== 'inbox') return;
      if (preview) setPreview(null);
      else if (linking) setLinking(null);
      else if (manualLinking) setManualLinking(null);
      else if (manualOpen) setManualOpen(false);
      else if (editing) setEditing(null);
      else if (settingsOpen) setSettingsOpen(false);
      else if (tabTrailRef.current.length) {
        restoringTabRef.current = true;
        setTab(tabTrailRef.current.pop()!);
      } else return;
      back.detail.handled = true;
    };
    window.addEventListener('hawalat-mobile-back', onMobileBack);
    return () => window.removeEventListener('hawalat-mobile-back', onMobileBack);
  }, [active, preview, linking, manualLinking, manualOpen, editing, settingsOpen]);

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch('/api/transfers/inbox', { cache: 'no-store' });
      if (!response.ok) throw new Error('تعذر تحميل الوارد');
      const data = await response.json() as Snapshot;
      setSnapshot(data);
      lastRefreshAt.current = Date.now();
      setConfigForm((current) => settingsOpenRef.current ? current : data.config);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل الوارد');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => { void refresh(true); }, 0);
    return () => clearTimeout(timer);
  }, [active, refresh]);

  useEffect(() => {
    if (!active) return;
    const schedule = () => {
      if (document.hidden) return;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => { void refresh(); }, 350);
    };
    const events = new EventSource('/api/whatsapp/events');
    let live = false;
    events.onopen = () => { live = true; };
    events.onerror = () => { live = false; };
    for (const type of ['message', 'media', 'message_update', 'status', 'groups']) events.addEventListener(type, schedule);
    // مع الاتصال الحي تكفي مزامنة احتياطية كل دقيقة؛ عند انقطاعها نفحص كل 15 ثانية.
    const interval = setInterval(() => { if (!document.hidden && (!live || Date.now() - lastRefreshAt.current >= 60000)) schedule(); }, 15000);
    const visible = () => { if (!document.hidden) schedule(); };
    document.addEventListener('visibilitychange', visible);
    return () => {
      events.close(); clearInterval(interval); document.removeEventListener('visibilitychange', visible);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [active, refresh]);

  const act = async (action: string, payload: Record<string, unknown>, successText?: string) => {
    const key = `${action}:${payload.cardId || payload.receiptId || 'config'}`;
    if (busy) return false;
    setBusy(key);
    try {
      const response = await fetch('/api/transfers/inbox', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'لم ينجح الإجراء');
      if (successText) toast.success(successText);
      await refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'حدث خطأ');
      if (action === 'confirm_send' || action === 'retry_send') await refresh();
      return false;
    } finally { setBusy(''); }
  };

  const { cards, receipts, manualCollections, manualToday, pending, review, reviewReceipts, receivedToday, unmatched, ignoredReceipts, uploaded } = useMemo(() => {
    const cards = snapshot?.cards || [];
    const receipts = snapshot?.receipts || [];
    const manualCollections = snapshot?.manualCollections || [];
    return {
      cards, receipts, manualCollections,
      manualToday: manualCollections.filter((item) => !item.linkedCardId && sameAmmanDay(item.collectedAt)),
      pending: cards.filter(isPendingInboxCard),
      review: cards.filter((card) => card.status === 'received' && card.delivery === 'needs_review'),
      reviewReceipts: receipts.filter((receipt) => receipt.receivedPending && !receipt.ignored && receipt.linkedCardIds.length === 0),
      receivedToday: cards.filter((card) => card.status === 'received' && card.receivedAt && sameAmmanDay(card.receivedAt)),
      unmatched: receipts.filter((receipt) => !receipt.ignored && receipt.linkedCardIds.length === 0),
      ignoredReceipts: receipts.filter((receipt) => receipt.ignored),
      uploaded: cards.filter((card) => card.portalUploaded || card.airtableSaved),
    };
  }, [snapshot]);
  const pendingSummary = useMemo(() => summarizePendingInbox(cards, receipts), [cards, receipts]);
  const filteredCards = useMemo(() => {
    const list = tab === 'new' ? pending : tab === 'review' ? review : tab === 'received' ? receivedToday : tab === 'history' ? cards.filter((card) => card.status === 'received') : tab === 'uploaded' ? uploaded
      : tab === 'not_mine' ? cards.filter((card) => card.status === 'not_mine')
      : tab === 'duplicate' ? cards.filter((card) => card.status === 'duplicate') : [];
    const q = query.trim().toLowerCase();
    const visible = q ? list.filter((card) => [card.name, card.email, card.originalText, card.chatName, card.senderName]
      .some((value) => value.toLowerCase().includes(q))) : list;
    return [...visible].sort((a, b) => b.timestampMs - a.timestampMs);
  }, [cards, pending, review, receivedToday, uploaded, tab, query]);
  const filteredManual = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...manualCollections].sort((a, b) => Number(Boolean(a.linkedCardId)) - Number(Boolean(b.linkedCardId)) || b.collectedAt - a.collectedAt);
    return q ? list.filter((item) => [item.nameOnTransfer, item.reference, item.notes].some((value) => value.toLowerCase().includes(q))) : list;
  }, [manualCollections, query]);
  const filteredReceipts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = showIgnoredReceipts ? ignoredReceipts : unmatched;
    const matching = q ? visible.filter((receipt) => [receipt.senderName, receipt.chatName, receipt.caption, receipt.matchedName || '']
      .some((value) => value.toLowerCase().includes(q))) : visible;
    return [...matching].sort((a, b) => b.timestampMs - a.timestampMs);
  }, [unmatched, ignoredReceipts, showIgnoredReceipts, query]);
  const counts: Record<Tab, number> = {
    new: pending.length, review: review.length + reviewReceipts.length, manual: manualCollections.filter((item) => !item.linkedCardId).length,
    receipts: unmatched.length, received: receivedToday.length + manualToday.length,
    history: cards.filter((card) => card.status === 'received').length,
    uploaded: uploaded.length, not_mine: cards.filter((card) => card.status === 'not_mine').length,
    duplicate: cards.filter((card) => card.status === 'duplicate').length,
  };

  const startEdit = (card: InboxCard) => {
    setEditing(card);
    setEditForm({ name: card.name, email: card.email, amount: card.amount == null ? '' : String(card.amount), draftText: card.draftText });
  };
  const startManual = (item?: InboxManualCollection) => {
    setManualEditing(item || null);
    setManualForm(item ? { nameOnTransfer: item.nameOnTransfer, reference: item.reference, amount: item.amount == null ? '' : String(item.amount), currency: item.currency, notes: item.notes }
      : { nameOnTransfer: '', reference: '', amount: '', currency: 'JOD', notes: '' });
    setManualOpen(true);
  };
  const openSource = (chatJid: string, chatName: string, id: string) => onOpenMessage(chatJid, chatName, id);
  const selectedCard = linking ? snapshot?.cards.find((item) => item.id === linking.id) || linking : null;
  const suggestions = selectedCard ? receipts.filter((receipt) => !receipt.ignored && receipt.chatJid === selectedCard.chatJid
    && receipt.linkedCardIds.every((id) => cards.find((item) => item.id === id)?.sourceMessageId === selectedCard.sourceMessageId))
    .sort((a, b) => {
      const score = (r: InboxReceipt) =>
        (r.quotedMessageId === selectedCard.sourceMessageId || selectedCard.quotedMessageId === r.id ? 1000 : 0)
        + (r.matchedName && selectedCard.name.includes(r.matchedName) ? 100 : 0)
        + (r.ocrText ? nameTokens(selectedCard.name).filter((token) => nameTokens(r.ocrText || '').includes(token)).length * 25 : 0)
        + (r.senderName === selectedCard.senderName ? 20 : 0)
        - Math.abs(r.timestampMs - selectedCard.timestampMs) / (60 * 60 * 1000);
      return score(b) - score(a);
    }) : [];
  const manualCandidates = manualLinking ? cards.filter((card) => card.status !== 'duplicate' && card.status !== 'not_mine' && card.delivery !== 'sent' && card.delivery !== 'sending' && !card.manualCollectionId)
    .filter((card) => !linkSearch.trim() || [card.name, card.email, card.originalText, card.senderName].some((value) => value.toLowerCase().includes(linkSearch.trim().toLowerCase())))
    .sort((a, b) => {
      const score = (card: InboxCard) => nameTokens(manualLinking.nameOnTransfer).filter((token) => nameTokens(card.name).includes(token)).length * 30
        + (manualLinking.amount != null && card.amount === manualLinking.amount ? 15 : 0)
        + (card.status === 'received' ? -10 : 0);
      return score(b) - score(a) || b.timestampMs - a.timestampMs;
    }).slice(0, 50) : [];

  return (
    <div className="h-full overflow-y-auto bg-[#101617] text-[#f3f7f6] select-text" dir="rtl">
      <div className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-7 sm:pb-10 sm:pt-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-wide text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> مركز الحوالات المباشر
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">وارد الحوالات</h1>
            <p className="mt-1 text-sm leading-6 text-[#a8b7b4]">كل ما وصلك من قروبي ويسترن ووصلات، مع الوصولات وحالة الاستلام والرفع.</p>
          </div>
          <div className="flex gap-2">
            <span className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-bold ${snapshot?.connected ? 'border-emerald-800 bg-emerald-950/60 text-emerald-300' : 'border-amber-800 bg-amber-950/40 text-amber-300'}`}>
              <span className={`h-2 w-2 rounded-full ${snapshot?.connected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {snapshot?.connected ? 'واتساب متصل' : 'بانتظار اتصال واتساب'}
            </span>
            <button type="button" onClick={() => void refresh(true)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#2b3d3a] bg-[#1b2928] hover:bg-[#243936]" aria-label="تحديث">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={() => { setConfigForm(snapshot?.config || configForm); setSettingsOpen(true); }} className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#2b3d3a] bg-[#1b2928] hover:bg-[#243936]" aria-label="إعدادات الوارد">
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {!snapshot?.configured.receivedGroupId && !loading && (
          <button type="button" onClick={() => setSettingsOpen(true)} className="mb-5 flex w-full min-h-12 items-center gap-2 rounded-xl border border-amber-700/40 bg-amber-950/30 px-4 text-right text-sm text-amber-200">
            <ShieldAlert className="h-4 w-4 shrink-0" /> اختر قروبي المصدر وقروب تم الاستلام من الإعدادات قبل الإرسال.
          </button>
        )}

        {snapshot && <section aria-label="ملخص مبالغ الحوالات بانتظار الاستلام" className="mb-5">
          <h2 className="mb-2 text-sm font-extrabold text-[#dcebe4]">مبالغ الحوالات اللي لسه ما استلمتها</h2>
          <p className="mb-3 text-xs text-[#9fb3a9]">الحسبة من قائمة «بانتظار الاستلام»، وكل عملة إلها مجموعها.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              { label: 'كلهم سوا', data: pendingSummary.all, color: 'text-emerald-200' },
              { label: 'مع صورة وصل', data: pendingSummary.withReceipt, color: 'text-sky-200' },
              { label: 'بدون صورة وصل', data: pendingSummary.withoutReceipt, color: 'text-amber-200' },
            ] as const).map(({ label, data, color }) => <div key={label} className="rounded-2xl border border-[#334840] bg-[#192522] p-4">
              <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#afc4b8]"><span>{label}</span><span className="tabular-nums">{data.count} حوالة</span></div>
              <div className={`mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xl font-black tabular-nums ${color}`} dir="ltr">
                {data.amounts.length ? data.amounts.map(({ currency, amount }) => <span key={currency}>{summaryNumber.format(amount)} {currency}</span>) : <span>{data.count ? 'المبلغ غير معروف' : '0 JOD'}</span>}
              </div>
              {data.unknownAmountCount > 0 && <p className="mt-2 text-[11px] text-[#aebfb6]">{data.unknownAmountCount} حوالة مبلغها غير معروف ولا تدخل في المجموع</p>}
            </div>)}
          </div>
        </section>}

        <div className="-mx-4 mb-4 border-b border-[#283734] bg-[#101617]/95 px-4 pb-3 pt-3 sm:sticky sm:top-0 sm:z-10 sm:mx-0 sm:px-0 sm:backdrop-blur-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold text-[#a7bbb4]">متابعة الحوالات</span><button type="button" onClick={() => startManual()} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-400 px-3 text-xs font-bold text-[#082019] hover:bg-emerald-300"><Plus className="h-4 w-4" />استلام بلا بيانات</button></div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="tablist" aria-label="أقسام وارد الحوالات">
            {tabs.filter((item) => ['new', 'review', 'receipts', 'received'].includes(item.id)).map((item) => {
              const Icon = item.icon;
              return <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => { setTab(item.id); setVisibleLimit(30); }}
                className={`flex min-h-11 min-w-0 items-center justify-between gap-1.5 rounded-xl border px-2.5 text-[11px] font-bold transition sm:px-3 sm:text-xs ${tab === item.id ? 'border-emerald-400/60 bg-[#1c3b31] text-emerald-100' : 'border-[#33433e] bg-[#1a2528] text-[#c4d2ca] hover:bg-[#22342d]'}`}>
                <Icon className={`hidden h-4 w-4 shrink-0 sm:block ${tab === item.id ? 'text-emerald-300' : 'text-[#809b8e]'}`} /><span className="min-w-0 text-right leading-4">{item.label}</span><span className={`min-w-6 shrink-0 rounded-md px-1.5 py-0.5 text-center tabular-nums ${tab === item.id ? 'bg-emerald-400/20 text-emerald-200' : 'bg-[#2b3c35] text-[#bfd0c4]'}`}>{counts[item.id]}</span>
              </button>;
            })}
            <label className={`col-span-2 flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-bold sm:col-span-1 ${['manual', 'history', 'uploaded', 'not_mine', 'duplicate'].includes(tab) ? 'border-emerald-400/60 bg-[#1c3b31] text-emerald-100' : 'border-[#33433e] bg-[#1a2528] text-[#c4d2ca]'}`}>
              <span className="shrink-0">سجلات أخرى</span>
              <select value={['manual', 'history', 'uploaded', 'not_mine', 'duplicate'].includes(tab) ? tab : ''} onChange={(event) => { if (event.target.value) { setTab(event.target.value as Tab); setVisibleLimit(30); } }} className="min-w-0 flex-1 bg-transparent text-xs text-inherit outline-none" aria-label="سجلات أخرى">
                <option value="">اختر القسم</option>
                {tabs.filter((item) => ['manual', 'history', 'uploaded', 'not_mine', 'duplicate'].includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.label} ({counts[item.id]})</option>)}
              </select>
            </label>
          </div>
          <label className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-[#31433e] bg-[#1a2524] px-3 text-[#91a6a0] focus-within:border-emerald-500">
            <Search className="h-4 w-4 shrink-0" />
            <input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleLimit(30); }} placeholder="ابحث بالاسم، الإيميل، المرسل أو النص" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#83958f]" />
          </label>
          {tab === 'receipts' && <button type="button" onClick={() => setShowIgnoredReceipts((value) => !value)} className="mt-2 min-h-10 rounded-lg px-3 text-xs font-bold text-amber-200 hover:bg-amber-950/30">{showIgnoredReceipts ? 'عرض الوصولات المنتظرة' : `عرض الصور المخفية (${ignoredReceipts.length})`}</button>}
        </div>

        {loading && !snapshot ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-[#a9bbb6]"><Loader2 className="h-5 w-5 animate-spin" /> جاري تحميل الحوالات...</div> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {tab === 'review' && reviewReceipts.filter((receipt) => !query.trim() || [receipt.matchedName || '', receipt.senderName, receipt.chatName, receipt.caption].some((value) => value.toLowerCase().includes(query.trim().toLowerCase()))).map((receipt) => <article key={receipt.id} className="rounded-2xl border border-[#334348] bg-[#182226] p-4 sm:p-5"><span className="rounded-lg bg-amber-400/15 px-2 py-1 text-xs font-bold text-amber-200">وصل مستلم بلا بيانات</span><h2 className="mt-3 text-lg font-extrabold">{receipt.matchedName || 'اسم صاحب الوصل غير معروف'}</h2><p className="mt-1 text-xs text-[#b6bda9]">القروب: {receipt.chatName} · المرسل: {receipt.senderName} · <time dir="ltr">{formatDateTime(receipt.timestampMs)}</time></p><button type="button" onClick={() => setPreview(receipt.mediaUrl)} className="mt-4 h-32 w-full overflow-hidden rounded-xl border border-amber-400/20 bg-[#151b18]"><img src={receipt.mediaUrl} alt="الوصل المستلم" className="h-full w-full object-contain" loading="lazy" /></button><p className="mt-3 text-xs leading-5 text-amber-100">المبلغ مستلم. الصورة محفوظة ولن تُرسل للقروب حتى تربطها ببيانات المتدرب.</p><div className="mt-4 flex flex-wrap gap-2"><Action onClick={() => { setTab('receipts'); setQuery(receipt.matchedName || receipt.senderName); }} icon={FileImage} label="افتح الوصل" /><Action onClick={() => openSource(receipt.chatJid || receipt.chatName, receipt.chatName, receipt.id)} icon={ExternalLink} label="رسالة الوصل" /></div></article>)}
            {tab === 'received' && filteredManual.filter((item) => !item.linkedCardId && sameAmmanDay(item.collectedAt)).map((item) => <article key={item.id} className="rounded-2xl border border-[#334348] bg-[#182226] p-4 sm:p-5"><span className="rounded-lg bg-violet-400/15 px-2 py-1 text-xs font-bold text-violet-200">استلام بلا بيانات</span><h2 className="mt-3 text-lg font-extrabold">{item.nameOnTransfer || item.reference}</h2><p className="mt-1 text-xs text-[#a7bab1]">{formatDateTime(item.collectedAt)}{item.amount != null ? ` · ${number.format(item.amount)} ${item.currency}` : ''}</p>{item.notes && <p className="mt-3 text-sm text-[#c1d0c9]">{item.notes}</p>}<div className="mt-4 flex flex-wrap gap-2"><Action onClick={() => { setManualLinking(item); setLinkSearch(''); }} icon={Link2} label="ربط بالبيانات" primary /><Action onClick={() => { setTab('manual'); setQuery(''); }} icon={ArrowUpLeft} label="سجل الاستلام" /></div></article>)}
            {tab === 'manual' ? filteredManual.slice(0, visibleLimit).map((item) => {
              const linked = cards.find((card) => card.id === item.linkedCardId);
              return <article key={item.id} className="rounded-2xl border border-[#334348] bg-[#182226] p-4 shadow-lg shadow-black/10 sm:p-5">
                <div className="flex items-start justify-between gap-3"><div><span className="text-[11px] font-bold text-violet-300">استلام سُجّل يدويًا</span><h2 className="mt-1 text-lg font-extrabold">{item.nameOnTransfer || 'اسم غير معروف'}</h2><p className="mt-1 text-xs text-[#a7bab1]">{formatDateTime(item.collectedAt)}</p></div><span className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${linked ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-400/15 text-amber-200'}`}>{linked ? 'مربوط ببيانات' : 'ينتظر البيانات'}</span></div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">{item.amount != null && <span className="rounded-lg bg-[#2d3738] px-3 py-1.5 font-bold">{number.format(item.amount)} {item.currency}</span>}{item.reference && <span className="rounded-lg bg-[#2d3738] px-3 py-1.5">رقم الحوالة: {item.reference}</span>}</div>
                {item.notes && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-[#121d1d] p-3 text-sm leading-6 text-[#c1d0c9]">{item.notes}</p>}
                {linked && <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs text-emerald-100">مربوط بـ <strong>{linked.name || 'بطاقة تحتاج إكمال'}</strong> · {linked.delivery === 'sent' ? 'أُرسل لقروب تم الاستلام' : 'بانتظار مراجعة البطاقة وإرسالها'}</div>}
                <div className="mt-4 flex flex-wrap gap-2">{!linked && <Action onClick={() => { setManualLinking(item); setLinkSearch(''); }} icon={Link2} label="ربط ببيانات المتدرب" primary />}{!linked && <Action onClick={() => startManual(item)} icon={Pencil} label="تعديل السجل" />}{linked && linked.delivery !== 'sent' && linked.delivery !== 'sending' && <Action onClick={() => void act('unlink_manual', { manualId: item.id }, 'فُصل سجل الاستلام عن الحوالة')} icon={Unlink2} label="فك الربط" />}{linked && <Action onClick={() => { setTab('review'); setQuery(linked.name || linked.email); }} icon={ArrowUpLeft} label="افتح البطاقة" />}</div>
              </article>;
            }) : tab === 'receipts' ? filteredReceipts.slice(0, visibleLimit).map((receipt) => (
              <article key={receipt.id} className="rounded-2xl border border-[#334348] bg-[#182226] p-4 shadow-lg shadow-black/10">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div><div className="font-bold">وصل بانتظار البيانات</div><div className="mt-1 text-xs text-[#9db2ab]">القروب: {receipt.chatName} · المرسل: {receipt.senderName} · <time dir="ltr">{formatDateTime(receipt.timestampMs)}</time></div></div>
                  {receipt.receivedPending && <span className="rounded-lg bg-sky-900/50 px-2 py-1 text-xs text-sky-200">تم استلام المبلغ</span>}
                  {receipt.ignored && <span className="rounded-lg bg-rose-900/50 px-2 py-1 text-xs text-rose-200">صورة مخفية</span>}
                </div>
                <button type="button" onClick={() => setPreview(receipt.mediaUrl)} className="mb-3 block h-44 w-full overflow-hidden rounded-xl border border-[#344a43] bg-[#0d1715]">
                  <img src={receipt.mediaUrl} alt="صورة الوصل" loading="lazy" className="h-full w-full object-contain" />
                </button>
                {receipt.caption && <p className="mb-3 text-sm text-[#d4dfdc]">{receipt.caption}</p>}
                {receipt.ocrText && <details className="mb-3 rounded-lg border border-[#344a43] px-3 py-2 text-xs text-[#b8c9c0]"><summary className="cursor-pointer font-bold text-emerald-200">النص المقروء من الصورة · راجعه قبل الربط</summary><pre className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap font-sans leading-5">{receipt.ocrText}</pre></details>}
                {receipt.ocrError && <p className="mb-3 text-xs text-rose-200">تعذرت قراءة الصورة: {receipt.ocrError}</p>}
                {!receipt.ignored && <div className="mb-3 flex gap-2"><input value={receiptNames[receipt.id] ?? receipt.matchedName ?? ''} onChange={(event) => setReceiptNames((current) => ({ ...current, [receipt.id]: event.target.value }))} placeholder="اسم ظاهر على الوصل (اختياري)" className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#3a5046] bg-[#0f1a17] px-3 text-sm text-white outline-none focus:border-emerald-500" /><Action onClick={() => void act('receipt_name', { receiptId: receipt.id, name: receiptNames[receipt.id] ?? receipt.matchedName ?? '' }, 'حُفظ اسم الوصل')} icon={Check} label="حفظ" /></div>}
                <div className="flex flex-wrap gap-2 border-t border-[#304046] pt-3">
                  {!receipt.receivedPending && !receipt.ignored && <Action onClick={() => void act('receive_receipt', { receiptId: receipt.id }, 'سُجل استلام الوصل، وسيبقى بانتظار البيانات')} icon={Check} label="تم الاستلام" primary />}
                  {!receipt.ignored && <Action onClick={() => void act('read_receipt', { receiptId: receipt.id }, 'قُرئ نص الصورة؛ راجع الاسم المستخرج')} icon={FileImage} label={busy === `read_receipt:${receipt.id}` ? 'جارٍ القراءة...' : receipt.ocrText ? 'إعادة قراءة الوصل' : 'قراءة الوصل'} disabled={Boolean(busy)} />}
                </div>
                <details className="group mt-2 rounded-xl border border-[#37494a] bg-[#121c20]">
                  <summary className="flex min-h-11 list-none items-center justify-between gap-2 px-3 text-xs font-bold text-[#cbded4]">خيارات الوصل <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
                  <div className="grid grid-cols-2 gap-2 border-t border-[#304046] p-2">
                    <Action onClick={() => openSource(receipt.chatJid || receipt.chatName, receipt.chatName, receipt.id)} icon={ExternalLink} label="رسالة الوصل" />
                    {!receipt.ignored && <Action onClick={() => { setTab('new'); setQuery(''); }} icon={Link2} label="ابحث عن بياناته" />}
                    <Action onClick={() => void act(receipt.ignored ? 'restore_receipt' : 'ignore_receipt', { receiptId: receipt.id }, receipt.ignored ? 'أُعيدت الصورة للوصولات' : 'أُخفيت الصورة')} icon={receipt.ignored ? RefreshCw : X} label={receipt.ignored ? 'إرجاع الصورة' : 'ليست وصلًا'} />
                  </div>
                </details>
              </article>
            )) : filteredCards.slice(0, visibleLimit).map((card) => {
              const receipt = receipts.find((item) => item.id === card.receiptMessageId);
              const previewUrl = receipt?.mediaUrl || card.embeddedMediaUrl;
              const statusLabel = card.status === 'received' ? 'تم الاستلام'
                : card.status === 'duplicate' ? 'مكررة'
                : card.status === 'not_mine' ? 'مش إلي'
                : card.portalUploaded && card.airtableSaved ? 'مسجلة'
                : card.portalUploaded ? 'مرفوعة'
                : card.airtableSaved ? 'في أيرتيبل'
                : card.status === 'review' ? 'للمراجعة' : 'جديدة';
              return <article key={card.id} className="rounded-2xl border border-[#334348] bg-[#182226] p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-extrabold leading-7">{card.name || 'بيانات تحتاج مراجعة'}</h2>{card.partCount > 1 && <span className="rounded-md bg-violet-500/20 px-2 py-0.5 text-[11px] text-violet-200"><Users className="ml-1 inline h-3 w-3" />{card.partIndex + 1} من {card.partCount}</span>}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[#a6b7b1]"><span>القروب: {card.chatName}</span><span aria-hidden="true">·</span><span>المرسل: {card.senderName}</span><span aria-hidden="true">·</span><time dir="ltr">{formatDateTime(card.timestampMs)}</time></div>
                  </div>
                  <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${card.status === 'received' ? 'bg-sky-500/15 text-sky-200' : card.status === 'duplicate' ? 'bg-rose-500/15 text-rose-200' : card.portalUploaded || card.airtableSaved ? 'bg-violet-500/15 text-violet-200' : card.status === 'review' ? 'bg-amber-500/15 text-amber-200' : 'bg-emerald-500/15 text-emerald-200'}`}>
                    {statusLabel}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  {card.email && <span dir="ltr" className="max-w-full truncate rounded-lg bg-[#263633] px-2.5 py-1.5 text-emerald-200">{card.email}</span>}
                  {card.amount != null && <span className="rounded-lg bg-[#263633] px-2.5 py-1.5 font-bold">{number.format(card.amount)} {card.currency}</span>}
                </div>
                <p className="mt-4 line-clamp-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#cad9d3]">{card.originalText}</p>
                <details className="group mt-2 rounded-xl border border-[#334842] bg-[#121d1b] px-3 py-2">
                  <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between text-xs font-bold text-[#c7d7d1]">عرض النص الكامل <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words border-t border-[#2b4038] pt-3 font-sans text-sm leading-7 text-[#e2ece7]">{card.originalText}</pre>
                </details>
                {previewUrl && <button type="button" onClick={() => setPreview(previewUrl)} className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-xl border border-[#3c514a] bg-[#202f30] p-2 text-right text-xs text-emerald-200"><img src={previewUrl} alt="الوصل المرتبط" loading="lazy" className="h-10 w-10 rounded-md object-cover" /><span>معاينة الوصل المرتبط</span></button>}
                {card.manualCollectionId && (() => { const manual = manualCollections.find((item) => item.id === card.manualCollectionId); return <div className="mt-3 rounded-lg border border-violet-400/20 bg-violet-400/5 px-3 py-2 text-xs leading-5 text-violet-200">استلام يدوي سابق · الاسم على الحوالة: <strong>{manual?.nameOnTransfer || 'غير معروف'}</strong>{manual?.reference && <span> · رقمها: {manual.reference}</span>}{manual?.amount != null && <span> · {number.format(manual.amount)} {manual.currency}</span>}{manual?.notes && <div className="mt-1 text-[#c9badf]">{manual.notes}</div>}</div>; })()}
                {card.delivery !== 'idle' && <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${card.delivery === 'sent' ? 'bg-emerald-900/25 text-emerald-200' : card.delivery === 'failed' ? 'bg-rose-900/25 text-rose-200' : 'bg-amber-900/25 text-amber-200'}`}>
                  {card.delivery === 'sent' ? 'أُرسلت إلى قروب تم الاستلام' : card.delivery === 'failed' ? `لم تُرسل بعد: ${card.deliveryError || 'خطأ اتصال'}` : card.delivery === 'needs_review' ? (!card.name || !card.email ? 'استُلم المبلغ. أكملي الاسم والإيميل، ثم راجعي النص وأكدي الإرسال.' : !snapshot?.configured.receivedGroupId ? 'استُلم المبلغ. حددي قروب تم الاستلام ثم أكدي الإرسال.' : 'البيانات محفوظة، لكن الحوالة لم تُرسل بعد. راجعي النص واضغطي «تأكيد وإرسال».') : card.delivery === 'sending' ? 'جاري الإرسال...' : 'بانتظار الإرسال'}
                </div>}
                {card.receiptFollowup && card.receiptFollowup !== 'sent' && <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${card.receiptFollowup === 'failed' ? 'bg-rose-900/25 text-rose-200' : 'bg-amber-900/25 text-amber-200'}`}>
                  {card.receiptFollowup === 'failed' ? `صورة الوصل لم تُرسل: ${card.deliveryError || 'راجع القروب ثم أعد المحاولة'}` : card.receiptFollowup === 'sending' ? 'جاري إرسال صورة الوصل...' : 'صورة الوصل بانتظار الإرسال'}
                </div>}
                {card.receiptFollowup === 'sent' && <div className="mt-2 rounded-lg bg-emerald-900/25 px-3 py-2 text-xs text-emerald-200">أُرسلت صورة الوصل مرتبطة بهذه الحوالة</div>}
                <div className="mt-4 flex flex-col gap-2 border-t border-[#304046] pt-3">
                  <div className="flex flex-wrap gap-2">
                    {(card.status === 'new' || card.status === 'review') && <Action onClick={() => void act('receive_card', { cardId: card.id }, 'تم تسجيل استلام المبلغ')} icon={Check} label="تم الاستلام" primary />}
                    {card.delivery === 'needs_review' && <Action onClick={() => void act('confirm_send', { cardId: card.id }, 'تم تأكيد النص وإرساله')} icon={Send} label="تأكيد وإرسال" primary disabled={!card.name || !card.email || !snapshot?.configured.receivedGroupId} />}
                    {card.delivery === 'failed' && <Action onClick={() => void act('retry_send', { cardId: card.id }, 'تمت إعادة المحاولة')} icon={RefreshCw} label="إعادة الإرسال" primary />}
                    {card.receiptFollowup === 'failed' && <Action onClick={() => void act('retry_receipt', { cardId: card.id }, 'تمت إعادة محاولة إرسال الوصل')} icon={RefreshCw} label="إعادة إرسال الوصل" />}
                    {(card.status === 'new' || card.status === 'review' || card.delivery === 'needs_review') && <Action onClick={() => startEdit(card)} icon={Pencil} label={card.delivery === 'needs_review' ? 'راجع النص' : 'تعديل البيانات'} />}
                  </div>
                  <details className="group rounded-xl border border-[#37494a] bg-[#121c20]">
                    <summary className="flex min-h-11 list-none items-center justify-between gap-2 px-3 text-xs font-bold text-[#cbded4] marker:content-none">
                      <span>خيارات أخرى <span className="font-normal text-[#91aaa1]">· الوصل والرسائل</span></span>
                      <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="grid grid-cols-2 gap-2 border-t border-[#304046] p-2 sm:grid-cols-3">
                      {!card.receiptMessageId && card.status !== 'duplicate' && <Action onClick={() => setLinking(card)} icon={ImagePlus} label="ربط وصل" />}
                      {receipt && <Action onClick={() => void act('unlink', { cardId: card.id }, 'تم فك الوصل')} icon={Unlink2} label="فك الوصل" />}
                      <Action onClick={() => openSource(card.chatJid || card.chatName, card.chatName, card.sourceMessageId)} icon={ArrowUpLeft} label="الرسالة الأصلية" />
                      {receipt && <Action onClick={() => openSource(receipt.chatJid || receipt.chatName, receipt.chatName, receipt.id)} icon={ExternalLink} label="رسالة الوصل" />}
                      {(card.status === 'new' || card.status === 'review') && <Action onClick={() => void act('not_mine', { cardId: card.id }, 'نُقلت إلى مش إلي')} icon={X} label="ليست حوالتي" />}
                      {card.status === 'not_mine' && <Action onClick={() => void act('restore', { cardId: card.id }, 'عادت إلى الوارد')} icon={RefreshCw} label="إرجاع إلى الوارد" />}
                      {card.status === 'duplicate' && <Action onClick={() => void act('show_duplicate', { cardId: card.id }, 'أُظهرت كحوالة جديدة')} icon={Check} label="إظهار كجديدة" />}
                    </div>
                  </details>
                </div>
              </article>;
            })}
            {((tab === 'receipts' && !filteredReceipts.length) || (tab === 'manual' && !filteredManual.length) || (tab === 'review' && !filteredCards.length && !reviewReceipts.some((receipt) => !query.trim() || [receipt.matchedName || '', receipt.senderName, receipt.chatName, receipt.caption].some((value) => value.toLowerCase().includes(query.trim().toLowerCase())))) || (tab === 'received' && !filteredCards.length && !filteredManual.some((item) => !item.linkedCardId && sameAmmanDay(item.collectedAt))) || (tab !== 'receipts' && tab !== 'manual' && tab !== 'review' && tab !== 'received' && !filteredCards.length)) && <div className="col-span-full flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-[#33453f] bg-[#182321] px-4 text-center"><CheckCheck className="mb-3 h-8 w-8 text-emerald-400" /><div className="font-bold">ما في عناصر هون حاليًا</div><p className="mt-1 text-xs text-[#9bad9f]">{tab === 'review' ? 'كل الحوالات المستلمة مكتملة أو أُرسلت.' : tab === 'manual' ? 'سجّل أي حوالة استلمتها قبل وصول بيانات صاحبها.' : 'الرسائل الجديدة رح تظهر تلقائيًا أول ما توصل.'}</p></div>}
            {(tab === 'receipts' ? filteredReceipts.length : tab === 'manual' ? filteredManual.length : filteredCards.length) > visibleLimit && <button type="button" onClick={() => setVisibleLimit((current) => current + 30)} className="col-span-full min-h-12 rounded-xl border border-[#365047] bg-[#22352e] text-sm font-bold text-emerald-200">عرض 30 عنصرًا إضافيًا</button>}
          </div>
        )}
      </div>

      {linking && selectedCard && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setLinking(null); }}>
        <div className="max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-[#375047] bg-[#172320] p-5 shadow-2xl sm:rounded-3xl">
          <ModalHead title={`شبك وصل مع ${selectedCard.name}`} onClose={() => setLinking(null)} />
          <p className="mb-4 text-sm leading-6 text-[#a9bdb3]">اختر الوصل من نفس القروب. لن يتم الربط إلا بعد ضغط «تأكيد الربط». إذا الرسالة فيها أكثر من متدرب، ينشبك الوصل مع بطاقاتهم كلهم.</p>
          <div className="space-y-3">{suggestions.map((receipt) => <div key={receipt.id} className="rounded-xl border border-[#375047] bg-[#1f302a] p-3">
            <div className="flex gap-3"><img src={receipt.mediaUrl} alt="وصل مقترح" className="h-20 w-20 rounded-lg object-cover" loading="lazy" /><div className="min-w-0 flex-1 text-xs text-[#b8c9c0]"><div className="font-bold text-white">{receipt.senderName}</div><div className="mt-1">{formatDateTime(receipt.timestampMs)}</div>{receipt.matchedName && <div className="mt-1">اسم الوصل: {receipt.matchedName}</div>}{receipt.receivedPending && <div className="mt-1 text-sky-200">المبلغ مستلم وينتظر الربط</div>}</div></div>
            <div className="mt-3 flex gap-2"><Action onClick={async () => { if (await act('link', { cardId: selectedCard.id, receiptId: receipt.id }, 'تم شبك الوصل')) setLinking(null); }} icon={Link2} label="تأكيد الربط" primary /><Action onClick={() => setPreview(receipt.mediaUrl)} icon={FileImage} label="تكبير" /></div>
          </div>)}</div>
          {!suggestions.length && <p className="rounded-xl border border-dashed border-[#375047] p-6 text-center text-sm text-[#a9bdb3]">ما في وصولات مستقلة من هذا القروب حاليًا.</p>}
        </div>
      </div>}

      {manualOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setManualOpen(false); }}>
        <form onSubmit={async (event) => { event.preventDefault(); if (await act(manualEditing ? 'edit_manual' : 'create_manual', { ...manualForm, manualId: manualEditing?.id }, 'حُفظ الاستلام بانتظار بيانات صاحب الحوالة')) { setManualOpen(false); setTab('manual'); setQuery(''); } }} className="max-h-[91dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-[#43514e] bg-[#192522] p-5 shadow-2xl sm:rounded-3xl">
          <ModalHead title={manualEditing ? 'تعديل استلام بلا بيانات' : 'تسجيل استلام بلا بيانات'} onClose={() => setManualOpen(false)} />
          <p className="mb-5 rounded-xl border border-violet-400/20 bg-violet-400/5 p-3 text-sm leading-6 text-violet-100">احفظ المعلومات التي معك الآن. لما توصل بيانات المتدرب، اربطها يدويًا وراجعها قبل إرسالها لقروب تم الاستلام.</p>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="الاسم المكتوب على الحوالة" value={manualForm.nameOnTransfer} onChange={(value) => setManualForm({ ...manualForm, nameOnTransfer: value })} /><Field label="رقم الحوالة أو المرجع" value={manualForm.reference} onChange={(value) => setManualForm({ ...manualForm, reference: value })} /><Field label="المبلغ المستلم" value={manualForm.amount} onChange={(value) => setManualForm({ ...manualForm, amount: value })} type="number" /><label className="block text-xs font-bold text-[#c2d1ca]">العملة<select value={manualForm.currency} onChange={(event) => setManualForm({ ...manualForm, currency: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-[#3a5046] bg-[#0f1a17] px-3 text-sm text-white outline-none focus:border-emerald-500"><option value="JOD">دينار أردني JOD</option><option value="USD">دولار USD</option><option value="ILS">شيكل ILS</option><option value="EUR">يورو EUR</option><option value="SAR">ريال SAR</option><option value="AED">درهم AED</option></select></label></div>
          <label className="mt-4 block text-xs font-bold text-[#c2d1ca]">ملاحظات تساعدك تتذكر صاحبها<textarea value={manualForm.notes} onChange={(event) => setManualForm({ ...manualForm, notes: event.target.value })} rows={3} className="mt-2 w-full rounded-xl border border-[#3a5046] bg-[#0f1a17] p-3 text-sm leading-6 text-white outline-none focus:border-emerald-500" /></label>
          <p className="mt-3 text-xs text-[#95a99e]">اكتب الاسم أو رقم الحوالة على الأقل. هذا السجل لا يُرسل للقروب قبل ربطه ببيانات مكتملة.</p>
          <button type="submit" disabled={Boolean(busy)} className="mt-5 min-h-12 w-full rounded-xl bg-emerald-400 px-4 font-bold text-[#082019] hover:bg-emerald-300 disabled:opacity-50">حفظ الاستلام</button>
        </form>
      </div>}

      {manualLinking && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setManualLinking(null); }}>
        <div className="max-h-[91dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-[#43514e] bg-[#192522] p-5 shadow-2xl sm:rounded-3xl">
          <ModalHead title="ربط الاستلام ببيانات المتدرب" onClose={() => setManualLinking(null)} />
          <p className="mb-3 text-sm leading-6 text-[#bfd0c6]">استلام باسم <strong className="text-white">{manualLinking.nameOnTransfer || manualLinking.reference}</strong>. ممكن يكون اسم المتدرب مختلفًا؛ تأكد من المصدر والمبلغ قبل الربط.</p>
          <label className="mb-4 flex min-h-11 items-center gap-2 rounded-xl border border-[#3a5046] bg-[#0f1a17] px-3"><Search className="h-4 w-4 text-[#8ca398]" /><input value={linkSearch} onChange={(event) => setLinkSearch(event.target.value)} placeholder="ابحث باسم المتدرب أو الإيميل أو نص الرسالة" className="w-full bg-transparent text-sm text-white outline-none" /></label>
          <div className="space-y-2">{manualCandidates.map((card) => <div key={card.id} className="rounded-xl border border-[#384d43] bg-[#20302a] p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-bold">{card.name || 'بيانات ناقصة'}</div><div dir="ltr" className="mt-1 text-xs text-emerald-200">{card.email || 'بلا إيميل'}</div><div className="mt-1 text-xs text-[#a8bdb1]">{card.chatName} · {card.senderName}</div></div><span className="shrink-0 text-xs font-bold text-white">{card.amount == null ? 'المبلغ غير معروف' : `${number.format(card.amount)} ${card.currency}`}</span></div><button type="button" disabled={Boolean(busy)} onClick={async () => { if (await act('link_manual', { manualId: manualLinking.id, cardId: card.id }, 'تم الربط. راجع البطاقة قبل إرسالها.')) { setManualLinking(null); setTab('review'); setQuery(''); } }} className="mt-3 min-h-10 w-full rounded-lg bg-emerald-400 px-3 text-xs font-extrabold text-[#082019] disabled:opacity-50">تأكيد الربط بهذه البطاقة</button></div>)}{!manualCandidates.length && <p className="rounded-xl border border-dashed border-[#496056] p-6 text-center text-sm text-[#b8c9be]">لا توجد بطاقة مطابقة الآن. سيبقى الاستلام محفوظًا ويمكنك الربط لما تصل البيانات.</p>}</div>
        </div>
      </div>}

      {editing && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
        <form onSubmit={async (event) => { event.preventDefault(); if (await act('edit', { cardId: editing.id, ...editForm }, editing.delivery === 'needs_review' ? 'حُفظ التعديل. اضغطي «تأكيد وإرسال» لإرساله للقروب.' : 'تم حفظ نسخة الحوالة')) setEditing(null); }} className="max-h-[91dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-[#375047] bg-[#172320] p-5 shadow-2xl sm:rounded-3xl">
          <ModalHead title="مراجعة نسخة الحوالة" onClose={() => setEditing(null)} />
          <p className="mb-4 text-xs leading-5 text-[#a9bdb3]">التعديل هنا يغيّر نسخة الحوالة التي ستُرسل. رسالة واتساب الأصلية تبقى كما هي.</p>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="اسم المتدرب" value={editForm.name} onChange={(value) => setEditForm({ ...editForm, name: value })} /><Field label="الإيميل" value={editForm.email} onChange={(value) => setEditForm({ ...editForm, email: value })} type="email" /><Field label="مبلغ هذا المتدرب" value={editForm.amount} onChange={(value) => setEditForm({ ...editForm, amount: value })} type="number" /></div>
          <label className="mt-4 block text-xs font-bold text-[#c2d1ca]">النص الذي سيُرسل لقروب تم الاستلام<textarea value={editForm.draftText} onChange={(event) => setEditForm({ ...editForm, draftText: event.target.value })} rows={10} className="mt-2 w-full rounded-xl border border-[#3a5046] bg-[#0f1a17] p-3 text-sm leading-7 text-white outline-none focus:border-emerald-500" /></label>
          <details className="mt-3 text-xs text-[#a9bdb3]"><summary className="cursor-pointer">عرض رسالة واتساب الأصلية للمقارنة</summary><pre className="mt-2 whitespace-pre-wrap font-sans leading-6">{editing.originalText}</pre></details>
          <button type="submit" className="mt-5 min-h-12 w-full rounded-xl bg-emerald-400 px-4 font-bold text-[#082019] hover:bg-emerald-300">حفظ التعديل</button>
        </form>
      </div>}

      {settingsOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
        <div className="max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-[#375047] bg-[#172320] p-5 shadow-2xl sm:rounded-3xl">
          <ModalHead title="إعدادات وارد الحوالات" onClose={() => setSettingsOpen(false)} />
          <p className="mb-4 text-xs leading-6 text-[#a9bdb3]">اختر القروبين اللذين تصلك منهما الحوالات، وقروب تم الاستلام، وقروب حوالات تم رفعها.</p>
          <div className="space-y-2"><div className="text-xs font-bold text-white">قروبات المصدر</div>{snapshot?.groups.map((group) => <label key={group.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-[#365047] bg-[#1d3029] px-3 text-sm"><input type="checkbox" checked={configForm.sourceGroupIds.includes(group.id)} onChange={(event) => setConfigForm({ ...configForm, sourceGroupIds: event.target.checked ? [...configForm.sourceGroupIds, group.id] : configForm.sourceGroupIds.filter((id) => id !== group.id) })} className="h-5 w-5 accent-emerald-400" />{group.name}</label>)}</div>
          <div className="mt-4 grid gap-3"><SelectGroup label="قروب تم الاستلام" groups={snapshot?.groups || []} value={configForm.receivedGroupId} onChange={(value) => setConfigForm({ ...configForm, receivedGroupId: value })} /><SelectGroup label="قروب حوالات تم رفعها" groups={snapshot?.groups || []} value={configForm.uploadedGroupId} onChange={(value) => setConfigForm({ ...configForm, uploadedGroupId: value })} /></div>
          <button type="button" onClick={async () => { if (await act('config', { ...configForm }, 'تم حفظ القروبات')) setSettingsOpen(false); }} className="mt-5 min-h-12 w-full rounded-xl bg-emerald-400 px-4 font-bold text-[#082019]">حفظ الإعدادات</button>
        </div>
      </div>}

      {preview && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-3" onClick={() => setPreview(null)} role="dialog" aria-label="معاينة الوصل"><button type="button" onClick={() => setPreview(null)} className="absolute left-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white" aria-label="إغلاق"><X className="h-5 w-5" /></button><img src={preview} alt="صورة الوصل" className="max-h-[90dvh] max-w-full object-contain" /></div>}
    </div>
  );
}

function Action({ onClick, icon: Icon, label, primary = false, disabled = false }: { onClick: () => void; icon: typeof Check; label: string; primary?: boolean; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-3 text-center text-xs font-bold leading-5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${primary ? 'bg-emerald-400 text-[#082019] hover:bg-emerald-300' : 'border border-[#385047] bg-[#24352f] text-[#d2e1d8] hover:bg-[#30483e]'}`}><Icon className="h-4 w-4 shrink-0" />{label}</button>;
}
function ModalHead({ title, onClose }: { title: string; onClose: () => void }) {
  return <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-extrabold">{title}</h2><button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2a3c34]" aria-label="إغلاق"><X className="h-5 w-5" /></button></div>;
}
function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block text-xs font-bold text-[#c2d1ca]">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-[#3a5046] bg-[#0f1a17] px-3 text-sm text-white outline-none focus:border-emerald-500" /></label>;
}
function SelectGroup({ label, groups, value, onChange }: { label: string; groups: Group[]; value: string; onChange: (value: string) => void }) {
  return <label className="block text-xs font-bold text-[#c2d1ca]">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-[#3a5046] bg-[#0f1a17] px-3 text-sm text-white outline-none focus:border-emerald-500"><option value="">اختر القروب</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>;
}
