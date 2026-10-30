// يعمل داخل سياق صفحة البوابة نفسها (MAIN world) للوصول إلى jQuery ومكتبة التقويم pickadate
// يستقبل التاريخ من content.js بصيغة yyyy/mm/dd
(function () {
  function setDate(y, m, d, attempt) {
    var el = document.getElementById('payment_date-37303');
    var $ = window.jQuery;
    var picker = el && $ && $.fn.pickadate ? $(el).pickadate('picker') : null;
    if (picker) {
      picker.set('select', [y, m - 1, d]);
      return;
    }
    // انتظار تهيئة التقويم (حتى 15 ثانية)
    if (attempt < 60) {
      setTimeout(function () { setDate(y, m, d, attempt + 1); }, 250);
    }
  }

  function handle(value) {
    var parts = String(value || '').split('/');
    if (parts.length !== 3) return;
    setDate(+parts[0], +parts[1], +parts[2], 0);
  }

  document.addEventListener('hawalat:set-date', function (e) {
    handle(e.detail);
  });

  // في حال أرسل content.js التاريخ قبل تحميل هذا الملف
  var pending = document.documentElement.getAttribute('data-hawalat-date');
  if (pending) handle(pending);

  // إغلاق نافذة الرفع عند فشل الإرفاق التلقائي
  document.addEventListener('hawalat:close-modal', function () {
    if (typeof window.um_remove_modal === 'function') window.um_remove_modal();
  });

  // تحديث حقول القوائم المنسدلة عبر jQuery و Select2 بأمان تام وبدون اختراق CSP
  document.addEventListener('hawalat:set-select', function (e) {
    try {
      var $ = window.jQuery;
      if ($ && e.detail && e.detail.selector) {
        var $sel = $(e.detail.selector);
        if ($sel.length) {
          $sel.val(e.detail.value).trigger('change');
        }
      }
    } catch (err) {}
  });

  // تحديث أزرار الاختيار (Radio buttons) عبر jQuery
  document.addEventListener('hawalat:set-radio', function (e) {
    try {
      var $ = window.jQuery;
      if ($ && e.detail && e.detail.name) {
        var $r = $('input[name="' + e.detail.name + '"][value="' + e.detail.value + '"]');
        if ($r.length) {
          $r.prop('checked', true).trigger('change');
        }
      }
    } catch (err) {}
  });

  // تحديد خانات الاختيار (Checkboxes) عبر jQuery
  document.addEventListener('hawalat:check-box', function (e) {
    try {
      var $ = window.jQuery;
      if ($ && e.detail && e.detail.name) {
        var $b = $('input[name="' + e.detail.name + '"]');
        if ($b.length) {
          $b.prop('checked', true).trigger('change');
        }
      }
    } catch (err) {}
  });

  // تسجيل رد سيرفر البوابة على رفع الصورة (لمعرفة سبب الفشل إن وُجد)
  function watchUploads() {
    var $ = window.jQuery;
    if (!$) return setTimeout(watchUploads, 250);
    $(document).on('ajaxComplete', function (_e, xhr, settings) {
      if (!settings || String(settings.url || '').indexOf('admin-ajax.php') === -1) return;
      var data = settings.data;
      var action = data && typeof data.get === 'function' ? data.get('action') : String(data || '');
      if (String(action).indexOf('um_fileupload') === -1) return;
      document.documentElement.setAttribute('data-hawalat-upload', JSON.stringify({
        status: xhr.status,
        text: String(xhr.responseText || '').slice(0, 300),
      }));
    });
  }
  watchUploads();
})();
