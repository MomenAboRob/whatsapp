"use client";

import { useEffect, useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';

export function PhonePushPrompt() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (window.location.pathname === '/login') return;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    // iOS Safari does not expose PushManager until the site is installed as a Home Screen app.
    // Keep the activation banner visible so the user sees how to reach the supported mode.
    if (isIOS && !installed) {
      setVisible(true);
      setMessage('لتفعيل إشعارات الآيفون، أضف التطبيق إلى الشاشة الرئيسية وافتحه منها.');
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setVisible(!subscription))
      .catch(() => {});
  }, []);

  const enable = async () => {
    setBusy(true); setMessage('');
    try {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
      if (isIOS && !installed) {
        setMessage('اضغط مشاركة في Safari، ثم «إضافة إلى الشاشة الرئيسية»، وافتح التطبيق من أيقونته. بعدها اضغط تفعيل الإشعارات.');
        return;
      }
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('هذا المتصفح لا يدعم إشعارات الهاتف بالخلفية. افتح التطبيق في Chrome أو ثبّته على شاشة الآيفون الرئيسية.');
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('اسمح بإشعارات التطبيق من إعدادات المتصفح.');
      const configResponse = await fetch('/api/whatsapp/push', { cache: 'no-store' });
      const config = await configResponse.json();
      if (!configResponse.ok || !config.publicKey) throw new Error('إشعارات الهاتف غير مهيأة على الخادم.');
      const registration = await navigator.serviceWorker.ready;
      const padding = '='.repeat((4 - config.publicKey.length % 4) % 4);
      const raw = atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/') + padding);
      const applicationServerKey = Uint8Array.from(raw, (char) => char.charCodeAt(0));
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      const response = await fetch('/api/whatsapp/push', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'تعذر حفظ إعدادات الإشعار.');
      setVisible(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر تفعيل الإشعارات.');
    } finally { setBusy(false); }
  };

  if (!visible) return null;
  return <div dir="rtl" className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-emerald-900/60 bg-[#10251c] px-3 py-2 text-xs text-emerald-100 sm:px-5">
    <span>{message || 'فعّل إشعارات الهاتف لتصلك الرسائل الجديدة حتى عندما يكون التطبيق بالخلفية.'}</span>
    <button type="button" onClick={() => void enable()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-[#21c063] px-3 py-1.5 font-bold text-[#092116] disabled:opacity-60">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
      تفعيل الإشعارات
    </button>
  </div>;
}
