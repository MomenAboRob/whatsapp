'use client';

import React, { useState, useEffect } from 'react';
import { Puzzle, Download, HelpCircle, X, CheckCircle, ExternalLink, ShieldCheck } from 'lucide-react';

export function ExtensionDetectorBanner() {
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(true); // نبدأ بـ true حتى نتأكد من البيئة
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  useEffect(() => {
    // 1. استثناء أجهزة الجوال والألواح الذكية لأنها لا تدعم إضافات Chrome
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      setIsInstalled(true); // لا نعرض التنبيه على الجوال
      return;
    }

    // 2. فحص إن كان المستخدم قد أخفى التنبيه سابقاً
    const dismissed = localStorage.getItem('hawalat_ext_banner_dismissed') === 'true';
    if (dismissed) {
      setIsDismissed(true);
    } else {
      setIsDismissed(false);
    }

    // 3. فحص مبدئي سريع
    const checkInstalled = () => {
      const hasAttr = document.documentElement.getAttribute('data-hawalat-extension-installed') === 'true';
      if (hasAttr) {
        setIsInstalled(true);
        return true;
      }
      return false;
    };

    if (checkInstalled()) return;

    // 4. إرسال Ping للإضافة والاستماع للرد
    const handlePong = (event: MessageEvent) => {
      if (event.data && event.data.type === 'HAWALAT_EXTENSION_PONG') {
        setIsInstalled(true);
      }
    };

    const handleCustomEvent = () => {
      setIsInstalled(true);
    };

    window.addEventListener('message', handlePong);
    window.addEventListener('hawalat-extension-installed', handleCustomEvent);

    // إرسال طلب فحص
    window.postMessage({ type: 'HAWALAT_EXTENSION_PING' }, '*');

    // مهلة 1.2 ثانية للتأكد التام قبل إظهار التنبيه
    const timer = setTimeout(() => {
      if (!checkInstalled()) {
        setIsInstalled(false);
      }
    }, 1200);

    return () => {
      window.removeEventListener('message', handlePong);
      window.removeEventListener('hawalat-extension-installed', handleCustomEvent);
      clearTimeout(timer);
    };
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      localStorage.setItem('hawalat_ext_banner_dismissed', 'true');
    } catch {}
  };

  const copyExtensionsUrl = () => {
    navigator.clipboard.writeText('chrome://extensions');
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // إذا كانت الإضافة مثبتة أو تم إخفاء التنبيه أو ما زال الفحص جارياً
  if (isInstalled !== false || isDismissed) {
    return null;
  }

  return (
    <>
      {/* الشريط العلوي التنبيهي */}
      <aside aria-label="تنبيه إضافة المتصفح" className="relative z-40 bg-gradient-to-r from-emerald-950/80 via-slate-900/90 to-cyan-950/80 backdrop-blur-md border-b border-emerald-500/30 text-slate-100 px-4 py-2.5 shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs md:text-sm">
          {/* الجانب الأيمن: الأيقونة والنص */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0 text-emerald-400 shadow-sm">
              <Puzzle className="w-4 h-4 animate-pulse" />
            </div>
            <div className="leading-tight">
              <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                <span>إضافة المتصفح (مساعد عقليات) غير مثبتة على هذا الجهاز</span>
                <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                  موصى بها
                </span>
              </div>
              <p className="text-[11px] md:text-xs text-slate-300 mt-0.5">
                تتيح لك تعبئة بيانات المتدربين وسحب صورة الوصل وسكرين شوت الرسالة تلقائياً بنقرة واحدة داخل بوابة عقليات.
              </p>
            </div>
          </div>

          {/* الجانب الأيسر: الأزرار */}
          <div className="flex items-center gap-2 shrink-0 mr-auto">
            <a
              href="/aqleeat-extension.zip"
              download="aqleeat-extension.zip"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-md shadow-emerald-900/40"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تحميل الإضافة (ZIP)</span>
            </a>

            <button
              onClick={() => setShowGuideModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
              <span>طريقة التثبيت</span>
            </button>

            <button
              onClick={handleDismiss}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
              title="إخفاء التنبيه"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* نافذة طريقة التثبيت الإرشادية السريعة */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-slate-100 text-right">
            {/* زر الإغلاق */}
            <button
              onClick={() => setShowGuideModal(false)}
              className="absolute top-4 left-4 p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* عنوان النافذة */}
            <div className="flex items-center gap-3 mb-5 border-b border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Puzzle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">طريقة تثبيت إضافة مساعد عقليات في 3 خطوات</h3>
                <p className="text-xs text-slate-400">تثبيت سهل خلال دقيقة واحدة على متصفح Google Chrome أو Edge</p>
              </div>
            </div>

            {/* خطوات التثبيت */}
            <div className="space-y-4 text-xs md:text-sm">
              {/* الخطوة 1 */}
              <div className="flex gap-3 bg-slate-800/50 p-3.5 rounded-xl border border-slate-800">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-white mb-1">حمّل ملف الإضافة وفك ضغطه</div>
                  <p className="text-slate-400 text-xs leading-relaxed mb-2">
                    اضغط على زر التحميل أدناه، ثم انقر بزر الفأرة الأيمن على الملف واصنع له <strong>استخراج الكل (Extract All)</strong> في أي مجلد تختاره.
                  </p>
                  <a
                    href="/aqleeat-extension.zip"
                    download="aqleeat-extension.zip"
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    تحميل ملف aqleeat-extension.zip
                  </a>
                </div>
              </div>

              {/* الخطوة 2 */}
              <div className="flex gap-3 bg-slate-800/50 p-3.5 rounded-xl border border-slate-800">
                <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-white mb-1">افتح صفحة الإضافات في المتصفح</div>
                  <p className="text-slate-400 text-xs leading-relaxed mb-2">
                    انسخ الرابط التالي والصقه في شريط عنوان المتصفح:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="bg-slate-950 px-2.5 py-1 rounded text-cyan-300 font-mono text-xs border border-slate-800">
                      chrome://extensions
                    </code>
                    <button
                      onClick={copyExtensionsUrl}
                      className="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium transition-colors"
                    >
                      {copiedLink ? 'تم النسخ!' : 'نسخ الرابط'}
                    </button>
                  </div>
                  <p className="text-amber-400/90 text-[11px] mt-2 flex items-center gap-1">
                    <span>تنبيه: تأكد من تفعيل زر</span>
                    <strong className="text-amber-300">وضع مطوّر البرامج (Developer Mode)</strong>
                    <span>في أعلى يمين الصفحة.</span>
                  </p>
                </div>
              </div>

              {/* الخطوة 3 */}
              <div className="flex gap-3 bg-slate-800/50 p-3.5 rounded-xl border border-slate-800">
                <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  3
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-white mb-1">تحميل الإضافة وتثبيتها</div>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    اضغط على زر <strong>(تحميل إضافة تم فك حزمتها / Load unpacked)</strong> في أعلى الصفحة، واختر المجلد الذي قمت بفك الضغط إليه... أو بكل بساطة <strong>اسحب المجلد وأفلته داخل صفحة chrome://extensions</strong>!
                  </p>
                </div>
              </div>
            </div>

            {/* الملاحظة الختامية */}
            <div className="mt-5 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center gap-2.5 text-xs text-emerald-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>ستظهر الإضافة فوراً في شريط المتصفح العلوي بقائمة تشغيل وإيقاف سريعة!</span>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowGuideModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                فهمت ذلك، إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
