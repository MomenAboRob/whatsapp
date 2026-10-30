"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { QrCode, CheckCircle2, RefreshCw, X, ShieldCheck, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WhatsAppQRModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WhatsAppQRModal({ isOpen, onClose }: WhatsAppQRModalProps) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('DISCONNECTED');
  // تأكيد بضغطتين بدل نافذة التأكيد المنبثقة (فك ربط الرقم لا يمكن التراجع عنه)
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [userData, setUserData] = useState<{ name: string; phone: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasCreds, setHasCreds] = useState(false);
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetWait = useCallback(() => {
    if (waitTimerRef.current) clearTimeout(waitTimerRef.current);
    setWaitedTooLong(false);
    waitTimerRef.current = setTimeout(() => setWaitedTooLong(true), 25000);
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
        setUserData(data.user || null);
        setQrCode(data.qrCode || null);
        setHasCreds(Boolean(data.hasCreds));
        if (data.status === 'CONNECTED' || data.qrCode) setError(null);
      } else {
        setError('تعذر قراءة حالة واتساب من الخادم.');
      }
    } catch {
      setError('تعذر الاتصال بالخادم. تحقق من تشغيل التطبيق والاتصال بالشبكة.');
    }
  }, []);

  const startConnecting = useCallback(async () => {
    setLoading(true);
    resetWait();
    setError(null);
    try {
      const res = await fetch('/api/whatsapp/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect' }),
      });
      if (!res.ok) throw new Error('تعذر بدء الاتصال بواتساب.');
      await checkStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر بدء الاتصال بواتساب.');
    } finally {
      setLoading(false);
    }
  }, [checkStatus, resetWait]);

  const handleLogout = async () => {
    if (!confirmLogout) {
      setConfirmLogout(true);
      setTimeout(() => setConfirmLogout(false), 4000);
      return;
    }
    setConfirmLogout(false);
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      if (!res.ok) throw new Error('تعذر إعادة ربط الحساب.');
      setStatus('DISCONNECTED');
      setQrCode(null);
      setUserData(null);
      setHasCreds(false);
      resetWait();
      setError(null);
      setTimeout(checkStatus, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إعادة ربط الحساب.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const initial = setTimeout(() => {
        void checkStatus();
        void startConnecting();
      }, 0);
      const interval = setInterval(checkStatus, 3000);
      return () => {
        clearTimeout(initial);
        clearInterval(interval);
        if (waitTimerRef.current) clearTimeout(waitTimerRef.current);
      };
    }
  }, [isOpen, checkStatus, startConnecting]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* رأس النافذة */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2.5">
            <QrCode className="w-5 h-5 text-emerald-500" />
            <h2 className="text-sm font-bold text-foreground">ربط واتساب بالرمز QR</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* جسم النافذة */}
        <div className="p-6 flex flex-col items-center gap-5 text-center">
          {status === 'CONNECTED' ? (
            <div className="py-6 flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-foreground">واتساب متصل بنجاح</h3>
              <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-400">
                الحساب: {userData?.name || 'غير متصل'} ({userData?.phone || '—'})
              </div>
              <div className="p-3.5 bg-[#161717] rounded-xl border border-[#2e2f2f] text-right text-xs text-[#e0e0e0] space-y-1.5 max-w-sm">
                <span className="font-bold text-[#21c063] block">حول سجل المحادثات:</span>
                <span className="text-[#a5a5a5] leading-relaxed block text-[11px]">
                  الرسائل والوسائط القديمة قد لا تكون متاحة للمزامنة. إعادة الربط تنشئ جلسة جديدة وتحافظ على السجل المحلي المحفوظ في التطبيق.
                </span>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-2 mt-2 w-full justify-center">
                <Button size="sm" onClick={onClose} className="text-xs px-5 rounded-lg font-bold w-full sm:w-auto bg-[#21c063] hover:bg-[#1daa55] text-white cursor-pointer">
                  متابعة العمل في الشات
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleLogout}
                  disabled={loading}
                  className="text-xs px-4 rounded-lg font-bold text-amber-400 border-amber-500/40 hover:bg-amber-500/10 w-full sm:w-auto cursor-pointer gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>{confirmLogout ? 'اضغط مرة ثانية لتأكيد فك الربط' : 'إعادة ربط الحساب برمز QR'}</span>
                </Button>
              </div>
            </div>
          ) : qrCode ? (
            <div className="flex flex-col items-center gap-4">
              <div className="p-3 bg-white rounded-xl shadow-lg border border-border/80">
                <img src={qrCode} alt="رمز استجابة سريعة لواتساب" className="w-60 h-60 object-contain" />
              </div>

              <div className="flex flex-col gap-1.5 text-xs text-muted-foreground text-right w-full bg-muted/40 p-3.5 rounded-xl border border-border">
                <span className="font-bold text-foreground text-xs mb-1">خطوات الربط من هاتفك:</span>
                <span>1. افتح تطبيق واتساب على هاتفك</span>
                <span>2. اذهب إلى الإعدادات ثم &quot;الأجهزة المرتبطة&quot;</span>
                <span>3. انقر على &quot;ربط جهاز&quot; ووجّه كاميرا هاتفك نحو هذا الرمز</span>
              </div>
            </div>
          ) : (error || waitedTooLong) ? (
            <div className="py-6 flex flex-col items-center gap-3 text-sm">
              <AlertCircle className="w-8 h-8 text-amber-400" />
              <p className="text-foreground font-semibold">{error || 'تأخر توليد رمز QR أو استعادة الجلسة.'}</p>
              <p className="text-xs text-muted-foreground">
                {hasCreds
                  ? 'يوجد ربط محفوظ يحاول الاتصال. إذا لم يعد يعمل، يمكنك إعادة ربط الحساب برمز جديد مع إبقاء السجل المحلي.'
                  : 'تحقق من اتصال الخادم بالإنترنت ثم حاول تحديث الرمز.'}
              </p>
              {hasCreds && (
                <Button size="sm" variant="outline" onClick={handleLogout} disabled={loading} className="text-xs text-amber-400 border-amber-500/40">
                  {confirmLogout ? 'اضغط مرة ثانية لتأكيد إعادة الربط' : 'إعادة الربط برمز QR'}
                </Button>
              )}
            </div>
          ) : (
            <div className="py-10 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground font-medium">جاري تهيئة جلسة واتساب وتوليد الرمز...</span>
            </div>
          )}
        </div>

        {/* ذيل النافذة */}
        <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>بيانات الربط محفوظة على خادم التطبيق</span>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={startConnecting}
            disabled={loading}
            className="h-7 text-xs gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث الرمز</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
