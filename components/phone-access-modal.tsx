"use client";

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Smartphone,
  Globe,
  Wifi,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  X,
  Share2,
  Lock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/floating-toast';

interface PhoneAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PhoneAccessModal({ isOpen, onClose }: PhoneAccessModalProps) {
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [phoneMode, setPhoneMode] = useState<'funnel' | 'tailscale' | 'temporary' | null>(null);
  const [loading, setLoading] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [tunnelMessage, setTunnelMessage] = useState('رابط الهاتف غير جاهز حالياً');

  const fetchTunnelStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/system/tunnel');
      if (res.ok) {
        const data = await res.json();
        setTunnelUrl(data.url || null);
        setPhoneMode(data.mode || null);
        setTunnelMessage(data.message || 'رابط الهاتف غير جاهز حالياً');
        if (data.url) {
          const qr = await QRCode.toDataURL(data.url, {
            margin: 1.5,
            width: 260,
            color: {
              dark: '#000000',
              light: '#ffffff',
            },
          });
          setQrCodeDataUrl(qr);
        } else setQrCodeDataUrl('');
      }
    } catch (err) {
      console.warn('Failed to fetch tunnel status:', err);
      setTunnelMessage('تعذر فحص رابط الهاتف. تحقق من اتصال الكمبيوتر بالإنترنت.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTunnelStatus();
    }
  }, [isOpen]);

  const handleCopy = (url: string | null) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    toast.success('تم نسخ الرابط إلى الحافظة! يمكنك إرساله لنفسك على واتساب.', 'نسخ الرابط');
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (!isOpen) return null;

  const targetUrl = tunnelUrl;

  return (
    <div
      className="fixed inset-0 z-[99999999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="relative w-full max-w-md bg-[#161718] border border-[#2e3133] rounded-3xl overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* الترويسة */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2e3133] bg-gradient-to-r from-[#17191a] to-[#202324]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#21c063]/20 text-[#21c063] border border-[#21c063]/40 flex items-center justify-center font-bold">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#fafafa] flex items-center gap-1.5">
                <span>تشغيل النظام من الهاتف</span>
                <span className={`w-2 h-2 rounded-full ${tunnelUrl ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              </h3>
              <p className="text-[11px] text-[#9ca3af]">{tunnelUrl ? 'رابط الهاتف المحمي جاهز' : tunnelMessage}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-xl bg-white/5 hover:bg-white/10 text-[#9ca3af] flex items-center justify-center text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* جسم النافذة */}
        <div className="p-5 flex flex-col items-center gap-4">
          {/* حالة الاتصال المشفرة */}
          <div className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#21c063]/10 border border-[#21c063]/25 text-xs">
            <div className="flex items-center gap-2 text-[#21c063] font-bold">
              <Globe className="w-4 h-4" />
              <span>{!tunnelUrl ? 'الرابط غير متاح' : phoneMode === 'funnel' ? 'رابط ثابت بدون VPN' : phoneMode === 'tailscale' ? 'رابط خاص ثابت من أي مكان' : 'رابط هاتف مؤقت'}</span>
            </div>
            <Badge variant="outline" className="bg-[#21c063]/20 text-[#21c063] border-0 text-[10px] py-0.5">
              {!tunnelUrl ? 'غير متصل' : phoneMode === 'funnel' ? 'تسجيل دخول مطلوب' : phoneMode === 'tailscale' ? 'Tailscale' : 'اتصال مشفر'}
            </Badge>
          </div>

          {/* رمز QR Code لمسحه فوراً بكاميرا الجوال */}
          <div className="flex flex-col items-center gap-2 my-1">
            <div className="p-3 bg-white rounded-2xl shadow-xl border border-white/20 flex items-center justify-center">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="QR Code لفتح النظام من الهاتف"
                  className="w-48 h-48 rounded-lg"
                />
              ) : (
                <div className="w-48 h-48 flex flex-col items-center justify-center gap-2 text-slate-500">
                  {loading && <div className="w-6 h-6 border-2 border-[#21c063] border-t-transparent rounded-full animate-spin" />}
                  <span className="text-xs font-medium text-center">{loading ? 'جاري فحص الرابط...' : tunnelMessage}</span>
                </div>
              )}
            </div>
            <span className="text-[11.5px] font-bold text-[#cbd5e1] mt-1">
              {!tunnelUrl ? 'استخدم زر تحديث بعد عودة الاتصال' : phoneMode === 'tailscale' ? 'فعّل Tailscale على الهاتف ثم امسح الرمز' : 'افتح الرابط أو امسح الرمز دون VPN'}
            </span>
          </div>

          {/* صندوق الرابط العام مع زر النسخ بنقرة واحدة */}
          <div className="w-full flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[#9ca3af] flex items-center justify-between">
              <span>رابط الجوال المباشر:</span>
              <button
                onClick={fetchTunnelStatus}
                disabled={loading}
                className="text-[11px] text-[#21c063] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                <span>تحديث</span>
              </button>
            </label>

            <div className="flex items-center gap-2">
              <div
                className="flex-1 bg-[#121314] border border-[#2e3133] rounded-xl px-3 py-2 text-xs font-mono text-[#21c063] truncate select-all"
                dir="ltr"
              >
                {tunnelUrl || tunnelMessage}
              </div>

              <Button
                size="sm"
                onClick={() => handleCopy(targetUrl)}
                disabled={!targetUrl}
                className="h-9 px-3 bg-[#21c063] hover:bg-[#1caa55] text-white text-xs font-bold rounded-xl shrink-0 cursor-pointer gap-1.5"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>تم</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>نسخ</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* بطاقة تثبيت كتطبيق هاتف رسمي */}
          <div className="w-full bg-gradient-to-r from-emerald-950/40 to-[#181a1b] p-3.5 rounded-2xl border border-emerald-500/30 flex flex-col gap-2 text-[11.5px] text-[#cbd5e1] leading-relaxed">
            <div className="flex items-center gap-1.5 font-bold text-emerald-400 text-xs">
              <Smartphone className="w-4 h-4" />
              <span>تثبيت النظام كتطبيق على شاشة هاتفك (PWA):</span>
            </div>
            <p>
              • <strong>على أندرويد (Chrome):</strong> ستظهر لك رسالة تلقائية بالأسفل بعنوان <strong>"تثبيت التطبيق الآن"</strong>، اضغط عليها وسيتم تنزيله كأيقونة تطبيق رسمي على هاتفك.
            </p>
            <p>
              • <strong>على آيفون (Safari):</strong> اضغط زر المشاركة <Share2 className="w-3 h-3 inline mx-0.5 text-blue-400" /> أسفل المتصفح، ثم اختر <strong>"إضافة إلى الشاشة الرئيسية"</strong> ليفتح بملء الشاشة كتطبيق مستقل.
            </p>
          </div>

          {/* نصائح للاستخدام المستمر */}
          <div className="w-full bg-[#181a1b] p-3 rounded-2xl border border-[#2e3133] flex flex-col gap-1.5 text-[11px] text-[#9ca3af] leading-relaxed">
            <div className="flex items-center gap-1.5 font-bold text-[#f3f4f6]">
              <Lock className="w-3.5 h-3.5 text-[#21c063]" />
              <span>معلومات السيرفر الشخصي:</span>
            </div>
            <p>
              1. كمبيوترك يعمل كسيرفر طالما أنه شغال ومتصل بالإنترنت.
            </p>
            <p>
              2. رابط الجوال محفوظ أيضاً على سطح المكتب في ملف: <strong>رابط_الجوال_للنظام.txt</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
