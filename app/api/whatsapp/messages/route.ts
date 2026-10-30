import { NextRequest, NextResponse } from 'next/server';
import { getWhatsAppManager, type ChatMessage } from '@/lib/whatsapp-client';
import { cleanPhoneNumber } from '@/lib/parser';
import { syncAirtableLikes } from '@/lib/airtable-reactions';

const recentMediaSends = new Map<string, Promise<{ success: boolean; message: string; messageId?: string }>>();

export async function GET(req: NextRequest) {
  const wa = getWhatsAppManager(req);

  // Fetch the original profile image only when the user opens its viewer.
  const avatarFull = req.nextUrl.searchParams.get('avatarFull');
  if (avatarFull) {
    if (!/^[0-9A-Za-z._:-]{1,128}@(s\.whatsapp\.net|g\.us|lid)$/.test(avatarFull)) {
      return NextResponse.json({ success: false, error: 'معرف صورة غير صالح' }, { status: 400 });
    }
    const fallbackPhone = wa.getUserGroups().find((group) => group.id === avatarFull)?.phone?.replace(/\D/g, '');
    const avatarDigits = (fallbackPhone || avatarFull.split('@')[0]).replace(/\D/g, '');
    if (!wa.canAccessAvatar(avatarDigits)) {
      return NextResponse.json({ success: false, error: 'الصورة غير موجودة' }, { status: 404 });
    }
    const avatarUrl = await wa.getProfilePicture(avatarFull, fallbackPhone, true);
    return NextResponse.json({ success: Boolean(avatarUrl), avatarUrl });
  }

  // معلومات رسالة واحدة: من استلمها ومن قرأها ومتى (نافذة Message info)
  const infoId = req.nextUrl.searchParams.get('info');
  if (infoId) {
    const info = await wa.getMessageInfo(infoId);
    if (!info) {
      return NextResponse.json({ success: false, error: 'الرسالة غير موجودة' }, { status: 404 });
    }
    return NextResponse.json({ success: true, info });
  }

  // هل الرقم مسجل على واتساب؟ (عند النقر على رقم جوال داخل رسالة)
  const checkPhone = req.nextUrl.searchParams.get('checkPhone');
  if (checkPhone) {
    const digits = cleanPhoneNumber(checkPhone);
    const result = await wa.checkOnWhatsApp(digits);
    return NextResponse.json({ success: true, phone: digits, ...result });
  }

  // بيانات المحادثة أو المجموعة الكاملة (الوسائط المشتركة، المشاركون، الوصف)
  const chatInfoTarget = req.nextUrl.searchParams.get('chatInfo');
  if (chatInfoTarget) {
    const chatInfo = await wa.getChatInfo(chatInfoTarget);
    return NextResponse.json({ success: true, chatInfo });
  }

  // أعضاء القروب لخاصية المنشن (@)
  const participantsOf = req.nextUrl.searchParams.get('participants');
  if (participantsOf) {
    const participants = await wa.getGroupParticipants(participantsOf);
    return NextResponse.json({ success: true, participants });
  }

  // جلب المجموعات فقط بسرعة فائقة دون تحميل كافة الرسائل (يستخدم في النوافذ المنبثقة)
  if (req.nextUrl.searchParams.get('onlyGroups') === 'true') {
    const groups = wa.getUserGroups();
    return NextResponse.json({ success: true, groups });
  }

  const chatMessages = req.nextUrl.searchParams.get('chatMessages');
  if (chatMessages && chatMessages.length <= 256) {
    const group = wa.getUserGroups().find((item) => item.id === chatMessages || item.name === chatMessages);
    const targetName = (group?.name || chatMessages).trim();
    const targetJid = group?.id || (chatMessages.includes('@') ? chatMessages : '');
    const canonicalTargetJid = targetJid ? wa.getCanonicalChatJid(targetJid) : '';
    const matchingMessages = wa.getMessages()
      .filter((message) => canonicalTargetJid
        ? (message.chatJid && wa.getCanonicalChatJid(message.chatJid) === canonicalTargetJid) || (!message.chatJid && message.chatName?.trim() === targetName)
        : message.chatName?.trim() === targetName);
    const messages = wa.toClientMessages(matchingMessages);
    return NextResponse.json({ success: true, messages, partial: true });
  }

  if (wa.getStatus().status === 'CONNECTED') {
    wa.flushPendingMessages().catch(() => {});
  }
  const snapshotAt = Date.now();
  if (req.nextUrl.searchParams.get('overview') === 'true') {
    const latestByChat = new Map<string, ChatMessage>();
    for (const message of wa.getMessages()) {
      const key = message.chatJid ? wa.getCanonicalChatJid(message.chatJid) : message.chatName;
      if (!key) continue;
      const previous = latestByChat.get(key);
      if (!previous || (message.timestampMs || 0) > (previous.timestampMs || 0)) latestByChat.set(key, message);
    }
    return NextResponse.json({
      success: true,
      messages: wa.toClientMessages(Array.from(latestByChat.values())),
      groups: wa.getUserGroups(),
      snapshotAt,
      partial: true,
    });
  }
  const sinceParam = req.nextUrl.searchParams.get('since');
  const since = sinceParam && /^\d+$/.test(sinceParam) ? Number(sinceParam) : null;
  const partial = since !== null && Number.isSafeInteger(since) && since > 0 && since <= snapshotAt;
  const messages = partial
    ? wa.toClientMessages(wa.getMessages().filter((message) => !message.timestampMs || message.timestampMs >= since))
    : wa.getClientMessages();
  const groups = wa.getUserGroups();
  const status = wa.getStatus();
  return NextResponse.json({ success: true, messages, groups, status, snapshotAt, partial });
}

