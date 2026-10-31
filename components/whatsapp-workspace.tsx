"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { AlertCircle, ArrowRight, Bell, CalendarClock, Check, CheckCircle2, Clock3, ListPlus, Loader2, Paperclip, Pencil, Search, Send, Star, Trash2, Users, X } from 'lucide-react';
import type { MentionItem, MessageTask, ManualTask, RecipientList, ScheduledMessage, TaskDetails, WorkspaceSettings } from '@/lib/whatsapp-workspace';

type DirectChat = { id: string; name: string; phone?: string; avatarUrl?: string };
type Snapshot = {
  mentions: MentionItem[];
  messageTasks: MessageTask[];
  manualTasks: ManualTask[];
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

type TaskEntry = { id: string; chatJid?: string; chatName: string; sender: string; text: string; task: TaskDetails };
type TaskDraft = { source: 'mention' | 'message' | 'manual' | 'edit'; id: string; chatName: string; text: string; task?: TaskDetails };

export function WhatsAppWorkspace({
  view, initialText = '', initialTarget = '', initialTask, onOpenChat, onTaskDraftConsumed,
}: {
  view: 'dashboard' | 'compose';
  initialText?: string;
  initialTarget?: string;
  initialTask?: { id: string; chatName: string; text: string } | null;
  onOpenChat: (chatJid: string) => void;
  onTaskDraftConsumed?: () => void;
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
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(initialTask ? { ...initialTask, source: 'message' } : null);
  const [taskForm, setTaskForm] = useState({ title: '', notes: '', dueAt: '' });
  const [taskError, setTaskError] = useState('');
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

  const tasks = useMemo<TaskEntry[]>(() => [
    ...(data?.mentions || []).filter((item) => item.decision === 'important' && item.task).map((item) => ({ ...item, task: item.task! })),
    ...(data?.messageTasks || []),
    ...(data?.manualTasks || []).map((item) => ({ id: item.id, chatName: 'مهمة شخصية', sender: '', text: '', task: item.task })),
  ], [data]);
  const pending = useMemo(() => data?.mentions.filter((item) => item.decision === 'new') || [], [data]);
  const openTasks = useMemo(() => tasks.filter((item) => item.task.status === 'open').sort((a, b) => (a.task.dueAt || '9').localeCompare(b.task.dueAt || '9')), [tasks]);
  const doneTasks = useMemo(() => tasks.filter((item) => item.task.status === 'done').sort((a, b) => (b.task.completedAt || '').localeCompare(a.task.completedAt || '')), [tasks]);

  const openTaskEditor = (draft: TaskDraft) => {
    setTaskDraft(draft);
    setTaskForm({ title: draft.task?.title || '', notes: draft.task?.notes || '', dueAt: inputDate(draft.task?.dueAt || '') });
    setTaskError('');
  };
  const closeTaskEditor = () => { setTaskDraft(null); setTaskError(''); onTaskDraftConsumed?.(); };
  const saveTask = async () => {
    if (!taskDraft) return;
    if (!taskForm.title.trim()) { setTaskError('اكتب نوع المهمة'); return; }
    if (!taskForm.dueAt || !Number.isFinite(new Date(taskForm.dueAt).getTime())) { setTaskError('اختر موعد التسليم'); return; }
    setBusy('task'); setTaskError('');
    try {
      await post({ action: taskDraft.source === 'edit' ? 'update_task' : 'create_task',
        source: taskDraft.source, id: taskDraft.id, title: taskForm.title.trim(), notes: taskForm.notes.trim(), dueAt: new Date(taskForm.dueAt).toISOString() });
      await refresh();
      closeTaskEditor();
    } catch (err) { setTaskError(err instanceof Error ? err.message : 'تعذر حفظ المهمة'); }
    finally { setBusy(''); }
  };
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
      <div className={`mx-auto ${view === 'dashboard' ? 'max-w-[1700px]' : 'max-w-6xl'}`}>
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
              <Summary icon={Star} label="مهام مفتوحة" value={openTasks.length} />
              <Summary icon={CheckCircle2} label="مهام منجزة" value={doneTasks.length} />
            </div>
            <div className="grid min-h-0 gap-4 xl:grid-cols-3">
              <section className="min-w-0 rounded-2xl border border-[#2a3933] bg-[#141d19] p-3 sm:p-4">
                <SectionTitle title={`المنشنات · ${pending.length}`} subtitle="المنشنات التي لم تصنفها بعد" />
                <div className="grid gap-3 xl:max-h-[calc(100dvh-280px)] xl:overflow-y-auto xl:pl-1">
                {pending.slice(0, visibleMentions).map((item) => (
                  <article key={item.id} className="rounded-xl border border-emerald-500/20 bg-[#192520] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2"><span className="font-bold">{item.chatName}</span><span className="text-xs text-[#8da198]">· {item.sender}</span></div>
                      <time className="text-xs text-[#8da198]">{dateLabel(item.timestampMs)}</time>
                    </div>
                    <p dir="auto" className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{item.text || 'منشن في رسالة وسائط'}</p>
                    {item.emailError && <p className="mt-2 text-xs text-rose-300">تعذر إرسال تنبيه البريد: {item.emailError}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <SmallButton onClick={() => onOpenChat(item.chatJid)}><ArrowRight className="h-3.5 w-3.5" />فتح المحادثة</SmallButton>
                      <SmallButton active onClick={() => openTaskEditor({ source: 'mention', id: item.id, chatName: item.chatName, text: item.text })}><Star className="h-3.5 w-3.5" />إنشاء مهمة</SmallButton>
                      <SmallButton onClick={() => void act(item.id, { action: 'update_mention', id: item.id, decision: 'dismissed' })} disabled={busy === item.id}>غير مهتم</SmallButton>
                    </div>
                  </article>
                ))}
                {pending.length > visibleMentions && <button type="button" onClick={() => setVisibleMentions((count) => count + 100)} className="rounded-xl border border-[#34453c] bg-[#18201d] p-3 text-sm font-semibold text-[#21c063] hover:bg-[#203328]">عرض المزيد ({pending.length - visibleMentions} متبقية)</button>}
                {!pending.length && <Empty text="لا توجد منشنات بانتظار قرارك." />}
              </div>
            </section>
              <section className="min-w-0 rounded-2xl border border-[#2a3933] bg-[#141d19] p-3 sm:p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2"><SectionTitle title={`المهام · ${openTasks.length}`} subtitle="المهام التي تنتظر إنجازك" /><SmallButton active onClick={() => openTaskEditor({ source: 'manual', id: '', chatName: 'مهمة شخصية', text: '' })}><ListPlus className="h-3.5 w-3.5" />مهمة جديدة</SmallButton></div>
                <div className="grid gap-3 xl:max-h-[calc(100dvh-280px)] xl:overflow-y-auto xl:pl-1">
                  {openTasks.map((item) => <TaskCard key={item.id} item={item} onOpenChat={onOpenChat}
                    onEdit={() => openTaskEditor({ source: 'edit', id: item.id, chatName: item.chatName, text: item.text, task: item.task })}
                    onStatus={() => void act(item.id, { action: 'update_task', id: item.id, status: 'done' })}
                    onUpload={(file) => void uploadTaskFile(item.id, file)} busy={busy === item.id} />)}
                  {!openTasks.length && <Empty text="حوّل منشنًا أو رسالة إلى مهمة لتظهر هنا." />}
                </div>
              </section>
              <section className="min-w-0 rounded-2xl border border-[#2a3933] bg-[#141d19] p-3 sm:p-4">
                <SectionTitle title={`المهام المنجزة · ${doneTasks.length}`} subtitle="كل مهمة اكتملت تنتقل إلى هنا" />
                <div className="grid gap-3 xl:max-h-[calc(100dvh-280px)] xl:overflow-y-auto xl:pl-1">
                  {doneTasks.map((item) => <TaskCard key={item.id} item={item} onOpenChat={onOpenChat}
                    onEdit={() => openTaskEditor({ source: 'edit', id: item.id, chatName: item.chatName, text: item.text, task: item.task })}
                    onStatus={() => void act(item.id, { action: 'update_task', id: item.id, status: 'open' })}
                    onUpload={(file) => void uploadTaskFile(item.id, file)} busy={busy === item.id} />)}
                  {!doneTasks.length && <Empty text="ستظهر هنا المهام بعد الضغط على «تم الانتهاء»." />}
                </div>
              </section>
            </div>
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
        {view === 'dashboard' && taskDraft && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeTaskEditor(); }}>
          <form role="dialog" aria-modal="true" aria-label={taskDraft.source === 'edit' ? 'تعديل المهمة' : 'إنشاء مهمة'} onSubmit={(event) => { event.preventDefault(); void saveTask(); }} className="w-full max-w-lg rounded-2xl border border-[#3e5946] bg-[#17251d] p-5 text-right shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-semibold text-[#21c063]">{taskDraft.source === 'edit' ? 'تعديل المهمة' : 'مهمة جديدة'}</div><h2 className="mt-1 text-xl font-bold">{taskDraft.chatName}</h2></div><button type="button" onClick={closeTaskEditor} aria-label="إغلاق" className="rounded-lg p-1 text-[#a9bbb2] hover:bg-white/10"><X className="h-5 w-5" /></button></div>
            {taskDraft.source !== 'manual' && <p dir="auto" className="mt-3 max-h-20 overflow-y-auto rounded-xl bg-[#101815] p-3 text-xs leading-5 text-[#a9bbb2]">{taskDraft.text || 'رسالة وسائط'}</p>}
            <label className="mt-4 block text-sm font-semibold">نوع المهمة <span className="text-emerald-300">*</span><input autoFocus required maxLength={160} value={taskForm.title} onChange={(event) => setTaskForm((form) => ({ ...form, title: event.target.value }))} placeholder="مثال: متابعة الطلب أو تجهيز الملف" className="mt-1.5 w-full rounded-xl border border-[#3b5445] bg-[#101815] px-3 py-2.5 text-sm font-normal outline-none focus:border-[#21c063]" /></label>
            <label className="mt-4 block text-sm font-semibold">ملاحظات المهمة<textarea maxLength={4000} rows={4} value={taskForm.notes} onChange={(event) => setTaskForm((form) => ({ ...form, notes: event.target.value }))} placeholder="اكتب التفاصيل التي تحتاج تذكرها..." className="mt-1.5 w-full resize-y rounded-xl border border-[#3b5445] bg-[#101815] px-3 py-2.5 text-sm font-normal leading-6 outline-none focus:border-[#21c063]" /></label>
            <label className="mt-4 block text-sm font-semibold">موعد التسليم <span className="text-emerald-300">*</span><input required type="datetime-local" value={taskForm.dueAt} onChange={(event) => setTaskForm((form) => ({ ...form, dueAt: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-[#3b5445] bg-[#101815] px-3 py-2.5 text-sm font-normal outline-none focus:border-[#21c063]" /></label>
            {taskError && <p className="mt-3 text-xs text-rose-300">{taskError}</p>}
            <div className="mt-5 flex gap-2"><button type="submit" disabled={busy === 'task'} className="rounded-xl bg-[#21c063] px-4 py-2.5 text-sm font-bold text-[#092116] disabled:opacity-50">{busy === 'task' ? 'جاري الحفظ...' : taskDraft.source === 'edit' ? 'حفظ التعديلات' : 'إنشاء المهمة'}</button><SmallButton onClick={closeTaskEditor}>إلغاء</SmallButton></div>
          </form>
        </div>}
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
function TaskCard({ item, onOpenChat, onEdit, onStatus, onUpload, busy }: {
  item: TaskEntry;
  onOpenChat: (jid: string) => void;
  onEdit: () => void;
  onStatus: () => void;
  onUpload: (file: File) => void;
  busy: boolean;
}) {
  const done = item.task.status === 'done';
  return <article className={`rounded-xl border p-3 ${done ? 'border-[#34453c] bg-[#18201d]' : 'border-[#2f4938] bg-[#192520]'}`}>
    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-xs text-[#8da198]">{item.chatName}</div><h3 className="mt-1 break-words font-bold leading-6">{item.task.title}</h3></div><span className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${done ? 'bg-emerald-500/15 text-emerald-300' : 'bg-[#263a2d] text-[#a8cfb3]'}`}>{done ? 'منجزة' : 'مفتوحة'}</span></div>
    {item.task.notes && <p dir="auto" className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#d8e4db]">{item.task.notes}</p>}
    {item.text && <p dir="auto" className="mt-2 line-clamp-2 break-words text-xs leading-5 text-[#91a59a]">{item.text}</p>}
    <div className="mt-3 flex items-center gap-1.5 text-xs text-[#a9bbb2]"><Clock3 className="h-3.5 w-3.5" />التسليم: {dateLabel(item.task.dueAt)}</div>
    {done && item.task.completedAt && <p className="mt-1 text-xs text-emerald-300">اكتملت: {dateLabel(item.task.completedAt)}</p>}
    <div className="mt-3 flex flex-wrap gap-2"><SmallButton active={!done} onClick={onStatus} disabled={busy}>{done ? 'إعادة فتح' : 'تم الانتهاء'}</SmallButton><SmallButton onClick={onEdit}><Pencil className="h-3.5 w-3.5" />تعديل</SmallButton>{item.chatJid && <SmallButton onClick={() => onOpenChat(item.chatJid!)}><ArrowRight className="h-3.5 w-3.5" />المحادثة</SmallButton>}</div>
    <div className="mt-3 flex min-w-0 items-center gap-2 text-xs"><label className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-[#21c063]"><Paperclip className="h-3.5 w-3.5" />{item.task.attachment ? 'استبدال الملف' : 'إرفاق ملف'}<input type="file" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ''; }} /></label>{item.task.attachment && <a href={`/api/whatsapp/workspace/file?id=${encodeURIComponent(item.id)}`} className="min-w-0 truncate text-[#b8c8bc] underline">{item.task.attachment.name}</a>}</div>
  </article>;
}
