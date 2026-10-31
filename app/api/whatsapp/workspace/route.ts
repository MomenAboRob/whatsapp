import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAuthUserFromRequest } from '@/lib/auth';
import { getWhatsAppManager } from '@/lib/whatsapp-client';
import {
  createSchedule, encryptSmtpPassword, readWorkspace, saveWorkspace, scanMentions,
  sendToTargets, smtpConfigured, validateTargets, verifySmtp,
} from '@/lib/whatsapp-workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const sendRequests = new Map<string, Promise<Record<string, { success: boolean; error?: string }>>>();

export async function GET(req: NextRequest) {
  const user = getAuthUserFromRequest(req);
  if (!user) return bad('غير مصرح', 401);
  const wa = getWhatsAppManager(req);
  const data = scanMentions(wa);
  if (!data.settings.emailTo && user.email) {
    data.settings.emailTo = user.email;
    saveWorkspace(user.id, data);
  }
  if (req.nextUrl.searchParams.get('summary') === '1') {
    return NextResponse.json({
      success: true,
      mentions: data.mentions.map((item) => ({ id: item.id, chatName: item.chatName, sender: item.sender, text: item.text, decision: item.decision })),
      settings: { browserEnabled: data.settings.browserEnabled },
    });
  }
  const directChats = wa.getUserGroups()
    .filter((group) => group.name && /@(s\.whatsapp\.net|lid)$/.test(group.id))
    .map((group) => ({ id: group.id, name: group.name, phone: group.phone, avatarUrl: group.avatarUrl }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const publicSettings = { ...data.settings };
  delete publicSettings.smtpPasswordEncrypted;
  return NextResponse.json({
    success: true,
    ...data,
    settings: { ...publicSettings, emailTo: data.settings.emailTo || user.email },
    smtpConfigured: smtpConfigured(data.settings),
    directChats,
    whatsappConnected: wa.getStatus().status === 'CONNECTED',
  });
}

export async function POST(req: NextRequest) {
  const user = getAuthUserFromRequest(req);
  if (!user) return bad('غير مصرح', 401);
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin) return bad('مصدر الطلب غير صالح', 403);
  const wa = getWhatsAppManager(req);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return bad('طلب غير صالح');
    body = parsed as Record<string, unknown>;
  } catch { return bad('طلب غير صالح'); }
  const action = String(body.action || '');
  const data = action === 'create_task' && body.source !== 'manual' ? scanMentions(wa) : readWorkspace(user.id);

  if (action === 'verify_smtp') {
    try {
      await verifySmtp(data.settings);
      return NextResponse.json({ success: true });
    } catch (error) {
      return bad(error instanceof Error ? error.message.slice(0, 180) : 'تعذر الاتصال بخادم البريد');
    }
  }

  if (action === 'create_task') {
    const title = String(body.title || '').trim().slice(0, 160);
    const notes = String(body.notes || '').trim().slice(0, 4000);
    if (!title) return bad('اكتب نوع المهمة');
    const due = new Date(String(body.dueAt || ''));
    if (!Number.isFinite(due.getTime())) return bad('اختر موعد التسليم');
    const dueAt = due.toISOString();
    const source = String(body.source || '');
    const sourceId = String(body.id || '');
    if (source === 'manual') {
      const item = { id: randomUUID(), createdAt: new Date().toISOString(), task: { title, notes, dueAt, status: 'open' as const } };
      data.manualTasks.unshift(item);
      saveWorkspace(user.id, data);
      return NextResponse.json({ success: true, task: item.task });
    }
    if (source === 'mention') {
      const item = data.mentions.find((mention) => mention.id === sourceId);
      if (!item) return bad('المنشن غير موجود', 404);
      item.decision = 'important';
      item.task = { ...item.task, title, notes, dueAt, status: item.task?.status || 'open' };
      saveWorkspace(user.id, data);
      return NextResponse.json({ success: true, task: item.task });
    }
    if (source === 'message') {
      const message = wa.getMessages().find((item) => item.id === sourceId);
      if (!message) return bad('الرسالة غير موجودة', 404);
      const mention = data.mentions.find((item) => item.id === sourceId);
      if (mention) {
        const existingMessageTask = data.messageTasks.find((item) => item.messageId === sourceId);
        mention.decision = 'important';
        mention.task = { ...existingMessageTask?.task, ...mention.task, title, notes, dueAt, status: mention.task?.status || existingMessageTask?.task.status || 'open' };
        data.messageTasks = data.messageTasks.filter((item) => item.messageId !== sourceId);
        saveWorkspace(user.id, data);
        return NextResponse.json({ success: true, task: mention.task });
      }
      const id = `message:${message.id}`;
      const existing = data.messageTasks.find((item) => item.id === id);
      if (existing) {
        existing.task = { ...existing.task, title, notes, dueAt };
      } else {
        data.messageTasks.unshift({
          id, messageId: message.id, chatJid: message.chatJid || '', chatName: message.chatName || 'محادثة',
          sender: message.senderName || message.sender || 'عضو', text: message.text || 'رسالة وسائط',
          timestampMs: message.timestampMs || Date.now(), task: { title, notes, dueAt, status: 'open' },
        });
      }
      saveWorkspace(user.id, data);
      return NextResponse.json({ success: true, task: existing?.task || data.messageTasks[0].task });
    }
    return bad('مصدر المهمة غير صالح');
  }

  if (action === 'update_mention') {
    const item = data.mentions.find((mention) => mention.id === body.id);
    if (!item) return bad('المنشن غير موجود', 404);
    if (body.decision !== 'new' && body.decision !== 'dismissed' && body.decision !== 'important') return bad('حالة غير صالحة');
    item.decision = body.decision;
    if (body.decision === 'important') {
      const title = String(body.title || item.text || 'متابعة المنشن').trim().slice(0, 160);
      const due = body.dueAt ? new Date(String(body.dueAt)) : null;
      if (due && !Number.isFinite(due.getTime())) return bad('موعد التسليم غير صالح');
      const dueAt = due?.toISOString() || item.task?.dueAt || '';
      item.task = { ...item.task, title, dueAt, status: item.task?.status || 'open' };
    } else {
      delete item.task;
    }
    saveWorkspace(user.id, data);
    return NextResponse.json({ success: true, mention: item });
  }

  if (action === 'update_task') {
    const task = data.mentions.find((mention) => mention.id === body.id)?.task ||
      data.messageTasks.find((item) => item.id === body.id)?.task ||
      data.manualTasks.find((item) => item.id === body.id)?.task;
    if (!task) return bad('المهمة غير موجودة', 404);
    if (body.status !== undefined && body.status !== 'open' && body.status !== 'done') return bad('حالة مهمة غير صالحة');
    if (body.status) {
      task.status = body.status;
      task.completedAt = body.status === 'done' ? new Date().toISOString() : undefined;
    }
    if (body.title !== undefined) task.title = String(body.title).trim().slice(0, 160) || task.title;
    if (body.notes !== undefined) task.notes = String(body.notes).trim().slice(0, 4000);
    if (body.dueAt !== undefined) {
      const due = body.dueAt ? new Date(String(body.dueAt)) : null;
      if (due && !Number.isFinite(due.getTime())) return bad('موعد التسليم غير صالح');
      task.dueAt = due?.toISOString() || '';
    }
    saveWorkspace(user.id, data);
    return NextResponse.json({ success: true, task });
  }

  if (action === 'settings') {
    const emailTo = String(body.emailTo || '').trim().toLowerCase();
    if (emailTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTo)) return bad('البريد الإلكتروني غير صالح');
    const smtpHost = String(body.smtpHost || '').trim().toLowerCase();
    const smtpUser = String(body.smtpUser || '').trim();
    const smtpPort = Number(body.smtpPort || 465);
    const smtpPassword = String(body.smtpPassword || '');
    if (smtpHost && !/^(?=.{4,253}$)[a-z0-9.-]+\.[a-z]{2,}$/.test(smtpHost)) return bad('عنوان خادم SMTP غير صالح');
    if (smtpUser && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(smtpUser)) return bad('حساب SMTP غير صالح');
    if (![465, 587].includes(smtpPort)) return bad('استخدم منفذ SMTP 465 أو 587');
    if (smtpPassword.length > 256) return bad('كلمة مرور SMTP طويلة جدًا');
    data.settings = {
      ...data.settings,
      emailTo: emailTo || user.email,
      emailEnabled: Boolean(body.emailEnabled),
      browserEnabled: Boolean(body.browserEnabled),
      smtpHost: smtpHost || data.settings.smtpHost,
      smtpUser: smtpUser || data.settings.smtpUser,
      smtpPort,
    };
    if (smtpPassword) data.settings.smtpPasswordEncrypted = encryptSmtpPassword(smtpPassword);
    if (body.clearSmtp === true) {
      delete data.settings.smtpPasswordEncrypted;
      delete data.settings.smtpHost;
      delete data.settings.smtpUser;
    }
    saveWorkspace(user.id, data);
    const publicSettings = { ...data.settings };
    delete publicSettings.smtpPasswordEncrypted;
    return NextResponse.json({ success: true, settings: publicSettings, smtpConfigured: smtpConfigured(data.settings) });
  }

  if (action === 'save_list') {
    const name = String(body.name || '').trim().slice(0, 80);
    if (!name) return bad('اكتب اسم القائمة');
    let targets: string[];
    try { targets = validateTargets(wa, body.targetJids); } catch (error) { return bad((error as Error).message); }
    const id = typeof body.id === 'string' && body.id ? body.id : randomUUID();
    const existing = data.recipientLists.find((list) => list.id === id);
    if (!existing && data.recipientLists.length >= 100) return bad('وصلت إلى الحد الأقصى للقوائم');
    if (existing) { existing.name = name; existing.targetJids = targets; }
    else data.recipientLists.push({ id, name, targetJids: targets });
    saveWorkspace(user.id, data);
    return NextResponse.json({ success: true, recipientLists: data.recipientLists });
  }

  if (action === 'delete_list') {
    data.recipientLists = data.recipientLists.filter((list) => list.id !== body.id);
    saveWorkspace(user.id, data);
    return NextResponse.json({ success: true, recipientLists: data.recipientLists });
  }

  if (action === 'schedule') {
    const text = String(body.text || '').trim();
    if (!text || text.length > 4096) return bad('اكتب رسالة لا تتجاوز 4096 حرف');
    let targets: string[];
    try { targets = validateTargets(wa, body.targetJids); } catch (error) { return bad((error as Error).message); }
    try {
      const schedule = createSchedule(wa, text, targets, String(body.scheduledAt || ''));
      return NextResponse.json({ success: true, schedule });
    } catch (error) {
      return bad((error as Error).message);
    }
  }

  if (action === 'cancel_schedule') {
    const item = data.schedules.find((schedule) => schedule.id === body.id);
    if (!item || item.status !== 'pending') return bad('لا يمكن إلغاء هذه الرسالة');
    item.status = 'canceled';
    saveWorkspace(user.id, data);
    return NextResponse.json({ success: true, schedule: item });
  }

  if (action === 'send_now') {
    if (body.confirm !== true) return bad('تأكيد الإرسال مطلوب');
    const text = String(body.text || '').trim();
    if (!text || text.length > 4096) return bad('اكتب رسالة لا تتجاوز 4096 حرف');
    if (wa.getStatus().status !== 'CONNECTED') return bad('واتساب غير متصل');
    let targets: string[];
    try { targets = validateTargets(wa, body.targetJids); } catch (error) { return bad((error as Error).message); }
    const requestId = String(body.requestId || '');
    if (!/^[a-f0-9-]{36}$/.test(requestId)) return bad('معرف طلب غير صالح');
    const key = `${user.id}:${requestId}`;
    let promise = sendRequests.get(key);
    if (!promise) {
      promise = sendToTargets(wa, text, targets);
      sendRequests.set(key, promise);
      setTimeout(() => sendRequests.delete(key), 30 * 60_000).unref();
    }
    const results = await promise;
    return NextResponse.json({ success: true, results });
  }

  return bad('إجراء غير معروف');
}