export async function POST(req: NextRequest) {
  try {
    const wa = getWhatsAppManager(req);
    const body = await req.json();
    const { action, message } = body;

    if (action === 'sync_airtable_likes') {
      const result = await syncAirtableLikes(wa);
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'send_media' && body.fileBase64 && (body.chat || body.chatJid || body.chatName)) {
      const targetChat = body.chat || body.chatJid || body.chatName;
      const clientRequestId = typeof body.clientRequestId === 'string' && body.clientRequestId.length < 128
        ? body.clientRequestId : '';
      let sendPromise = clientRequestId ? recentMediaSends.get(clientRequestId) : undefined;
      if (!sendPromise) {
        sendPromise = wa.sendMediaMessage(targetChat, {
          fileBase64: body.fileBase64,
          mediaType: body.mediaType || 'image',
          fileName: body.fileName,
          mimetype: body.mimetype,
          caption: body.caption,
          quotedMsgId: body.quotedMsgId || body.quotedMessage?.id,
          quotedPayload: body.quotedPayload || body.quotedMessage,
          clientRequestId: clientRequestId || undefined,
        });
        if (clientRequestId) {
          recentMediaSends.set(clientRequestId, sendPromise);
          const currentPromise = sendPromise;
          void currentPromise.then((result) => {
            if (!result.success && recentMediaSends.get(clientRequestId) === currentPromise) {
              recentMediaSends.delete(clientRequestId);
            }
          }, () => {
            if (recentMediaSends.get(clientRequestId) === currentPromise) recentMediaSends.delete(clientRequestId);
          });
          setTimeout(() => {
            if (recentMediaSends.get(clientRequestId) === currentPromise) recentMediaSends.delete(clientRequestId);
          }, 30 * 60 * 1000).unref();
        }
      }
      const res = await sendPromise;

      // رفع الصور من الهاتف قد يستغرق وقتاً؛ لا نعيد سجل المحادثات كله مع رد الإرسال.
      const sentMessage = res.messageId
        ? wa.getMessages().find((item) => item.id === res.messageId)
        : undefined;

      return NextResponse.json({
        success: res.success,
        messageId: res.messageId,
        ...(body.compactResponse
          ? { sentMessage: sentMessage ? wa.toClientMessage(sentMessage) : null }
          : { messages: wa.getClientMessages() }),
        message: res.message,
      });
    }

    if (action === 'add' && message) {
      const isConnected = wa.getStatus().status === 'CONNECTED';
      const targetChat = message.chatJid || message.chatName;

      if (isConnected && targetChat && (message.text || message.mediaUrl || message.mediaData)) {
        if (message.mediaData?.fileBase64) {
          const res = await wa.sendMediaMessage(targetChat, {
            fileBase64: message.mediaData.fileBase64,
            mediaType: message.mediaData.mediaType || message.mediaType || 'image',
            fileName: message.mediaData.fileName || message.fileName,
            mimetype: message.mediaData.mimetype,
            caption: message.text || message.mediaData.caption,
            quotedMsgId: message.quotedMessage?.id,
            quotedPayload: message.quotedMessage,
          });
          return NextResponse.json({
            success: res.success,
            messageId: res.messageId,
            messages: wa.getClientMessages(),
            message: res.message,
          });
        }

        // إرسال الرسالة عبر جلسة واتساب المباشرة دون إنشاء نسخة وهمية مكررة
        const res = await wa.forwardMessage(
          targetChat,
          message.text || '',
          message.mediaUrl,
          message.quotedMessage?.id,
          message.quotedMessage,
          undefined,
          Array.isArray(message.mentions) ? message.mentions.filter((m: unknown) => typeof m === 'string') : undefined
        );
        return NextResponse.json({
          success: res.success,
          messageId: res.messageId,
          messages: wa.getClientMessages(),
          message: res.message,
        });
      } else {
        wa.addMessage(message);
        return NextResponse.json({
          success: true,
          messages: wa.getClientMessages(),
          message: 'تمت إضافة الرسالة بنجاح.'
        });
      }
    }

    if (action === 'edit' && (body.id || body.messageId) && (body.text || body.newText)) {
      const msgId = body.id || body.messageId;
      const text = body.text || body.newText;
      const mentions = Array.isArray(body.mentions) ? body.mentions.filter((m: unknown) => typeof m === 'string') : undefined;
      const res = await wa.editMessage(msgId, text, mentions);
      return NextResponse.json({
        success: res.success,
        message: res.message,
        messages: wa.getClientMessages(),
      });
    }

    if (action === 'delete_whatsapp' && (body.id || body.messageId)) {
      const msgId = body.id || body.messageId;
      const forEveryone = body.forEveryone ?? true;
      const res = await wa.deleteWhatsAppMessage(msgId, forEveryone);
      return NextResponse.json({
        success: res.success,
        message: res.message,
        messages: wa.getClientMessages(),
      });
    }

    if (action === 'retry_message' && (body.id || body.messageId)) {
      const msgId = body.id || body.messageId;
      const res = await wa.retryPendingMessage(msgId);
      return NextResponse.json({
        success: res.success,
        message: res.message,
        messages: wa.getClientMessages(),
      });
    }

    if (action === 'react' && (body.id || body.messageId)) {
      const msgId = body.id || body.messageId;
      const emoji = typeof body.emoji === 'string' ? body.emoji : '';
      const chat = body.chat || body.chatJid || body.chatName;
      const res = await wa.reactToMessage(chat, msgId, emoji);
      return NextResponse.json({
        success: res.success,
        message: res.message,
        reactions: res.reactions,
        messages: wa.getClientMessages(),
      });
    }

    if (action === 'sync_reactions' && (body.chat || body.chatJid || body.chatName)) {
      const targetChat = body.chat || body.chatJid || body.chatName;
      const res = await wa.syncChatReactions(targetChat);
      return NextResponse.json({
        success: res.success,
        message: res.message,
        messages: wa.getClientMessages(),
      });
    }

    if (action === 'start_direct_chat' && (body.phone || body.phoneNumber)) {
      const phoneInput = body.phone || body.phoneNumber;
      const chat = wa.startDirectChat(phoneInput, body.name);
      return NextResponse.json({
        success: true,
        chat,
        groups: wa.getUserGroups(),
        message: `تم فتح محادثة مع ${chat.name} بنجاح.`
      });
    }

    if (action === 'archive_chat' && (body.id || body.chatId || body.chatName || body.chat)) {
      const target = body.id || body.chatId || body.chatName || body.chat;
      const archive = body.archive !== undefined ? Boolean(body.archive) : true;
      const success = await wa.archiveChat(target, archive);
      return NextResponse.json({
        success,
        groups: wa.getUserGroups(),
        message: archive ? 'تمت أرشفة المحادثة بنجاح.' : 'تم إلغاء أرشفة المحادثة بنجاح.',
      });
    }

    if (action === 'rename_chat' && (body.id || body.chatId || body.chatName) && body.name) {
      const target = body.id || body.chatId || body.chatName;
      const success = wa.renameChat(target, body.name);
      return NextResponse.json({
        success,
        groups: wa.getUserGroups(),
        message: success ? `تم تعديل الاسم إلى "${body.name}" بنجاح.` : 'تعذر العثور على المحادثة.'
      });
    }

    if (action === 'mark_chat_read' && (body.chat || body.chatName)) {
      const chatTarget = body.chat || body.chatName;
      wa.markChatAsRead(chatTarget);
      return NextResponse.json({
        success: true,
        messages: wa.getClientMessages(),
        groups: wa.getUserGroups(),
        message: `تم تحديد محادثة ${chatTarget} كمقروءة بنجاح.`
      });
    }

    if (action === 'clear_chat' && (body.chat || body.chatJid || body.chatName)) {
      const target = body.chat || body.chatJid || body.chatName;
      const res = await wa.clearChatMessages(target);
      return NextResponse.json({
        success: res.success,
        clearedCount: res.clearedCount,
        message: res.message,
        messages: wa.getClientMessages(),
      });
    }

    if (action === 'exit_group' && (body.chat || body.chatJid || body.chatName)) {
      const target = body.chat || body.chatJid || body.chatName;
      const res = await wa.exitGroup(target);
      return NextResponse.json({
        success: res.success,
        message: res.message,
        groups: wa.getUserGroups(),
        messages: wa.getClientMessages(),
      });
    }

    if (action === 'update_group_desc' && (body.chat || body.chatJid || body.chatName)) {
      const target = body.chat || body.chatJid || body.chatName;
      const desc = body.description ?? '';
      const res = await wa.updateGroupDescription(target, desc);
      return NextResponse.json({
        success: res.success,
        message: res.message,
      });
    }

    if (action === 'clear_demo') {
      const removed = wa.clearDemoMessages();
      return NextResponse.json({
        success: true,
        removed,
        messages: wa.getClientMessages(),
        message: `تم حذف ${removed} من الرسائل التجريبية بنجاح.`
      });
    }

    if (action === 'clear_all') {
      wa.clearAllMessages();
      return NextResponse.json({
        success: true,
        messages: [],
        message: 'تم إفراغ كافة الرسائل بنجاح.'
      });
    }

    if (action === 'sync') {
      const groups = await wa.syncGroups(true);
      wa.syncAvatars().catch(() => {});
      return NextResponse.json({
        success: true,
        groups,
        archiveSyncError: wa.lastArchiveSyncError,
        archiveSyncStatus: wa.lastArchiveSyncStatus,
        messages: wa.getClientMessages(),
        message: `تم تحديث المجموعات والمحادثات بنجاح (${groups.length} محادثة ومجموعة).`
      });
    }

    if (action === 'sync_avatars') {
      const result = await wa.syncAvatars();
      return NextResponse.json({
        success: true,
        total: result.total,
        downloaded: result.downloaded,
        groups: wa.getUserGroups(),
        message: `تم تحديث وتنزيل صور البروفايل بنجاح (${result.downloaded} صورة جديدة).`
      });
    }

    if (action === 'sanitize') {
      wa.syncStoredContacts();
      wa.sanitizeUserGroupsAndMessages();
      wa.persistDataImmediate();
      return NextResponse.json({
        success: true,
        groups: wa.getUserGroups(),
        messages: wa.getClientMessages(),
        message: 'تم فك تشفير وتنسيق كافة الأرقام والأسماء بنجاح.'
      });
    }

    if (action === 'fetch_history' && (body.chatJid || body.chatName)) {
      const targetJid = body.chatJid || body.chatName;
      const result = await wa.fetchChatHistory(targetJid, body.count || 50);
      return NextResponse.json({
        success: result.success,
        messages: wa.getClientMessages(),
        message: result.message
      });
    }

    if (action === 'reset') {
      wa.resetSampleMessages();
      return NextResponse.json({
        success: true,
        messages: wa.getClientMessages(),
        message: 'تمت إعادة تعيين الرسائل التجريبية.'
      });
    }

    if (action === 'download_media' && body.id) {
      const msg = wa.getMessages().find((m) => m.id === body.id);
      if (msg?.rawBaileysMessage) {
        const mediaUrl = await wa.downloadMediaInBackground(
          msg.id,
          msg.rawBaileysMessage,
          msg.rawBaileysMessage.message
        );
        return NextResponse.json({
          success: Boolean(mediaUrl),
          mediaUrl,
          message: mediaUrl ? 'تم تنزيل الصورة بنجاح.' : 'تعذر تنزيل الصورة (ربما انتهت صلاحية الرابط على خوادم واتساب لكونها قديمة).',
        });
      }
      return NextResponse.json({ success: false, message: 'الرسالة غير موجودة أو لا تحتوي على وسائط.' });
    }

    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const wa = getWhatsAppManager(req);
    const { id, updates } = await req.json();
    if (!id || !updates) {
      return NextResponse.json({ error: 'المعرف والتحديثات مطلوبة' }, { status: 400 });
    }

    wa.updateMessageStatus(id, updates);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const wa = getWhatsAppManager(req);
    const body = await req.json();
    const { id, ids, clearDemo, clearAll } = body;

    if (clearDemo) {
      const removed = wa.clearDemoMessages();
      return NextResponse.json({ success: true, removed, message: `تم حذف ${removed} رسائل تجريبية` });
    }

    if (clearAll) {
      wa.clearAllMessages();
      return NextResponse.json({ success: true, message: 'تم إفراغ كافة الرسائل بنجاح' });
    }

    if (id) {
      const deleted = wa.deleteMessage(id);
      return NextResponse.json({ success: deleted, message: 'تم حذف الرسالة بنجاح' });
    }

    if (Array.isArray(ids) && ids.length > 0) {
      const count = wa.deleteMessages(ids);
      return NextResponse.json({ success: true, count, message: `تم حذف ${count} رسائل بنجاح` });
    }

    return NextResponse.json({ error: 'المعرف أو قائمة المعرفات مطلوبة للحذف' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
