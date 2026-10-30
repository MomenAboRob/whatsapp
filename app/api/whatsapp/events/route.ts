export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import { getWhatsAppManager } from '@/lib/whatsapp-client';

export async function GET(request: NextRequest) {
  const wa = getWhatsAppManager(request);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;

      const sendEvent = (event: string, data: any) => {
        if (isClosed) return;
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          cleanup();
        }
      };

      // 1. إرسال حدث المصافحة والاتصال الأولي (Handshake) مع حالة الجلسة اللحظية للمستخدم
      sendEvent('init', {
        connectedAt: Date.now(),
        status: wa.getStatus(),
      });

      // 2. مستمعات الأحداث الحية من محرك Baileys الخاص بالمستخدم
      const onMessage = (msg: any) => sendEvent('message', msg?.id ? wa.toClientMessage(msg) : msg);
      const onReceipt = (receipt: any) => sendEvent('receipt', receipt);
      const onReaction = (reaction: any) => sendEvent('reaction', reaction);
      const onMedia = (media: any) => sendEvent('media', media);
      const onMessageUpdate = (update: any) => sendEvent('message_update', update);
      const onStatus = (status: any) => sendEvent('status', status);
      const onGroups = (groups: any) => sendEvent('groups', groups);
      const onPresence = (presence: any) => sendEvent('presence', presence);

      wa.events.on('message', onMessage);
      wa.events.on('receipt', onReceipt);
      wa.events.on('reaction', onReaction);
      wa.events.on('media', onMedia);
      wa.events.on('message_update', onMessageUpdate);
      wa.events.on('status', onStatus);
      wa.events.on('groups', onGroups);
      wa.events.on('presence', onPresence);

      // 3. نبضات الحفاظ على الاتصال (Keep-Alive Ping) كل 15 ثانية لمنع انقطاع البروكسي أو المتصفح
      const heartbeatTimer = setInterval(() => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          cleanup();
        }
      }, 15000);

      // 4. دالة التنظيف عند قطع اتصال العميل أو إغلاق التبويب
      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        clearInterval(heartbeatTimer);
        wa.events.off('message', onMessage);
        wa.events.off('receipt', onReceipt);
        wa.events.off('reaction', onReaction);
        wa.events.off('media', onMedia);
        wa.events.off('message_update', onMessageUpdate);
        wa.events.off('status', onStatus);
        wa.events.off('groups', onGroups);
        wa.events.off('presence', onPresence);
        try {
          controller.close();
        } catch {}
      };

      request.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform, must-revalidate',
      'Connection': 'keep-alive',
      'Content-Encoding': 'none',
      'X-Accel-Buffering': 'no',
    },
  });
}
