"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { AlertCircle, ArrowRight, Bell, CalendarClock, Check, Clock3, ListPlus, Loader2, Paperclip, Search, Send, Star, Trash2, Users, X } from 'lucide-react';
import type { MentionItem, RecipientList, ScheduledMessage, WorkspaceSettings } from '@/lib/whatsapp-workspace';

type DirectChat = { id: string; name: string; phone?: string; avatarUrl?: string };
type Snapshot = {
  mentions: MentionItem[];
  recipientLists: RecipientList[];
  schedules: ScheduledMessage[];
  settings: WorkspaceSettings;
  directChats: DirectChat[];
  whatsappConnected: boolean;
  smtpConfigured: boolean;
};

const dateLabel = (value: string | number) => value
  ? new Date(value).toLocaleString('ar-JO', { dateStyle: 'medium', timeStyle: 'short' })
  : 'لم يُحدد';
const inputDate = (value: string) => {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export function WhatsAppWorkspace({
  view, initialText = '', initialTarget = '', onOpenChat,
}: {
  view: 'dashboard' | 'compose';
  initialText?: string;
  initialTarget?: string;
  onOpenChat: (chatJid: string) => void;
}) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>(initialTarget ? [initialTarget] : []);
  const [text, setText] = useState(initialText);
  const [scheduledAt, setScheduledAt] = useState('');
  const [listName, setListName] = useState('');
  const [confirmSend, setConfirmSend] = useState(false);
  const [sendResult, setSendResult] = useState('');
  const [taskDates, setTaskDates] = useState<Record<string, string>>({});
  const [taskTitles, setTaskTitles] = useState<Record<string, string>>({});
  const [visibleMentions, setVisibleMentions] = useState(100);
  const [visibleContacts, setVisibleContacts] = useState(100);
  const sendRequestId = useRef('');
  const sending = useRef(false);
  const scheduling = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/whatsapp/workspace', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'تعذر تحميل البيانات');
      setData(json);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => { void refresh(); }, 0);
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 20_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [refresh]);

  const post = async (body: Record<string, unknown>) => {
    const response = await fetch('/api/whatsapp/workspace', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.error || 'تعذر حفظ التغيير');
    return json;
  };

  const act = async (key: string, body: Record<string, unknown>, after?: () => void) => {
    setBusy(key); setError('');
    try { await post(body); await refresh(); after?.(); }
    catch (err) { setError(err instanceof Error ? err.message : 'تعذر تنفيذ الطلب'); }
    finally { setBusy(''); }
  };

  const tasks = useMemo(() => data?.mentions.filter((item) => item.decision === 'important' && item.task) || [], [data]);
  const pending = useMemo(() => data?.mentions.filter((item) => item.decision === 'new') || [], [data]);
  const directChats = useMemo(() => (data?.directChats || []).filter((chat) =>
    (chat.name + ' ' + (chat.phone || '')).toLowerCase().includes(search.toLowerCase().trim())
  ), [data, search]);
  const selectedNames = selected.map((id) => data?.directChats.find((chat) => chat.id === id)?.name || id);
  const toggle = (jid: string) => {
    sendRequestId.current = '';
    setSelected((previous) => previous.includes(jid) ? previous.filter((item) => item !== jid) : [...previous, jid]);
  };

  const saveList = async () => {
    if (!listName.trim() || !selected.length) { setError('اكتب اسم القائمة وحدد جهات الاتصال'); return; }
    await act('list', { action: 'save_list', name: listName, targetJids: selected }, () => setListName(''));
  };
  const schedule = async () => {
    if (scheduling.current) return;
    if (!scheduledAt) { setError('اختر التاريخ والوقت'); return; }
    const when = new Date(scheduledAt);
    if (!Number.isFinite(when.getTime())) { setError('اختر تاريخًا ووقتًا صالحين'); return; }
    scheduling.current = true;
    await act('schedule', {
      action: 'schedule', text, targetJids: selected, scheduledAt: when.toISOString(),
    }, () => { setText(''); setSelected([]); setScheduledAt(''); setSendResult('تم حفظ الرسالة المجدولة.'); });
    scheduling.current = false;
  };
  const sendNow = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy('send'); setError('');
    try {
      sendRequestId.current ||= crypto.randomUUID();
      const result = await post({ action: 'send_now', text, targetJids: selected, confirm: true, requestId: sendRequestId.current });
      const sent = Object.values(result.results as Record<string, { success: boolean }>).filter((item) => item.success).length;
      setSendResult(`تم الإرسال إلى ${sent} من ${selected.length} جهات.${sent < selected.length ? ' تعذر الإرسال إلى الجهات الأخرى؛ راجع النتيجة قبل إعادة المحاولة.' : ''}`);
      setConfirmSend(false);
      setText(''); setSelected([]); sendRequestId.current = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الإرسال');
    } finally { sending.current = false; setBusy(''); }
  };
  const uploadTaskFile = async (id: string, file: File) => {
    setBusy(id); setError('');
    try {
      const form = new FormData();
      form.set('id', id);
      form.set('file', file);
      const response = await fetch('/api/whatsapp/workspace/file', { method: 'POST', body: form });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || 'تعذر حفظ الملف');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ الملف');
    } finally { setBusy(''); }
  };

  if (loading && !data) return <div className="flex h-full items-center justify-center text-[#a5a5a5]"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div dir="rtl" className="h-full overflow-y-auto bg-[#111716] px-4 py-5 text-[#f5f7f6] sm:px-7">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 text-xs font-semibold text-[#21c063]">{view === 'dashboard' ? 'المتابعة اليومية' : 'مركز الرسائل'}</div>
            <h1 className="text-2xl font-bold">{view === 'dashboard' ? 'المنشنات والمهام' : 'رسالة لعدة جهات'}</h1>
            <p className="mt-1 text-sm text-[#98aaa2]">
              {view === 'dashboard' ? 'راجع كل منشن وحدد ما يحتاج متابعة وموعد تسليمه.' : 'اكتب الرسالة، اختر الأشخاص أو قائمة محفوظة، ثم أرسل أو حدد موعدًا.'}
            </p>
          </div>
          {data && <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${data.whatsappConnected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{data.whatsappConnected ? 'واتساب متصل' : 'واتساب غير متصل'}</span>}
        </header>
        {error && <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300"><AlertCircle className="h-4 w-4 shrink-0" />{error}<button type="button" onClick={() => setError('')} className="mr-auto"><X className="h-4 w-4" /></button></div>}
        {sendResult && <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{sendResult}</div>}

        {view === 'dashboard' ? (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <Summary icon={Bell} label="منشنات بانتظار قرارك" value={pending.length} />
              <Summary icon={Star} label="مهام مفتوحة" value={tasks.filter((item) => item.task?.status === 'open').length} />
              <Summary icon={CalendarClock} label="رسائل مجدولة" value={data?.schedules.filter((item) => item.status === 'pending').length || 0} />
            </div>
            <section>
              <SectionTitle title="المنشنات" subtitle="اختر «مهم» لإنشاء مهمة، أو «غير مهم» لإخفائه من قائمة المتابعة." />
              <div className="grid gap-3">
                {(data?.mentions || []).slice(0, visibleMentions).map((item) => (
                  <article key={item.id} className={`rounded-2xl border p-4 ${item.decision === 'new' ? 'border-emerald-500/25 bg-[#192520]' : 'border-[#2a3933] bg-[#18201d]'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2"><span className="font-bold">{item.chatName}</span><span className="text-xs text-[#8da198]">· {item.sender}</span></div>
                      <time className="text-xs text-[#8da198]">{dateLabel(item.timestampMs)}</time>
                    </div>
                    <p dir="auto" className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{item.text || 'منشن في رسالة وسائط'}</p>
                    {item.emailError && <p className="mt-2 text-xs text-rose-300">تعذر إرسال تنبيه البريد: {item.emailError}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <SmallButton onClick={() => onOpenChat(item.chatJid)}><ArrowRight className="h-3.5 w-3.5" />فتح المحادثة</SmallButton>
                      {item.decision !== 'important' && <SmallButton active onClick={() => void act(item.id, { action: 'update_mention', id: item.id, decision: 'important' })} disabled={busy === item.id}><Star className="h-3.5 w-3.5" />مهم، أنشئ مهمة</SmallButton>}
                      {item.decision !== 'dismissed' && <SmallButton onClick={() => void act(item.id, { action: 'update_mention', id: item.id, decision: 'dismissed' })} disabled={busy === item.id}>غير مهم</SmallButton>}
                      {item.decision === 'dismissed' && <span className="self-center text-xs text-[#8da198]">غير مهم</span>}
                    </div>
                  </article>
                ))}
                {(data?.mentions.length || 0) > visibleMentions && <button type="button" onClick={() => setVisibleMentions((count) => count + 100)} className="rounded-xl border border-[#34453c] bg-[#18201d] p-3 text-sm font-semibold text-[#21c063] hover:bg-[#203328]">عرض المزيد من المنشنات ({(data?.mentions.length || 0) - visibleMentions} متبقية)</button>}
                {!data?.mentions.length && <Empty text="ما وصل أي منشن لك بعد. ستظهر المنشنات هنا تلقائيًا عند وصولها." />}
              </div>
            </section>
            <section>
              <SectionTitle title="مهامي" subtitle="المهام المهمة تبقى هنا حتى تنهيها. يمكنك تحديد موعد التسليم أو تغييره." />
              <div className="grid gap-3 md:grid-cols-2">
                {tasks.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-[#2a3933] bg-[#18201d] p-4">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="text-xs text-[#21c063]">{item.chatName}</div><input value={taskTitles[item.id] ?? item.task?.title ?? ''} onChange={(event) => setTaskTitles((prev) => ({ ...prev, [item.id]: event.target.value }))} aria-label="عنوان المهمة" className="mt-1 w-full border-b border-transparent bg-transparent font-bold outline-none focus:border-[#21c063]" /></div><span className={`rounded-full px-2 py-1 text-xs ${item.task?.status === 'done' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{item.task?.status === 'done' ? 'منجزة' : 'مفتوحة'}</span></div>
                    <p dir="auto" className="mt-2 line-clamp-2 text-xs text-[#a9bbb2]">{item.text}</p>
                    <div className="mt-4 flex flex-wrap items-end gap-2">
                      <label className="flex-1 text-xs text-[#a9bbb2]">موعد التسليم<input type="datetime-local" value={taskDates[item.id] ?? inputDate(item.task?.dueAt || '')} onChange={(event) => setTaskDates((prev) => ({ ...prev, [item.id]: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#34453c] bg-[#111716] p-2 text-sm text-white" /></label>
                      <SmallButton onClick={() => void act(item.id, { action: 'update_task', id: item.id, title: taskTitles[item.id] ?? item.task?.title, dueAt: taskDates[item.id] ? new Date(taskDates[item.id]).toISOString() : item.task?.dueAt || '' })} disabled={busy === item.id}>حفظ التفاصيل</SmallButton>
                      <SmallButton active={item.task?.status !== 'done'} onClick={() => void act(item.id, { action: 'update_task', id: item.id, status: item.task?.status === 'done' ? 'open' : 'done' })}>{item.task?.status === 'done' ? 'إعادة فتح' : 'تم الإنجاز'}</SmallButton>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-[#21c063]"><Paperclip className="h-3.5 w-3.5" />{item.task?.attachment ? 'استبدال الملف' : 'إرفاق ملف للمهمة'}<input type="file" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadTaskFile(item.id, file); event.target.value = ''; }} /></label>
                      {item.task?.attachment && <a href={`/api/whatsapp/workspace/file?id=${encodeURIComponent(item.id)}`} className="truncate text-[#b8c8bc] underline">{item.task.attachment.name}</a>}
                    </div>
                  </article>
                ))}
                {!tasks.length && <Empty text="حدد منشنًا مهمًا ليظهر هنا كمهمة." />}
              </div>
            </section>
            <section>
              <SectionTitle title="الرسائل المجدولة" subtitle="تعرض مواعيد الإرسال وحالة كل رسالة." />
              <div className="grid gap-2">
                {(data?.schedules || []).slice(0, 50).map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#2a3933] bg-[#18201d] p-3 text-sm">
                    <Clock3 className="h-4 w-4 text-[#21c063]" />
                    <div className="min-w-0 flex-1"><div className="truncate font-medium">{item.text}</div><div className="text-xs text-[#8da198]">{dateLabel(item.scheduledAt)} · {item.targetJids.length} جهات · {item.status === 'pending' ? 'بانتظار الموعد' : item.status === 'sent' ? 'أُرسلت' : item.status === 'failed' ? 'تعذر الإرسال' : item.status === 'canceled' ? 'أُلغيت' : 'قيد الإرسال'}</div>{item.status === 'failed' && <div className="mt-1 text-xs text-rose-300">{Object.values(item.errors).join('، ')}</div>}</div>
                    {item.status === 'pending' && <SmallButton onClick={() => void act(item.id, { action: 'cancel_schedule', id: item.id })}>إلغاء</SmallButton>}
                  </div>
                ))}
                {!data?.schedules.length && <Empty text="لا توجد رسائل مجدولة." />}
              </div>
            </section>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-2xl border border-[#2a3933] bg-[#18201d] p-4">
              <SectionTitle title="جهات الاتصال" subtitle={`تم اختيار ${selected.length} جهة`} />
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-[#101815] px-3 py-2"><Search className="h-4 w-4 text-[#8da198]" /><input value={search} onChange={(event) => { setSearch(event.target.value); setVisibleContacts(100); }} placeholder="ابحث بالاسم أو الرقم" className="w-full bg-transparent text-sm outline-none placeholder:text-[#82968b]" /></div>
              <div className="max-h-[410px] space-y-1 overflow-y-auto">
                {directChats.slice(0, visibleContacts).map((chat) => <button key={chat.id} type="button" onClick={() => toggle(chat.id)} className="flex w-full items-center gap-3 rounded-xl p-2 text-right hover:bg-[#25352d]">
                  {chat.avatarUrl ? <Image src={chat.avatarUrl} alt="" width={36} height={36} unoptimized className="h-9 w-9 rounded-full object-cover" /> : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2b4034] text-emerald-300"><Users className="h-4 w-4" /></div>}
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{chat.name}</span><span dir="ltr" className="block text-right text-xs text-[#8da198]">{chat.phone || ''}</span></span>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected.includes(chat.id) ? 'border-[#21c063] bg-[#21c063] text-[#08160e]' : 'border-[#6e8176]'}`}>{selected.includes(chat.id) && <Check className="h-3 w-3" />}</span>
                </button>)}
                {directChats.length > visibleContacts && <button type="button" onClick={() => setVisibleContacts((count) => count + 100)} className="w-full rounded-lg border border-[#34453c] p-2 text-xs font-semibold text-[#21c063]">عرض 100 جهة أخرى ({directChats.length - visibleContacts} متبقية)</button>}
                {!directChats.length && <Empty text="لا توجد جهة مطابقة." />}
              </div>
            </section>
            <div className="space-y-5">
              <section className="rounded-2xl border border-[#2a3933] bg-[#18201d] p-4">
                <SectionTitle title="قوائم المستلمين" subtitle="اختر القائمة لإضافة جميع جهاتها دفعة واحدة." />
                <div className="space-y-2">
                  {(data?.recipientLists || []).map((list) => <div key={list.id} className="flex items-center gap-2 rounded-lg bg-[#111716] p-2 text-sm"><button type="button" onClick={() => { sendRequestId.current = ''; setSelected((prev) => [...new Set([...prev, ...list.targetJids])]); }} className="min-w-0 flex-1 text-right hover:text-[#21c063]"><span className="block truncate font-medium">{list.name}</span><span className="text-xs text-[#8da198]">{list.targetJids.length} جهات · تحديد الكل</span></button><button type="button" onClick={() => void act(list.id, { action: 'delete_list', id: list.id })} title="حذف القائمة" className="p-1 text-[#8da198] hover:text-rose-400"><Trash2 className="h-4 w-4" /></button></div>)}
                  {!data?.recipientLists.length && <p className="text-xs text-[#8da198]">لا توجد قوائم محفوظة بعد.</p>}
                </div>
                <div className="mt-3 flex gap-2"><input value={listName} onChange={(event) => setListName(event.target.value)} placeholder="اسم قائمة جديدة" className="min-w-0 flex-1 rounded-lg border border-[#34453c] bg-[#111716] px-2 py-1.5 text-sm outline-none" /><SmallButton onClick={() => void saveList()} disabled={busy === 'list'}><ListPlus className="h-4 w-4" />حفظ المحددين</SmallButton></div>
              </section>
              <section className="rounded-2xl border border-[#2a3933] bg-[#18201d] p-4">
                <SectionTitle title="نص الرسالة" subtitle="ستصل نفس الرسالة لكل جهة بشكل منفصل." />
                <textarea value={text} onChange={(event) => { sendRequestId.current = ''; setText(event.target.value); }} maxLength={4096} rows={5} placeholder="اكتب رسالتك هنا..." className="w-full resize-y rounded-xl border border-[#34453c] bg-[#111716] p-3 text-sm leading-6 outline-none focus:border-[#21c063]" />
                <p className="mt-1 text-left text-xs text-[#8da198]">{text.length}/4096</p>
                <label className="mt-3 block text-xs text-[#a9bbb2]">موعد الإرسال (اختياري)<input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="mt-1 w-full rounded-lg border border-[#34453c] bg-[#111716] p-2 text-sm text-white" /></label>
                <div className="mt-3 flex gap-2"><SmallButton active onClick={() => { setError(''); setConfirmSend(true); }} disabled={!text.trim() || !selected.length || busy === 'send'}><Send className="h-4 w-4" />مراجعة الإرسال الآن</SmallButton><SmallButton onClick={() => void schedule()} disabled={!text.trim() || !selected.length || !scheduledAt || busy === 'schedule'}><CalendarClock className="h-4 w-4" />جدولة الرسالة</SmallButton></div>
              </section>
            </div>
            {confirmSend && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4"><div className="w-full max-w-md rounded-2xl border border-[#3e5946] bg-[#17251d] p-5 shadow-2xl"><h2 className="text-lg font-bold">تأكيد الإرسال</h2><p className="mt-2 text-sm text-[#b6c7bc]">ستُرسل الرسالة الآن إلى {selected.length} جهات بشكل منفصل:</p><p className="mt-2 max-h-24 overflow-auto text-sm text-[#21c063]">{selectedNames.join('، ')}</p><div dir="auto" className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-[#101815] p-3 text-sm">{text}</div><div className="mt-5 flex gap-2"><SmallButton active onClick={() => void sendNow()} disabled={busy === 'send'}><Send className="h-4 w-4" />تأكيد وإرسال</SmallButton><SmallButton onClick={() => setConfirmSend(false)}>رجوع</SmallButton></div></div></div>}
          </div>
        )}
      </div>
    </div>
  );
}

function Summary({ icon: Icon, label, value }: { icon: typeof Bell; label: string; value: number }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-[#2a3933] bg-[#18201d] p-4"><div className="rounded-xl bg-[#21c063]/10 p-2 text-[#21c063]"><Icon className="h-5 w-5" /></div><div><div className="text-2xl font-bold">{value}</div><div className="text-xs text-[#9eb0a5]">{label}</div></div></div>;
}
function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="mb-3"><h2 className="text-lg font-bold">{title}</h2><p className="mt-0.5 text-xs text-[#8da198]">{subtitle}</p></div>;
}
function SmallButton({ children, onClick, disabled, active }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${active ? 'border-[#21c063] bg-[#21c063] text-[#092116] hover:bg-[#32d473]' : 'border-[#3b5445] bg-[#223228] text-[#c5d7cb] hover:bg-[#2c4132]'}`}>{children}</button>;
}
function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-[#34453c] p-6 text-center text-sm text-[#8da198]">{text}</div>;
}
