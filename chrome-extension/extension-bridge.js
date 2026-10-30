// جسر التواصل بين إضافة كروم وموقع نظام الحوالات
(function () {
  const VERSION = chrome.runtime.getManifest().version;

  function announcePresence() {
    try {
      document.documentElement.setAttribute('data-hawalat-extension-installed', 'true');
      document.documentElement.setAttribute('data-hawalat-extension-version', VERSION);

      // بث حدث مخصص للمتصفح
      window.dispatchEvent(
        new CustomEvent('hawalat-extension-installed', {
          detail: { version: VERSION, installed: true },
        })
      );
    } catch {}
  }

  announcePresence();

  // الرد على أي استعلام من الموقع
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'HAWALAT_EXTENSION_PING') {
      announcePresence();
      window.postMessage(
        {
          type: 'HAWALAT_EXTENSION_PONG',
          version: VERSION,
          installed: true,
        },
        '*'
      );
    }
  });

  // إعادة الإعلان عند اكتمال تحميل الصفحة
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', announcePresence);
  }
})();
