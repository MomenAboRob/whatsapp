"use client";

import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  X,
  Settings,
  MessageSquare,
  Smartphone,
  Puzzle,
  Database,
  User,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  QrCode,
  Copy,
  Check,
  ExternalLink,
  Download,
  LogOut,
  ShieldCheck,
  Globe,
  Wifi,
  Sparkles,
  Layers,
  ArrowRight,
  HardDrive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/floating-toast';
import { DriveBackupSettings } from '@/components/drive-backup-settings';

export interface SystemSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  waStatus: any;
  currentUser: { id: string; name: string; email: string } | null;
  budget: {
    totalReceived: number;
    totalPaid: number;
    companyRemaining: number;
    accountName?: string;
  } | null;
  onOpenQRModal: () => void;
  onOpenDashboard?: () => void;
  onRefreshBudget?: () => void;
  onLogout: () => void;
  initialTab?: 'whatsapp' | 'drive' | 'mobile' | 'extension' | 'airtable' | 'account';
}

export function SystemSettingsModal({
  isOpen,
  onClose,
  waStatus,
  currentUser,
  budget,
  onOpenQRModal,
  onOpenDashboard,
  onRefreshBudget,
  onLogout,
  initialTab = 'whatsapp',
}: SystemSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'drive' | 'mobile' | 'extension' | 'airtable' | 'account'>(initialTab);
  const tabTrailRef = useRef<Array<typeof activeTab>>([]);
  const lastTabRef = useRef(activeTab);
  const restoringTabRef = useRef(false);
  const [isSyncingChats, setIsSyncingChats] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [phoneMode, setPhoneMode] = useState<'funnel' | 'tailscale' | 'temporary' | null>(null);
  const [mobileQrCode, setMobileQrCode] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [loadingTunnel, setLoadingTunnel] = useState(false);

  useEffect(() => {
    if (isOpen) {
      tabTrailRef.current = [];
      lastTabRef.current = initialTab;
      setActiveTab(initialTab);
      fetchTunnelStatus();
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (activeTab === lastTabRef.current) return;
    if (!restoringTabRef.current) tabTrailRef.current.push(lastTabRef.current);
    restoringTabRef.current = false;
    lastTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    if (!isOpen) return;
    const onMobileBack = (event: Event) => {
      const back = event as CustomEvent<{ scope: string; handled: boolean }>;
      if (back.detail.scope !== 'settings' || !tabTrailRef.current.length) return;
      restoringTabRef.current = true;
      setActiveTab(tabTrailRef.current.pop()!);
      back.detail.handled = true;
    };
    window.addEventListener('hawalat-mobile-back', onMobileBack);
    return () => window.removeEventListener('hawalat-mobile-back', onMobileBack);
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const fetchTunnelStatus = async () => {
    setLoadingTunnel(true);
    try {
      const res = await fetch('/api/system/tunnel');
      if (res.ok) {
        const data = await res.json();
        setTunnelUrl(data.url || null);
        setPhoneMode(data.mode || null);
        if (data.url) {
          const qr = await QRCode.toDataURL(data.url, {
            margin: 1.5,
            width: 240,
            color: { dark: '#000000', light: '#ffffff' },
          });
          setMobileQrCode(qr);
        } else setMobileQrCode('');
      }
    } catch {
      // Fallback
    } finally {
      setLoadingTunnel(false);
    }
  };

  const handleSyncChats = async () => {
    setIsSyncingChats(true);
    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`تمت المزامنة بنجاح: تم جلب ${data.groups?.length || 0} من مجموعات ومحادثات واتساب.`, 'مزامنة واتساب');
      } else {
        toast.error(data.error || 'تعذر مزامنة المجموعات حالياً.', 'تنبيه');
      }
    } catch {
      toast.error('حدث خطأ أثناء الاتصال بالخادم لمزامنة المحادثات.', 'خطأ');
    } finally {
      setIsSyncingChats(false);
    }
  };

  const handleQuickReconnect = async () => {
    setIsReconnecting(true);
    try {
      const res = await fetch('/api/whatsapp/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reconnect' }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('تم إرسال أمر إعادة الاتصال إلى السيرفر.', 'إعادة الاتصال');
      } else {
        toast.error(data.error || 'تعذر إعادة الاتصال.', 'تنبيه');
      }
    } catch {
      toast.error('حدث خطأ في الاتصال بالخادم.', 'خطأ');
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleCopyLink = () => {
    const targetUrl = tunnelUrl;
    if (!targetUrl) return;
    navigator.clipboard.writeText(targetUrl);
    setIsCopied(true);
    toast.success('تم نسخ الرابط بنجاح إلى الحافظة.', 'تم النسخ');
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-[#161717] border border-[#2e2f2f] rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[85vh] max-h-[640px] text-[#fafafa] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* الشريط الجانبي لقائمة الإعدادات */}
        <aside className="w-full md:w-60 bg-[#111212] border-b md:border-b-0 md:border-l border-[#2e2f2f] flex flex-col justify-between shrink-0 p-3 sm:p-4">
          <div className="flex flex-col gap-3">
            {/* عنوان النافذة */}
            <div className="flex items-center justify-between pb-2 border-b border-[#2e2f2f]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#21c063]/20 border border-[#21c063]/40 flex items-center justify-center text-[#21c063]">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">إعدادات النظام</h3>
                  <p className="text-[10px] text-[#a5a5a5]">التحكم والربط الشامل</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="md:hidden p-1.5 rounded-lg text-[#a5a5a5] hover:text-white hover:bg-[#242626] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* أزرار التبويبات */}
            <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-1 md:pb-0 [scrollbar-width:none]">
              <button
                type="button"
                onClick={() => setActiveTab('whatsapp')}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  activeTab === 'whatsapp'
                    ? 'bg-[#21c063] text-white shadow-xs'
                    : 'text-[#a5a5a5] hover:text-white hover:bg-[#1f2020]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  <span>ربط واتساب</span>
                </div>
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    waStatus?.status === 'CONNECTED'
                      ? 'bg-emerald-400'
                      : waStatus?.status === 'CONNECTING'
                      ? 'bg-blue-400 animate-pulse'
                      : 'bg-rose-500'
                  }`}
                />
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('drive')}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${activeTab === 'drive' ? 'bg-[#21c063] text-white' : 'text-[#a5a5a5] hover:text-white hover:bg-[#1f2020]'}`}
              >
                <HardDrive className="w-4 h-4 shrink-0" />
                <span>نسخة Google Drive</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('mobile')}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  activeTab === 'mobile'
                    ? 'bg-[#21c063] text-white shadow-xs'
                    : 'text-[#a5a5a5] hover:text-white hover:bg-[#1f2020]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 shrink-0" />
                  <span>رابط الجوال</span>
                </div>
                {tunnelUrl && <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('extension')}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  activeTab === 'extension'
                    ? 'bg-[#21c063] text-white shadow-xs'
                    : 'text-[#a5a5a5] hover:text-white hover:bg-[#1f2020]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Puzzle className="w-4 h-4 shrink-0" />
                  <span>إضافة عقليات</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('airtable')}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  activeTab === 'airtable'
                    ? 'bg-[#21c063] text-white shadow-xs'
                    : 'text-[#a5a5a5] hover:text-white hover:bg-[#1f2020]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 shrink-0" />
                  <span>أيرتيبل والميزانية</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('account')}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  activeTab === 'account'
                    ? 'bg-[#21c063] text-white shadow-xs'
                    : 'text-[#a5a5a5] hover:text-white hover:bg-[#1f2020]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 shrink-0" />
                  <span>الحساب والجلسة</span>
                </div>
              </button>
            </nav>
          </div>

          {/* أسفل الشريط الجانبي: المستخدم وتسجيل الخروج */}
          <div className="hidden md:flex flex-col gap-2 pt-3 border-t border-[#2e2f2f]">
            {currentUser && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[#161717] border border-[#2e2f2f] text-xs">
                <div className="w-6 h-6 rounded-full bg-[#21c063]/20 text-[#21c063] flex items-center justify-center font-bold text-[10px]">
                  {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold text-white truncate">{currentUser.name}</div>
                  <div className="text-[9px] text-[#a5a5a5] truncate">مسؤول النظام</div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onLogout}
              className="flex items-center justify-center gap-2 py-1.5 px-3 rounded-xl text-xs font-semibold text-rose-400 hover:text-white hover:bg-rose-500/20 border border-rose-500/30 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </aside>

        {/* مساحة المحتوى الرئيسية */}
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto p-4 sm:p-6 bg-[#161717]">
          {/* شريط الإغلاق العلوي لشاشات الكمبيوتر */}
          <div className="hidden md:flex items-center justify-between pb-4 border-b border-[#2e2f2f] mb-5">
            <div>
              <h2 className="text-base font-bold text-white">
                {activeTab === 'whatsapp' && 'إعدادات وحالة اتصال واتساب'}
                {activeTab === 'drive' && 'نسخ المحادثات إلى Google Drive'}
                {activeTab === 'mobile' && 'رابط الوصول من الجوال (عن بُعد)'}
                {activeTab === 'extension' && 'إضافة كروم المساعدة لبوابة عقليات'}
                {activeTab === 'airtable' && 'الميزانية العامة الحية وقاعدة أيرتيبل'}
                {activeTab === 'account' && 'إعدادات الحساب والجلسة'}
              </h2>
              <p className="text-xs text-[#a5a5a5] mt-0.5">
                {activeTab === 'whatsapp' && 'إدارة الجلسة الحالية ومزامنة المحادثات وتبديل الرقم'}
                {activeTab === 'drive' && 'ربط الحساب والنسخ والاسترجاع داخل تطبيق الحوالات'}
                {activeTab === 'mobile' && 'فتح النظام وإدارته بالكامل من الهاتف الذكي'}
                {activeTab === 'extension' && 'تحميل الإضافة وربط متصفحك مباشرة بالبوابة'}
                {activeTab === 'airtable' && 'متابعة الرصيد والمقبوضات والمدفوعات الحية'}
                {activeTab === 'account' && 'معلومات المستخدم الحالي والأمان وتسجيل الخروج'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#a5a5a5] hover:text-white hover:bg-[#242626] transition-colors cursor-pointer"
              title="إغلاق (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 1. تبويب واتساب */}
          {activeTab === 'whatsapp' && (
            <div className="flex flex-col gap-5">
              {/* بطاقة الحالة الحالية */}
              <div className="p-4 rounded-2xl bg-[#1c1d1d] border border-[#2e2f2f] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-2xl bg-[#21c063] flex items-center justify-center text-white font-bold text-lg shadow-md">
                      وا
                    </div>
                    <span
                      className={`absolute -bottom-1 -left-1 w-3.5 h-3.5 rounded-full border-2 border-[#1c1d1d] ${
                        waStatus?.status === 'CONNECTED'
                          ? 'bg-emerald-500 animate-pulse'
                          : waStatus?.status === 'CONNECTING'
                          ? 'bg-blue-400'
                          : 'bg-rose-500'
                      }`}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white">
                        {waStatus?.user?.name || 'واتساب الحوالات'}
                      </h4>
                      {waStatus?.status === 'CONNECTED' ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[10px]">
                          متصل بالسيرفر
                        </Badge>
                      ) : waStatus?.status === 'CONNECTING' ? (
                        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/40 text-[10px]">
                          جاري الاتصال...
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/40 text-[10px]">
                          غير متصل
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-[#a5a5a5] mt-1 font-mono dir-ltr text-right">
                      {waStatus?.status === 'CONNECTED'
                        ? (waStatus?.user?.phone
                          ? (waStatus.user.phone.startsWith('+') ? waStatus.user.phone : `+${waStatus.user.phone}`)
                          : 'الرقم غير متاح')
                        : 'لا يوجد رقم متصل حالياً'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {waStatus?.status === 'CONNECTED' ? (
                    <Button
                      size="sm"
                      onClick={handleSyncChats}
                      disabled={isSyncingChats}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold gap-1.5 cursor-pointer shadow-xs"
                    >
                      <RotateCw className={`w-3.5 h-3.5 ${isSyncingChats ? 'animate-spin' : ''}`} />
                      <span>{isSyncingChats ? 'جاري المزامنة...' : 'مزامنة المحادثات'}</span>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={handleQuickReconnect}
                      disabled={isReconnecting}
                      className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
                    >
                      <RotateCw className={`w-3.5 h-3.5 ${isReconnecting ? 'animate-spin' : ''}`} />
                      <span>{isReconnecting ? 'جاري الاتصال...' : 'إعادة الاتصال'}</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* إجراءات واتساب */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div
                  onClick={() => {
                    onClose();
                    onOpenQRModal();
                  }}
                  className="p-4 rounded-2xl bg-[#1c1d1d] border border-[#2e2f2f] hover:border-[#21c063]/50 transition-all cursor-pointer group flex flex-col justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#21c063]/15 text-[#21c063] flex items-center justify-center group-hover:scale-105 transition-transform">
                      <QrCode className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-white group-hover:text-[#21c063] transition-colors">
                        ربط رقم جديد أو تبديل الحساب
                      </h5>
                      <p className="text-[11px] text-[#a5a5a5] mt-0.5">
                        مسح رمز الاستجابة السريعة (QR) من تطبيق واتساب بهاتفك
                      </p>
                    </div>
                  </div>
                  <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 self-start">
                    <span>فتح نافذة الرمز QR</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>

                <div
                  onClick={handleSyncChats}
                  className="p-4 rounded-2xl bg-[#1c1d1d] border border-[#2e2f2f] hover:border-emerald-500/50 transition-all cursor-pointer group flex flex-col justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <RotateCw className={`w-5 h-5 ${isSyncingChats ? 'animate-spin' : ''}`} />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">
                        مزامنة المجموعات والمحادثات
                      </h5>
                      <p className="text-[11px] text-[#a5a5a5] mt-0.5">
                        تحديث قائمة المحادثات النشطة وسحب أحدث الرسائل فوراً
                      </p>
                    </div>
                  </div>
                  <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 self-start">
                    <span>بدء المزامنة الفورية</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </div>

              {/* تلميح الأمان */}
              <div className="p-3.5 rounded-xl bg-[#182229] border border-[#2a3942] text-[11px] text-[#8696a0] flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>
                  جلسة واتساب مشفرة ومحفوظة محلياً على جهازك لضمان عدم انقطاع الاتصال حتى عند إغلاق المتصفح.
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-[#a5a5a5]">
                حالة الأرشفة تتحدث عند وصولها من واتساب. القوائم الشخصية التي أنشأتها داخل واتساب لا يرسلها الربط الحالي للتطبيق؛ القوائم الظاهرة هنا تُدار داخل تطبيق الحوالات.
              </p>
            </div>
          )}

          {activeTab === 'drive' && <DriveBackupSettings />}

          {/* 2. تبويب رابط الجوال */}
          {activeTab === 'mobile' && (
            <div className="flex flex-col gap-5">
              <div className="p-4 rounded-2xl bg-[#1c1d1d] border border-[#2e2f2f] flex flex-col md:flex-row items-center gap-6">
                {/* كود QR للهاتف */}
                <div className="w-44 h-44 bg-white rounded-2xl p-2.5 flex items-center justify-center shadow-lg shrink-0">
                  {mobileQrCode ? (
                    <img src={mobileQrCode} alt="QR Code" className="w-full h-full object-contain" />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 text-neutral-400 text-xs text-center">
                      <RotateCw className={`w-6 h-6 text-emerald-500 ${loadingTunnel ? 'animate-spin' : ''}`} />
                      <span>{loadingTunnel ? 'جاري توليد الرمز...' : 'رابط الجوال غير جاهز'}</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 flex flex-col gap-3 min-w-0 text-center sm:text-right">
                  <div>
                    <div className="flex items-center gap-2 justify-center sm:justify-start">
                      <h4 className="text-sm font-bold text-white">الوصول للنظام من الجوال</h4>
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[10px]">
                        {!tunnelUrl ? 'الرابط غير متاح' : phoneMode === 'funnel' ? 'رابط ثابت بدون VPN' : phoneMode === 'tailscale' ? 'رابط خاص وثابت' : 'رابط مؤقت'}
                      </Badge>
                    </div>
                    <p className="text-xs text-[#a5a5a5] mt-1">
                      {!tunnelUrl ? 'رابط الهاتف لم يتفعّل بعد. تحقق من اتصال Tailscale على الكمبيوتر.' : phoneMode === 'funnel' ? 'افتح الرابط مباشرة من Chrome وسجّل دخولك للتطبيق؛ لا حاجة لتفعيل Tailscale على الهاتف.' : phoneMode === 'tailscale' ? 'فعّل تطبيق Tailscale على هاتفك بنفس حساب الكمبيوتر، ثم امسح الرمز أو افتح الرابط في Chrome.' : 'امسح الرمز أو انسخ الرابط لفتح التطبيق من الهاتف.'}
                    </p>
                  </div>

                  {/* حقل الرابط */}
                  <div className="flex items-center gap-2 bg-[#161717] border border-[#2e2f2f] rounded-xl p-1.5">
                    <span className="text-xs font-mono text-[#fafafa] truncate flex-1 dir-ltr text-left px-2">
                      {tunnelUrl || 'لم يجهز رابط الجوال بعد'}
                    </span>
                    <Button
                      size="sm"
                      onClick={handleCopyLink}
                      disabled={!tunnelUrl}
                      className="bg-[#21c063] hover:bg-[#1daa55] text-white rounded-lg text-xs font-bold gap-1 px-3 cursor-pointer shrink-0"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{isCopied ? 'تم النسخ' : 'نسخ'}</span>
                    </Button>
                  </div>

                  <div className="flex items-center gap-4 text-[11px] text-[#a5a5a5] justify-center sm:justify-start">
                    <span className="flex items-center gap-1">
                      <Globe className="w-3.5 h-3.5 text-sky-400" />
                      <span>{!tunnelUrl ? 'غير متاح حالياً' : phoneMode === 'funnel' ? 'اتصال HTTPS وتسجيل دخول' : phoneMode === 'tailscale' ? 'اتصال خاص عبر Tailscale' : 'رابط مؤقت'}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{tunnelUrl ? 'متصل بالشبكة' : 'بانتظار الاتصال'}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. تبويب إضافة عقليات */}
          {activeTab === 'extension' && (
            <div className="flex flex-col gap-5">
              <div className="p-4 rounded-2xl bg-[#1c1d1d] border border-[#2e2f2f] flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
                    <Puzzle className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">إضافة متصفح كروم لبوابة عقليات</h4>
                    <p className="text-xs text-[#a5a5a5] mt-1">
                      إضافة جاهزة للتركيب تتيح قراءة واعتماد الحوالات آلياً داخل بوابة عقليات بنقرة واحدة.
                    </p>
                  </div>
                </div>

                <a
                  href="/aqleeat-extension.zip"
                  download="aqleeat-extension.zip"
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shrink-0 shadow-xs"
                >
                  <Download className="w-4 h-4" />
                  <span>تحميل الإضافة (ZIP)</span>
                </a>
              </div>

              {/* خطوات التثبيت */}
              <div className="p-4 rounded-2xl bg-[#161717] border border-[#2e2f2f] flex flex-col gap-3">
                <h5 className="text-xs font-bold text-white flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#242626] text-[#21c063] flex items-center justify-center text-[11px] font-bold">1</span>
                  <span>طريقة التثبيت على متصفح Chrome أو Edge:</span>
                </h5>
                <ol className="text-xs text-[#a5a5a5] space-y-2 pr-6 list-decimal leading-relaxed">
                  <li>قم بتحميل ملف الإضافة المضغوط بالنقر على الزر أعلاه وفك ضغطه في مجلد على جهازك.</li>
                  <li>افتح متصفح كروم واذهب إلى الرابط: <code className="bg-[#242626] text-cyan-300 px-1.5 py-0.5 rounded text-[11px] font-mono dir-ltr inline-block">chrome://extensions</code></li>
                  <li>فعّل خيار <strong className="text-white">وضع مطوّر البرامج (Developer Mode)</strong> في أعلى الزاوية.</li>
                  <li>انقر على زر <strong className="text-white">تحميل إضافة غير محزومة (Load Unpacked)</strong> واختر المجلد المفكوك.</li>
                </ol>
              </div>
            </div>
          )}

          {/* 4. تبويب أيرتيبل والميزانية */}
          {activeTab === 'airtable' && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-[#1c1d1d] border border-[#2e2f2f] flex flex-col gap-1">
                  <span className="text-[11px] text-[#a5a5a5]">المتبقي للشركة</span>
                  <span className="text-lg font-bold text-emerald-400 font-mono">
                    {budget ? `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(budget.companyRemaining)} JOD` : 'غير متاح'}
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-[#1c1d1d] border border-[#2e2f2f] flex flex-col gap-1">
                  <span className="text-[11px] text-[#a5a5a5]">إجمالي المستلم</span>
                  <span className="text-lg font-bold text-blue-400 font-mono">
                    {budget ? `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(budget.totalReceived)} JOD` : 'غير متاح'}
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-[#1c1d1d] border border-[#2e2f2f] flex flex-col gap-1">
                  <span className="text-[11px] text-[#a5a5a5]">إجمالي المدفوع</span>
                  <span className="text-lg font-bold text-rose-400 font-mono">
                    {budget ? `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(budget.totalPaid)} JOD` : 'غير متاح'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {onOpenDashboard && (
                  <Button
                    onClick={() => {
                      onClose();
                      onOpenDashboard();
                    }}
                    className="bg-[#21c063] hover:bg-[#1daa55] text-white rounded-xl text-xs font-bold gap-2 cursor-pointer"
                  >
                    <Database className="w-4 h-4" />
                    <span>فتح لوحة التحكم وأيرتيبل بالكامل</span>
                  </Button>
                )}
                {onRefreshBudget && (
                  <Button
                    variant="outline"
                    onClick={onRefreshBudget}
                    className="border-[#2e2f2f] hover:bg-[#242626] text-white rounded-xl text-xs font-bold gap-2 cursor-pointer"
                  >
                    <RotateCw className="w-4 h-4" />
                    <span>تحديث الأرقام الآن</span>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* 5. تبويب الحساب والجلسة */}
          {activeTab === 'account' && (
            <div className="flex flex-col gap-5">
              <div className="p-4 rounded-2xl bg-[#1c1d1d] border border-[#2e2f2f] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#21c063]/20 border border-[#21c063]/40 text-[#21c063] flex items-center justify-center font-bold text-lg">
                    {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{currentUser?.name || 'مستخدم النظام'}</h4>
                    <p className="text-xs text-[#a5a5a5] mt-0.5">{currentUser?.email || 'admin@hawalat.app'}</p>
                    <Badge className="bg-[#21c063]/20 text-[#21c063] border-[#21c063]/30 text-[10px] mt-1.5">
                      مسؤول معتمد
                    </Badge>
                  </div>
                </div>

                <Button
                  variant="destructive"
                  onClick={onLogout}
                  className="rounded-xl text-xs font-bold gap-2 cursor-pointer shadow-xs"
                >
                  <LogOut className="w-4 h-4" />
                  <span>تسجيل الخروج</span>
                </Button>
              </div>

              <div className="p-4 rounded-2xl bg-[#161717] border border-[#2e2f2f] text-xs text-[#a5a5a5] space-y-2">
                <div className="flex justify-between py-1 border-b border-[#242626]">
                  <span>إصدار التطبيق:</span>
                  <span className="text-white font-mono">v0.0.1 (WhatsApp Web Beta)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#242626]">
                  <span>المنفذ المحلي:</span>
                  <span className="text-white font-mono">Port 3010</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>حالة النظام:</span>
                  <span className="text-emerald-400 font-bold">يعمل بكفاءة واستقرار</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
