"use client";

import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Share2, PlusSquare, X, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/floating-toast';

export function MobilePWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios' | 'other'>('other');
  const [isStandalone, setIsStandalone] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    // 1. تسجيل Service Worker تلقائياً لتمكين ميزات PWA وسرعة التحميل
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('Hawalat PWA: Service Worker registered successfully', reg.scope);
          void reg.update().catch((error) => {
            console.warn('Hawalat PWA: Service Worker update check failed', error);
          });
        })
        .catch((err) => {
          console.warn('Hawalat PWA: Service Worker registration error:', err);
        });
    }

    // 2. التحقق مما إذا كان التطبيق مفتوحاً بالفعل كتطبيق مثبت (Standalone Mode)
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://');
      
      setIsStandalone(Boolean(isStandaloneMode));
      return Boolean(isStandaloneMode);
    };

    if (checkStandalone()) {
      return; // لا نظهر أي إشعار إذا كان المستخدم داخل التطبيق المثبت بالفعل
    }

    // التحقق من التجاهل المؤقت في الجلسة الحالية
    const isDismissed = sessionStorage.getItem('hawalat_pwa_dismissed');
    if (isDismissed === 'true') {
      return;
    }

    // 3. كشف نظام التشغيل (iOS vs Android / Desktop)
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isAndroid = /Android/i.test(ua);

    if (isIOS) {
      setPlatform('ios');
      // إظهار التنبيه لمستخدمي آيفون بعد 2.5 ثانية لإتاحة رؤية الصفحة أولاً
      const timer = setTimeout(() => {
        if (!checkStandalone()) {
          setShowPrompt(true);
        }
      }, 2500);
      return () => clearTimeout(timer);
    } else {
      setPlatform(isAndroid ? 'android' : 'other');
    }

    // 4. التقاط حدث التثبيت لأندرويد وكروم (beforeinstallprompt)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform('android');
      setShowPrompt(true);
    };

    // 5. التقاط اكتمال التثبيت بنجاح
    const handleAppInstalled = () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
      toast.success('تم تثبيت التطبيق بنجاح على هاتفك! ستجده الآن في شاشتك الرئيسية.', 'تثبيت التطبيق');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      toast.info('لتثبيت التطبيق: افتح قائمة خيارات المتصفح (⋮) ثم اضغط "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية".', 'تثبيت التطبيق');
      return;
    }

    setIsInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        toast.success('جاري تثبيت تطبيق الحوالات على جهازك...', 'تثبيت التطبيق');
        setShowPrompt(false);
      }
    } catch (err) {
      console.warn('Install prompt error:', err);
    } finally {
      setIsInstalling(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    sessionStorage.setItem('hawalat_pwa_dismissed', 'true');
  };

  if (!showPrompt || isStandalone) {
    return null;
  }

  return (
    <div
      dir="rtl"
      className="fixed bottom-3 inset-x-3 sm:inset-x-auto sm:left-4 sm:right-auto sm:w-[410px] z-[999999] animate-in fade-in slide-in-from-bottom-5 duration-300 select-none"
    >
      <div className="relative bg-[#181a1b] border border-[#21c063]/40 rounded-2xl p-4 shadow-2xl backdrop-blur-xl bg-opacity-95 text-white flex flex-col gap-3">
        {/* زر الإغلاق */}
        <button
          onClick={handleDismiss}
          className="absolute top-2.5 left-2.5 w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center text-xs cursor-pointer transition-colors"
          title="إغلاق"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* الترويسة مع أيقونة التطبيق عالية الجودة */}
        <div className="flex items-center gap-3 pr-1">
          <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-gradient-to-br from-emerald-500 to-[#128c7e] p-0.5 shadow-lg shrink-0">
            <img
              src="/icons/icon-192.png"
              alt="شعار نظام الحوالات"
              className="w-full h-full object-cover rounded-[10px]"
            />
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#181a1b]" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-bold text-white tracking-wide">
                {platform === 'ios' ? 'تثبيت التطبيق على آيفون' : 'تثبيت تطبيق الحوالات'}
              </h4>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#21c063]/20 text-[#21c063]">
                مجاني
              </span>
            </div>
            <p className="text-[11.5px] text-gray-300 mt-0.5 leading-snug">
              يعمل كتطبيق جوال كامل بملء الشاشة بدون شريط المتصفح وبسرعة فائقة.
            </p>
          </div>
        </div>

        {/* محتوى مخصص حسب المنصة */}
        {platform === 'ios' ? (
          /* تعليمات آيفون (Safari) */
          <div className="bg-[#121314] rounded-xl p-3 border border-[#2e3133] flex flex-col gap-2 text-xs text-gray-200">
            <div className="flex items-center gap-2 font-medium text-emerald-400">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>طريقة التثبيت على آيفون (خلال 3 ثوانٍ):</span>
            </div>
            <div className="flex items-start gap-2 text-[11.5px]">
              <span className="font-bold text-white bg-white/10 w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                1
              </span>
              <span>
                اضغط على زر المشاركة <Share2 className="w-3.5 h-3.5 inline mx-1 text-blue-400" /> في شريط متصفح سفاري (أسفل الشاشة).
              </span>
            </div>
            <div className="flex items-start gap-2 text-[11.5px]">
              <span className="font-bold text-white bg-white/10 w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                2
              </span>
              <span>
                مرر للأسفل واختر <span className="font-bold text-white">"إضافة إلى الشاشة الرئيسية"</span>{' '}
                <PlusSquare className="w-3.5 h-3.5 inline mx-1 text-emerald-400" />.
              </span>
            </div>
            <div className="flex items-start gap-2 text-[11.5px]">
              <span className="font-bold text-white bg-white/10 w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                3
              </span>
              <span>
                اضغط <span className="font-bold text-emerald-400">"إضافة" (Add)</span> بالأعلى ليظهر التطبيق على شاشتك فوراً!
              </span>
            </div>

            <Button
              size="sm"
              onClick={handleDismiss}
              className="mt-1 w-full bg-[#21c063] hover:bg-[#1caa55] text-white font-bold text-xs h-8 rounded-lg cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 ml-1" />
              <span>فهمت الطريقة، سأقوم بتثبيته</span>
            </Button>
          </div>
        ) : (
          /* أندرويد وكروم: زر نقرة واحدة */
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={handleInstallClick}
              disabled={isInstalling}
              className="flex-1 bg-[#21c063] hover:bg-[#1caa55] text-white font-bold text-xs h-9 rounded-xl shadow-md cursor-pointer gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>{isInstalling ? 'جاري التثبيت...' : 'تثبيت التطبيق الآن'}</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleDismiss}
              className="h-9 px-3 border-[#2e3133] hover:bg-white/5 text-gray-400 hover:text-white text-xs rounded-xl cursor-pointer"
            >
              <span>لاحقاً</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
