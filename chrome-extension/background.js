// تحديث شارة الإضافة (Badge) في شريط المتصفح حسب حالة التفعيل
function updateBadge(isEnabled) {
  if (!chrome.action || !chrome.action.setBadgeText) return;
  if (isEnabled) {
    chrome.action.setBadgeText({ text: '' });
  } else {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  }
}

// تهيئة الحالة الأولية عند التثبيت أو بدء التشغيل
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['extensionEnabled'], (res) => {
    const isEnabled = res.extensionEnabled !== false;
    if (res.extensionEnabled === undefined) {
      chrome.storage.local.set({ extensionEnabled: true, showDock: true, submitGuard: true });
    }
    updateBadge(isEnabled);
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['extensionEnabled'], (res) => {
    updateBadge(res.extensionEnabled !== false);
  });
});

// الاستماع لتغييرات الإعدادات
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && 'extensionEnabled' in changes) {
    updateBadge(changes.extensionEnabled.newValue !== false);
  }
});

// خلفية الإضافة الذكية V2.7: الاتصال بسيرفر الحوالات وتخطي قيود CORS و Mixed Content
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;

  // 1. جلب صورة برابط أو من مسار محلي
  if (msg.type === 'fetch-image') {
    if (typeof msg.url !== 'string') {
      sendResponse({ ok: false, error: 'رابط غير صالح' });
      return;
    }

    if (msg.url.startsWith('data:')) {
      sendResponse({ ok: true, dataUrl: msg.url });
      return;
    }

    (async () => {
      try {
        const res = await fetch(msg.url, { cache: 'no-store' }).catch(() => null);
        if (!res || !res.ok) {
          sendResponse({ ok: false, error: 'تعذر جلب الصورة' });
          return;
        }

        const bytes = new Uint8Array(await res.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        const type = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
        sendResponse({ ok: true, dataUrl: `data:${type};base64,${btoa(binary)}` });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  // 2. جلب بيانات الحوالة المعلقة من السيرفر المحلي عبر Service Worker بدون حظر Mixed Content
  if (msg.type === 'fetch-pending') {
    (async () => {
      try {
        const res = await fetch('http://localhost:3010/api/portal/pending', { cache: 'no-store' }).catch(() => null);
        if (res && res.ok) {
          const data = await res.json().catch(() => null);
          if (data) {
            sendResponse({ ok: true, data });
            return;
          }
        }
        sendResponse({ ok: false, error: 'لم يتم العثور على بيانات معلقة' });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  // 3. جلب ملف إيصال الوصل الأخير من السيرفر المحلي
  if (msg.type === 'fetch-receipt-raw') {
    (async () => {
      try {
        const res = await fetch('http://localhost:3010/api/portal/receipt', { cache: 'no-store' }).catch(() => null);
        if (res && res.ok) {
          const arrayBuffer = await res.arrayBuffer().catch(() => null);
          if (arrayBuffer && arrayBuffer.byteLength > 100) {
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i += 0x8000) {
              binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
            }
            const type = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
            sendResponse({ ok: true, dataUrl: `data:${type};base64,${btoa(binary)}`, type });
            return;
          }
        }
        sendResponse({ ok: false, error: 'لا يوجد وصل متاح' });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }
});
