export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getAuthUserFromRequest } from '@/lib/auth';
import { getWhatsAppManager } from '@/lib/whatsapp-client';
import {
  catchUpRecentGroups, dispatchCard, dispatchReceiptFollowup, linkManualCollection, loadInbox, queueReceived, recognizeReceipt, resolvedConfig, retryPending, saveInbox, syncAirtableInBackground, syncInbox, unlinkManualCollection,
  type InboxCard,
} from '@/lib/transfer-inbox';

function current(req: NextRequest) {
  const user = getAuthUserFromRequest(req);
  if (!user) return null;
  const wa = getWhatsAppManager(req);
  return { user, wa };
}

export async function GET(req: NextRequest) {
  const context = current(req);
  if (!context) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  const { user, wa } = context;
  const store = syncInbox(user.id, wa);
  catchUpRecentGroups(user.id, wa);
  syncAirtableInBackground(user.id);
  void retryPending(user.id, wa);
  const groups = wa.getUserGroups().filter((group) => group.isGroup);
  const currentGroupNames = new Map(groups.map((group) => [group.id, group.name]));
  const withCurrentGroupName = <T extends { chatJid: string; chatName: string }>(item: T): T => ({
    ...item,
    chatName: currentGroupNames.get(item.chatJid) || item.chatName,
  });
  return NextResponse.json({
    success: true,
    cards: Object.values(store.cards).map(withCurrentGroupName).sort((a, b) => b.timestampMs - a.timestampMs),
    receipts: Object.values(store.receipts).map(withCurrentGroupName).sort((a, b) => b.timestampMs - a.timestampMs),
    manualCollections: Object.values(store.manualCollections).sort((a, b) => b.collectedAt - a.collectedAt),
    groups,
    config: resolvedConfig(store, wa.getUserGroups()),
    configured: store.config,
    connected: wa.getStatus().status === 'CONNECTED',
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const context = current(req);
  if (!context) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  const { user, wa } = context;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }
  const action = String(body.action || '');
  const store = syncInbox(user.id, wa);
  const card = store.cards[String(body.cardId || '')];
  const receipt = store.receipts[String(body.receiptId || '')];
  const manual = store.manualCollections[String(body.manualId || '')];
  const bad = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

  if (action === 'create_manual' || action === 'edit_manual') {
    if (action === 'edit_manual' && !manual) return bad('سجل الاستلام غير موجود', 404);
    if (manual?.linkedCardId) return bad('افصل السجل عن الحوالة قبل تعديله');
    const nameOnTransfer = String(body.nameOnTransfer || '').trim().slice(0, 160);
    const reference = String(body.reference || '').trim().slice(0, 120);
    const notes = String(body.notes || '').trim().slice(0, 1000);
    const amount = body.amount === '' || body.amount == null ? null : Number(body.amount);
    const currency = String(body.currency || 'JOD').trim().slice(0, 12).toUpperCase();
    if ((!nameOnTransfer && !reference) || (amount !== null && (!Number.isFinite(amount) || amount < 0))) return bad('اكتب الاسم أو رقم الحوالة، وراجع المبلغ');
    if (manual) Object.assign(manual, { nameOnTransfer, reference, notes, amount, currency });
    else {
      const id = randomUUID();
      store.manualCollections[id] = { id, nameOnTransfer, reference, notes, amount, currency, collectedAt: Date.now() };
    }
    saveInbox(user.id, store);
    return NextResponse.json({ success: true });
  }

  if (action === 'link_manual') {
    if (!manual || !card) return bad('سجل الاستلام أو الحوالة غير موجود', 404);
    try { linkManualCollection(store, manual.id, card.id); }
    catch (error) { return bad(error instanceof Error ? error.message : 'تعذر ربط السجل'); }
    const siblings = Object.values(store.cards).filter((item) => item.sourceMessageId === card.sourceMessageId && item.status !== 'duplicate');
    if (siblings.every((item) => item.status === 'received')) wa.updateMessageStatus(card.sourceMessageId, { isReceived: true });
    saveInbox(user.id, store);
    return NextResponse.json({ success: true });
  }

  if (action === 'unlink_manual') {
    if (!manual?.linkedCardId) return bad('سجل الاستلام غير مربوط');
    try { unlinkManualCollection(store, manual.id); }
    catch (error) { return bad(error instanceof Error ? error.message : 'تعذر فك الربط'); }
    saveInbox(user.id, store);
    return NextResponse.json({ success: true });
  }

  if (action === 'config') {
    const groupIds = new Set(wa.getUserGroups().filter((group) => group.isGroup).map((group) => group.id));
    const sourceGroupIds = Array.isArray(body.sourceGroupIds)
      ? body.sourceGroupIds.filter((id): id is string => typeof id === 'string' && groupIds.has(id)) : [];
    const receivedGroupId = String(body.receivedGroupId || '');
    const uploadedGroupId = String(body.uploadedGroupId || '');
    if (!sourceGroupIds.length || !groupIds.has(receivedGroupId)) return bad('حدد قروبي المصدر وقروب تم الاستلام');
    if (sourceGroupIds.includes(receivedGroupId)) return bad('قروب تم الاستلام لا يمكن أن يكون مصدرًا');
    if (uploadedGroupId && !groupIds.has(uploadedGroupId)) return bad('قروب الرفع غير موجود');
    store.config = { sourceGroupIds, receivedGroupId, uploadedGroupId };
    saveInbox(user.id, store);
    syncInbox(user.id, wa);
    catchUpRecentGroups(user.id, wa);
    void retryPending(user.id, wa);
    return NextResponse.json({ success: true });
  }

  if (action === 'receive_receipt') {
    if (!receipt) return bad('الوصل غير موجود', 404);
    receipt.receivedPending = true;
    saveInbox(user.id, store);
    return NextResponse.json({ success: true });
  }

  if (action === 'ignore_receipt' || action === 'restore_receipt') {
    if (!receipt) return bad('الوصل غير موجود', 404);
    receipt.ignored = action === 'ignore_receipt';
    saveInbox(user.id, store);
    return NextResponse.json({ success: true });
  }

  if (action === 'receipt_name') {
    if (!receipt) return bad('الوصل غير موجود', 404);
    receipt.matchedName = String(body.name || '').trim().slice(0, 120);
    saveInbox(user.id, store);
    return NextResponse.json({ success: true });
  }

  if (action === 'read_receipt') {
    if (!receipt) return bad('الوصل غير موجود', 404);
    try { await recognizeReceipt(user.id, receipt.id); return NextResponse.json({ success: true }); }
    catch (error) { return bad(error instanceof Error ? error.message : 'تعذر قراءة الصورة', 500); }
  }

  if (action === 'receive_card') {
    if (!card) return bad('الحوالة غير موجودة', 404);
    if (card.status === 'duplicate' || card.status === 'not_mine') return bad('أعد الحوالة إلى القائمة أولًا');
    if (card.status !== 'received') queueReceived(card);
    if (!store.config.receivedGroupId && card.delivery === 'queued') card.delivery = 'needs_review';
    const siblings = Object.values(store.cards).filter((item) => item.sourceMessageId === card.sourceMessageId && item.status !== 'duplicate');
    if (siblings.every((item) => item.status === 'received')) wa.updateMessageStatus(card.sourceMessageId, { isReceived: true });
    saveInbox(user.id, store);
    if (card.delivery === 'queued') await dispatchCard(user.id, wa, card.id);
    return NextResponse.json({ success: true });
  }

  if (action === 'not_mine' || action === 'restore' || action === 'show_duplicate') {
    if (!card) return bad('الحوالة غير موجودة', 404);
    if (card.delivery === 'sent') return bad('الحوالة مرسلة بالفعل إلى قروب تم الاستلام');
    card.status = action === 'not_mine' ? 'not_mine' : (!card.email || !card.name ? 'review' : 'new');
    if (action === 'show_duplicate') card.duplicateOf = undefined;
    saveInbox(user.id, store);
    return NextResponse.json({ success: true });
  }

  if (action === 'edit') {
    if (!card) return bad('الحوالة غير موجودة', 404);
    if (card.delivery === 'sent' || card.delivery === 'sending') return bad('هذه النسخة أُرسلت بالفعل؛ لا يمكن تغيير النص المرسل');
    const name = String(body.name || '').trim().slice(0, 160);
    const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
    const draftText = String(body.draftText || '').trim().slice(0, 10000);
    const amount = body.amount === '' || body.amount == null ? null : Number(body.amount);
    if (!draftText || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || (amount !== null && (!Number.isFinite(amount) || amount < 0))) return bad('راجع النص والإيميل والمبلغ');
    let correctedText = draftText;
    if (card.email && email !== card.email && correctedText.includes(card.email)) correctedText = correctedText.replaceAll(card.email, email);
    if (card.name && name !== card.name && correctedText.includes(card.name)) correctedText = correctedText.replaceAll(card.name, name);
    if (email && !correctedText.toLowerCase().includes(email)) correctedText += `\nالبريد الإلكتروني للمشترك: ${email}`;
    if (name && !correctedText.includes(name)) correctedText += `\nاسم المشترك: ${name}`;
    if (amount !== null && amount !== card.amount) {
      const oldAmount = card.amount === null ? '' : String(card.amount).replace('.', '[.,]');
      const currencyAfter = '(?=\\s*(?:دينار|jod|دولار|usd|شيكل|ils|ريال|sar|درهم|aed|يورو|eur)(?![\\p{L}]))';
      const oldAmountPattern = oldAmount ? new RegExp(`(?<![\\d])${oldAmount}${currencyAfter}`, 'iu') : null;
      if (oldAmountPattern?.test(correctedText)) correctedText = correctedText.replace(oldAmountPattern, String(amount));
      else correctedText += `\nالمبلغ لهذا المتدرب: ${amount} ${card.currency}`;
    }
    card.name = name; card.email = email; card.amount = amount; card.draftText = correctedText;
    if (card.status === 'review' && name && email) card.status = 'new';
    if (card.delivery === 'needs_review' && name && email) card.deliveryError = undefined;
    saveInbox(user.id, store);
    return NextResponse.json({ success: true });
  }

  if (action === 'link') {
    if (!card || !receipt) return bad('الحوالة أو الوصل غير موجود', 404);
    if (receipt.ignored) return bad('هذه الصورة مخفية وليست وصلًا');
    if (card.chatJid !== receipt.chatJid) return bad('الوصل والحوالة من قروبين مختلفين');
    if (receipt.linkedCardIds.some((id) => store.cards[id] && store.cards[id].sourceMessageId !== card.sourceMessageId)) return bad('الوصل مربوط بحوالة أخرى؛ فك الربط أولًا');
    if (!receipt.mediaUrl) return bad('صورة الوصل لم تُحمّل بعد');
    const siblings: InboxCard[] = Object.values(store.cards).filter((item) =>
      item.sourceMessageId === card.sourceMessageId && item.status !== 'duplicate' && item.status !== 'not_mine');
    for (const item of siblings) {
      const hadReceipt = item.receiptMessageId;
      item.receiptMessageId = receipt.id;
      item.autoLinkSuppressed = false;
      if (!receipt.linkedCardIds.includes(item.id)) receipt.linkedCardIds.push(item.id);
      if (receipt.receivedPending && item.status !== 'received') {
        queueReceived(item);
        if (!store.config.receivedGroupId && item.delivery === 'queued') item.delivery = 'needs_review';
      }
      if (item.delivery === 'sent' && hadReceipt !== receipt.id) item.receiptFollowup = 'queued';
    }
    if (siblings.every((item) => item.status === 'received')) wa.updateMessageStatus(card.sourceMessageId, { isReceived: true });
    wa.updateMessageStatus(card.sourceMessageId, { linkedReceiptUrl: receipt.mediaUrl, linkedMsgId: receipt.id, autoLinkSuppressed: false });
    saveInbox(user.id, store);
    for (const item of siblings) if (item.delivery === 'queued') await dispatchCard(user.id, wa, item.id);
    for (const item of siblings) if (item.receiptFollowup === 'queued') await dispatchReceiptFollowup(user.id, wa, item.id);
    return NextResponse.json({ success: true });
  }

  if (action === 'unlink') {
    if (!card?.receiptMessageId) return bad('لا يوجد وصل مرتبط');
    const old = store.receipts[card.receiptMessageId];
    const siblings = Object.values(store.cards).filter((item) => item.sourceMessageId === card.sourceMessageId);
    for (const item of siblings) { item.receiptMessageId = undefined; item.autoLinkSuppressed = true; }
    if (old) old.linkedCardIds = old.linkedCardIds.filter((id) => !siblings.some((item) => item.id === id));
    wa.updateMessageStatus(card.sourceMessageId, { linkedReceiptUrl: null, linkedMsgId: null, autoLinkSuppressed: true });
    saveInbox(user.id, store);
    return NextResponse.json({ success: true });
  }

  if (action === 'confirm_send' || action === 'retry_send') {
    if (!card || card.status !== 'received') return bad('علّم الحوالة تم الاستلام أولًا');
    if (!card.name || !card.email) return bad('أكمل بيانات المتدرب');
    if (!store.config.receivedGroupId) return bad('احفظ قروب تم الاستلام في إعدادات الوارد أولًا');
    if (action === 'confirm_send' && card.delivery !== 'needs_review') return bad('هذه الحوالة لا تنتظر مراجعة');
    if (action === 'retry_send' && card.delivery !== 'failed') return bad('هذه الحوالة لا تحتاج إعادة إرسال');
    card.delivery = 'queued';
    saveInbox(user.id, store);
    await dispatchCard(user.id, wa, card.id);
    const delivery = loadInbox(user.id).cards[card.id];
    if (delivery?.delivery !== 'sent') return bad(delivery?.deliveryError || 'لم يكتمل الإرسال؛ راجع حالة الحوالة', 502);
    return NextResponse.json({ success: true });
  }

  if (action === 'retry_receipt') {
    if (!card || card.receiptFollowup !== 'failed') return bad('الوصل لا يحتاج إعادة إرسال');
    card.receiptFollowup = 'queued';
    saveInbox(user.id, store);
    await dispatchReceiptFollowup(user.id, wa, card.id);
    return NextResponse.json({ success: true });
  }

  return bad('إجراء غير معروف');
}
