import { randomUUID } from 'crypto';
import type { WhatsAppManager } from './whatsapp-client';
import { allocationMessageText, readNumberCenter, saveNumberCenter, type NumberDispatch } from './number-center';

const activeUsers = new Set<string>();
const SEND_GAP_MS = 15_000;

export const isNumberDispatchActive = (userId: string) => activeUsers.has(userId);

export function startNumberDispatch(userId: string, batchId: string): NumberDispatch {
  const data = readNumberCenter(userId);
  const allocations = data.allocations.filter((item) => item.batchId === batchId);
  if (!allocations.length) throw new Error('دفعة الحجز غير موجودة');
  if (activeUsers.has(userId) && !data.dispatches.some((item) => item.batchId === batchId && item.status === 'running')) {
    throw new Error('الإرسال السابق يتوقف الآن. حاول بعد قليل.');
  }
  if (allocations.some((item) => !/@(s\.whatsapp\.net|lid)$/.test(item.personJid) || !item.numbers.length || allocationMessageText(item).length > 4096)) {
    throw new Error('توجد رسالة أو جهة اتصال غير صالحة في هذه الدفعة');
  }
  const otherRunning = data.dispatches.find((item) => item.status === 'running' && item.batchId !== batchId);
  if (otherRunning) throw new Error('يوجد إرسال آخر قيد التنفيذ. انتظر اكتماله أولًا.');
  let dispatch = data.dispatches.find((item) => item.batchId === batchId);
  if (dispatch) {
    if (dispatch.status === 'paused') dispatch.status = 'running';
    else if (dispatch.status !== 'running') throw new Error('أُرسلت هذه الدفعة أو أُلغيت من قبل، ولن نكرر إرسالها');
  } else {
    dispatch = {
      id: randomUUID(), batchId, status: 'running', createdAt: new Date().toISOString(),
      items: allocations.map((item) => ({ allocationId: item.id, status: 'pending' })),
    };
    data.dispatches.unshift(dispatch);
  }
  saveNumberCenter(userId, data);
  return dispatch;
}

export function cancelNumberDispatch(userId: string, batchId: string): NumberDispatch {
  const data = readNumberCenter(userId);
  const dispatch = data.dispatches.find((item) => item.batchId === batchId);
  if (!dispatch || !['running', 'paused'].includes(dispatch.status)) throw new Error('لا يوجد إرسال جارٍ لهذه الدفعة');
  dispatch.status = 'canceled';
  saveNumberCenter(userId, data);
  return dispatch;
}

export async function runNumberDispatch(userId: string, batchId: string, wa: WhatsAppManager): Promise<void> {
  if (activeUsers.has(userId)) return;
  activeUsers.add(userId);
  try {
    while (true) {
      let data = readNumberCenter(userId);
      let dispatch = data.dispatches.find((item) => item.batchId === batchId);
      if (!dispatch || dispatch.status !== 'running') return;

      // A previous process stopped during an in-flight send. Do not retry it blindly.
      for (const item of dispatch.items.filter((entry) => entry.status === 'sending')) {
        item.status = 'uncertain';
        item.error = 'انقطع الخادم أثناء الإرسال؛ راجع المحادثة قبل إعادة المحاولة';
      }
      const next = dispatch.items.find((item) => item.status === 'pending');
      if (!next) {
        dispatch.status = 'completed';
        saveNumberCenter(userId, data);
        return;
      }
      if (wa.getStatus().status !== 'CONNECTED') {
        dispatch.status = 'paused';
        saveNumberCenter(userId, data);
        return;
      }
      const waitMs = Math.max(0, new Date(dispatch.nextSendAt || 0).getTime() - Date.now());
      if (waitMs) {
        saveNumberCenter(userId, data);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      const allocation = data.allocations.find((item) => item.id === next.allocationId);
      if (!allocation) {
        next.status = 'failed';
        next.error = 'تعذر العثور على نصيب هذا الشخص';
        saveNumberCenter(userId, data);
        continue;
      }
      next.status = 'sending';
      saveNumberCenter(userId, data);

      let result: { success: boolean; message: string };
      try {
        result = await wa.forwardMessage(allocation.personJid, allocationMessageText(allocation));
      } catch (error) {
        result = { success: false, message: error instanceof Error ? error.message : 'تعذر الإرسال' };
      }
      data = readNumberCenter(userId);
      dispatch = data.dispatches.find((item) => item.batchId === batchId);
      if (!dispatch) return;
      const current = dispatch.items.find((item) => item.allocationId === next.allocationId);
      if (!current) return;
      current.status = result.success ? 'sent' : 'failed';
      current.sentAt = result.success ? new Date().toISOString() : undefined;
      current.error = result.success ? undefined : result.message;
      dispatch.nextSendAt = new Date(Date.now() + SEND_GAP_MS).toISOString();
      saveNumberCenter(userId, data);
    }
  } finally {
    activeUsers.delete(userId);
  }
}
