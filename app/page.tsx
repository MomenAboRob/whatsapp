"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  MessageSquare,
  LayoutDashboard,
  QrCode,
  TrendingUp,
  Database,
  CheckCircle2,
  Share2,
  ExternalLink,
  RotateCw,
  User,
  LogOut,
  Puzzle,
  Settings,
  Inbox
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/floating-toast';
import { ExtensionDetectorBanner } from '@/components/extension-detector-banner';
import { ParsedTransfer } from '@/lib/parser';

const WhatsAppChatInterface = dynamic(
  () => import('@/components/whatsapp-chat-interface').then((module) => module.WhatsAppChatInterface),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#161717] text-sm text-slate-300">
        جارٍ فتح المحادثات...
      </div>
    ),
  },
);

const WhatsAppQRModal = dynamic(() => import('@/components/whatsapp-qr-modal').then((module) => module.WhatsAppQRModal));
const QuickReviewModal = dynamic(() => import('@/components/quick-review-modal').then((module) => module.QuickReviewModal));
const AirtableDashboard = dynamic(() => import('@/components/airtable-dashboard').then((module) => module.AirtableDashboard));
const TransferInbox = dynamic(() => import('@/components/transfer-inbox').then((module) => module.TransferInbox));
const PhoneAccessModal = dynamic(() => import('@/components/phone-access-modal').then((module) => module.PhoneAccessModal));
const SystemSettingsModal = dynamic(() => import('@/components/system-settings-modal').then((module) => module.SystemSettingsModal));
type AppView = 'whatsapp' | 'inbox' | 'dashboard';

export default function HawalatApp() {
  const appViewportRef = useRef<HTMLDivElement>(null);
  const [currentView, setCurrentView] = useState<AppView>('whatsapp');
  const currentViewRef = useRef<AppView>('whatsapp');
  const viewTrailRef = useRef<AppView[]>([]);
  const navigateToView = (nextView: AppView) => {
    if (currentViewRef.current === nextView) return;
    viewTrailRef.current.push(currentViewRef.current);
    currentViewRef.current = nextView;
    setCurrentView(nextView);
  };
  const [hasOpenedWhatsApp, setHasOpenedWhatsApp] = useState(false);
  const [hasOpenedInbox, setHasOpenedInbox] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [jumpTarget, setJumpTarget] = useState<{ chat: string; chatName: string; messageId: string } | null>(null);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'whatsapp' | 'drive' | 'mobile' | 'extension' | 'airtable' | 'account'>('whatsapp');
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewTransfer, setReviewTransfer] = useState<ParsedTransfer | null>(null);
  const [reviewImage, setReviewImage] = useState<string>('');
  const [reviewMsgId, setReviewMsgId] = useState<string | null>(null);
  const [popoutChat, setPopoutChat] = useState<string | null>(null);

  // حالة الميزانية العامة الحية من أيرتيبل
  const [budget, setBudget] = useState<{
    totalReceived: number;
    totalPaid: number;
    companyRemaining: number;
    accountName?: string;
  } | null>(null);
  const [isBudgetLoading, setIsBudgetLoading] = useState(false);
  const [waStatus, setWaStatus] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; email: string } | null>(null);

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setCurrentUser(data.user);
          return;
        }
      } else if (res.status === 401) {
        // توجيه لصفحة تسجيل الدخول فقط في حال كان الرد صريحاً بأن المستخدم غير مسجل
        window.location.replace('/login');
      }
    } catch (err) {
      console.warn('[HawalatApp] تعذر التحقق من جلسة المستخدم مؤقتاً (خطأ اتصال):', err);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.replace('/login');
    } catch {
      window.location.replace('/login');
    }
  };

  const fetchBudget = async (force = false) => {
    setIsBudgetLoading(true);
    try {
      const res = await fetch(`/api/transfers/airtable${force ? '?refresh=1' : ''}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.budget) {
          setBudget(data.budget);
        } else {
          setBudget(null);
        }
      } else {
        setBudget(null);
      }
    } catch (e) { setBudget(null); } finally {
      setIsBudgetLoading(false);
    }
  };

  const fetchWaStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        // لا نحدّث الحالة إلا إذا تغيّرت فعلاً (كانت تعيد رسم الصفحة كاملة كل 4 ثوانٍ وتجمّدها ~0.8 ثانية)
        setWaStatus((prev: any) => (JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const chatParam = params.get('popoutChat');
      if (chatParam) {
        setPopoutChat(chatParam);
        setHasOpenedWhatsApp(true);
        document.title = `${chatParam} - محادثة واتساب`;
      } else if (window.matchMedia('(max-width: 767px)').matches) {
        // على الهاتف نبدأ بالوارد الخفيف؛ تُحمّل واجهة المحادثات عند فتحها فقط.
        setHasOpenedInbox(true);
        currentViewRef.current = 'inbox';
        setCurrentView('inbox');
      } else {
        setHasOpenedWhatsApp(true);
      }
      const driveResult = params.get('drive');
      if (driveResult) {
        setSettingsInitialTab('drive');
        setIsSettingsModalOpen(true);
        if (driveResult === 'connected') toast.success('تم ربط Google Drive بنجاح.');
        else toast.error(params.get('driveMessage') || 'تعذر ربط Google Drive.');
        params.delete('drive');
        params.delete('driveMessage');
        window.history.replaceState({}, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
      }
    }

    fetchCurrentUser();
    fetchBudget();
    fetchWaStatus();

    // تحديث الحالة كل 15 ثانية فقط وإيقافه عندما يكون المتصفح في الخلفية لتوفير الموارد
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) {
        fetchWaStatus();
      }
    }, 15000);

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        fetchWaStatus();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!window.matchMedia('(max-width: 767px)').matches || popoutChat) return;
    const armBackGuard = () => {
      if (!window.history.state?.hawalatGuard) {
        window.history.pushState({ ...window.history.state, hawalatGuard: true }, '');
      }
    };
    armBackGuard();
    let exitReady = false;
    let rearmTimer: ReturnType<typeof setTimeout> | undefined;
    const onInteraction = () => {
      if (!exitReady) return;
      exitReady = false;
      if (rearmTimer) clearTimeout(rearmTimer);
      armBackGuard();
    };
    const onPop = () => {
      if (exitReady) return;
      let handled = false;
      if (isQRModalOpen) { setIsQRModalOpen(false); handled = true; }
      else if (isReviewModalOpen) { setIsReviewModalOpen(false); handled = true; }
      else if (isPhoneModalOpen) { setIsPhoneModalOpen(false); handled = true; }
      else if (isSettingsModalOpen) {
        const back = new CustomEvent('hawalat-mobile-back', { detail: { scope: 'settings', handled: false } });
        window.dispatchEvent(back);
        if (!back.detail.handled) setIsSettingsModalOpen(false);
        handled = true;
      } else {
        const back = new CustomEvent('hawalat-mobile-back', { detail: { scope: currentView, handled: false } });
        window.dispatchEvent(back);
        handled = back.detail.handled;
      }
      if (!handled) {
        const previousView = viewTrailRef.current.pop();
        if (previousView) {
          currentViewRef.current = previousView;
          setCurrentView(previousView);
          handled = true;
        }
      }
      if (handled) {
        armBackGuard();
      } else {
        toast.info('اضغط رجوع مرة ثانية للخروج', 'خروج');
        exitReady = true;
        rearmTimer = setTimeout(() => { exitReady = false; armBackGuard(); }, 2000);
      }
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('pointerdown', onInteraction, { passive: true });
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pointerdown', onInteraction);
      if (rearmTimer) clearTimeout(rearmTimer);
    };
  }, [currentView, popoutChat, isQRModalOpen, isReviewModalOpen, isPhoneModalOpen, isSettingsModalOpen]);

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 767px)');
    const visualViewport = window.visualViewport;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    const syncViewport = () => {
      const app = appViewportRef.current;
      if (!app) return;
      if (mobile.matches) {
        app.style.height = `${Math.round(visualViewport?.height || window.innerHeight)}px`;
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
      } else {
        app.style.removeProperty('height');
        document.documentElement.style.overflow = previousHtmlOverflow;
        document.body.style.overflow = previousBodyOverflow;
      }
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    visualViewport?.addEventListener('resize', syncViewport);
    mobile.addEventListener('change', syncViewport);
    return () => {
      window.removeEventListener('resize', syncViewport);
      visualViewport?.removeEventListener('resize', syncViewport);
      mobile.removeEventListener('change', syncViewport);
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  // واجهة واتساب ثقيلة جداً: نحفظها حتى لا تُعاد رسمتها كلما تغيّر شيء في الصفحة الرئيسية
  // (الدوال المُمرّرة تستخدم setState فقط وهي ثابتة، لذلك لا تحتاج أي تبعيات)
  const whatsappInterface = useMemo(
    () => (
      <WhatsAppChatInterface
        initialChat={jumpTarget?.chat}
        initialChatName={jumpTarget?.chatName}
        initialMessageId={jumpTarget?.messageId}
        onActiveChatChange={setMobileChatOpen}
        onOpenReview={(data: ParsedTransfer, imageUrl?: string, msgId?: string) => {
          setReviewTransfer(data);
          setReviewImage(imageUrl || '');
          setReviewMsgId(msgId || null);
          setIsReviewModalOpen(true);
        }}
        onOpenQRModal={() => setIsQRModalOpen(true)}
        onOpenSettings={() => {
          setSettingsInitialTab('whatsapp');
          setIsSettingsModalOpen(true);
        }}
      />
    ),
    [jumpTarget]
  );

  // إذا تم فتح الصفحة في وضع النافذة المستقلة (Pop-out Window) لمحادثة محددة
  if (popoutChat) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-[#161717] flex flex-col font-sans select-none" dir="rtl">
        <main className="flex-1 w-full h-full overflow-hidden">
          <WhatsAppChatInterface
            isPopoutMode={true}
            initialChat={popoutChat}
            onOpenReview={(data: ParsedTransfer, imageUrl?: string, msgId?: string) => {
              setReviewTransfer(data);
              setReviewImage(imageUrl || '');
              setReviewMsgId(msgId || null);
              setIsReviewModalOpen(true);
            }}
            onOpenQRModal={() => setIsQRModalOpen(true)}
            onOpenSettings={() => {
              setSettingsInitialTab('whatsapp');
              setIsSettingsModalOpen(true);
            }}
          />
        </main>

        {/* نافذة ربط واتساب بالرمز QR */}
        {isQRModalOpen && <WhatsAppQRModal
          isOpen={isQRModalOpen}
          onClose={() => setIsQRModalOpen(false)}
        />}

        {/* نافذة المراجعة والتدقيق السريعة */}
        {isReviewModalOpen && <QuickReviewModal
          isOpen={isReviewModalOpen}
          onClose={() => setIsReviewModalOpen(false)}
          transferData={reviewTransfer}
          receiptImageUrl={reviewImage}
          onSuccess={() => {
            setIsReviewModalOpen(false);
            if (reviewMsgId) {
              try {
                const saved = localStorage.getItem('hawalat_msg_status');
                const prev = saved ? JSON.parse(saved) : {};
                const updated = {
                  ...prev,
                  [reviewMsgId]: {
                    ...(prev[reviewMsgId] || {}),
                    airtable: true,
                    isReceived: true,
                  },
                };
                localStorage.setItem('hawalat_msg_status', JSON.stringify(updated));
                fetch('/api/whatsapp/messages', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    id: reviewMsgId,
                    updates: {
                      airtable: true,
                      isReceived: true,
                    },
                  }),
                }).catch(() => {});
              } catch (e) {}
            }
            toast.success('تم اعتماد وتسجيل الحوالة بنجاح، وتحديث حالتها إلى [تم استلامها ومسجلة].', 'اعتماد الحوالة');
          }}
        />}

        {/* نافذة الإعدادات الشاملة الموحدة للنظام */}
        {isSettingsModalOpen && <SystemSettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          waStatus={waStatus}
          currentUser={currentUser}
          budget={budget}
          onOpenQRModal={() => setIsQRModalOpen(true)}
          onOpenDashboard={() => {}}
          onRefreshBudget={() => void fetchBudget(true)}
          onLogout={handleLogout}
          initialTab={settingsInitialTab}
        />}
      </div>
    );
  }

  return (
    <div ref={appViewportRef} className="fixed inset-x-0 top-0 h-dvh md:static md:h-screen w-full max-w-full overflow-hidden bg-[#161717] flex flex-col font-sans select-none" dir="rtl">
      {/* شريط التحقق من وجود إضافة المتصفح على أي جهاز */}
      <ExtensionDetectorBanner />

      {/* شريط التحكم العلوي المدمج (46px فقط بدون أي إهدار للمساحة) */}
      <header className="h-11 bg-[#161717] border-b border-[#2e2f2f] px-4 hidden md:flex items-center justify-between shrink-0 z-30 select-none">
        {/* الجانب الأيمن: التبديل بين الصفحات */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 pl-3 border-l border-[#2e2f2f]">
            <img src="/icons/icon-192.png?v=5" alt="واتساب" className="w-6 h-6 rounded-md shadow-xs object-contain" />
            <span className="text-xs font-bold text-white tracking-wide">نظام الحوالات</span>
          </div>

          {/* أزرار التبديل الرئيسية */}
          <div className="flex items-center bg-[#161717] p-0.5 rounded-lg border border-[#2e2f2f]">
            <button
              onClick={() => navigateToView('whatsapp')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                currentView === 'whatsapp'
                  ? 'bg-[#21c063] text-white shadow-xs'
                  : 'text-[#a5a5a5] hover:text-[#fafafa]'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>واجهة واتساب ويب</span>
            </button>

            <button
              onClick={() => { setHasOpenedInbox(true); navigateToView('inbox'); }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                currentView === 'inbox'
                  ? 'bg-[#21c063] text-white shadow-xs'
                  : 'text-[#a5a5a5] hover:text-[#fafafa]'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>وارد الحوالات</span>
            </button>

            <button
              onClick={() => navigateToView('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                currentView === 'dashboard'
                  ? 'bg-[#21c063] text-white shadow-xs'
                  : 'text-[#a5a5a5] hover:text-[#fafafa]'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>لوحة التحكم وأيرتيبل</span>
            </button>
          </div>
        </div>

        {/* الجانب الأيسر: رصيد أيرتيبل، وزر الإعدادات الشامل الجديد */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => { setSettingsInitialTab('drive'); setIsSettingsModalOpen(true); }}
            className="flex min-h-9 items-center gap-1.5 rounded-lg border border-[#2e2f2f] px-2.5 text-xs font-bold text-[#a5a5a5] hover:border-emerald-500/40 hover:text-white"
            aria-label="إعدادات النظام ونسخة Google Drive"
          >
            <Settings className="h-4 w-4" />
            <span>الإعدادات</span>
          </button>
          {/* شارة حالة اتصال أيرتيبل المباشرة مع رصيد المتبقي الحي */}
          <div
            onClick={() => navigateToView('dashboard')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1a1c1c] border border-[#2e2f2f] text-xs cursor-pointer hover:border-emerald-500/40 transition-colors"
            title={budget ? `أيرتيبل - المتبقي للشركة: ${budget.companyRemaining} JOD` : 'تعذر تحميل رصيد أيرتيبل'}
          >
            <span className={`w-2 h-2 rounded-full ${budget ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <Database className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[#a5a5a5] hidden sm:inline">أيرتيبل:</span>
            <span className="text-emerald-400 font-bold font-mono">
              {budget ? `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(budget.companyRemaining)} JOD` : 'غير متاح'}
            </span>
          </div>

          {/* زر تسجيل الخروج السريع */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleLogout}
            className="h-7 text-xs text-[#a5a5a5] hover:text-rose-400 hover:bg-rose-500/10 px-2 rounded-lg cursor-pointer gap-1"
            title="تسجيل الخروج من النظام"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">خروج</span>
          </Button>
        </div>
      </header>

      {/* منطقة العرض الرئيسية كاملة الشاشة بدون أي هوامش */}
      <main className="flex-1 min-h-0 w-full md:h-[calc(100vh-44px)] overflow-hidden">
        {/* نحمّل المحادثات عند أول فتح فقط، ثم نبقيها مركبة لتجنب إعادة الاتصال. */}
        {hasOpenedWhatsApp ? <div className={currentView === 'whatsapp' ? 'h-full w-full' : 'hidden'} aria-hidden={currentView !== 'whatsapp'}>
          {whatsappInterface}
        </div> : currentView === 'whatsapp' ? <div className="flex h-full items-center justify-center bg-[#161717] text-sm text-slate-300">جارٍ فتح التطبيق...</div> : null}
        {(currentView === 'inbox' || hasOpenedInbox) && <div className={currentView === 'inbox' ? 'h-full w-full' : 'hidden'} aria-hidden={currentView !== 'inbox'}>
          <TransferInbox active={currentView === 'inbox'} onOpenMessage={(chat: string, chatName: string, messageId: string) => {
            setJumpTarget({ chat, chatName, messageId });
            setHasOpenedWhatsApp(true);
            navigateToView('whatsapp');
          }} />
        </div>}
        {currentView === 'dashboard' ? (
          /* صفحة لوحة التحكم وأيرتيبل المستقلة */
          <div className="h-full w-full overflow-y-auto p-4 sm:p-8 flex flex-col gap-6 bg-[#161717]">
            <AirtableDashboard budget={budget} loading={isBudgetLoading} onRefresh={() => void fetchBudget(true)} onBudgetUpdate={setBudget} />
          </div>
        ) : null}
      </main>

      {(!mobileChatOpen || currentView !== 'whatsapp') && (
        <nav className="relative z-30 grid w-full max-w-full shrink-0 grid-cols-4 overflow-hidden border-t border-[#2e2f2f] bg-[#161717] px-1 py-1 pb-[max(8px,env(safe-area-inset-bottom))] md:hidden" aria-label="التنقل الرئيسي">
          <button type="button" onClick={() => { setHasOpenedWhatsApp(true); navigateToView('whatsapp'); }} className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-bold ${currentView === 'whatsapp' ? 'bg-[#144d37] text-[#21c063]' : 'text-[#a5a5a5]'}`} aria-current={currentView === 'whatsapp' ? 'page' : undefined}>
            <MessageSquare className="h-5 w-5 shrink-0" /><span className="max-w-full truncate px-1">المحادثات</span>
          </button>
          <button type="button" onClick={() => navigateToView('dashboard')} className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-bold ${currentView === 'dashboard' ? 'bg-[#144d37] text-[#21c063]' : 'text-[#a5a5a5]'}`} aria-current={currentView === 'dashboard' ? 'page' : undefined}>
            <LayoutDashboard className="h-5 w-5 shrink-0" /><span className="max-w-full truncate px-1">لوحة التحكم</span>
          </button>
          <button type="button" onClick={() => { setHasOpenedInbox(true); navigateToView('inbox'); }} className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-bold ${currentView === 'inbox' ? 'bg-[#144d37] text-[#21c063]' : 'text-[#a5a5a5]'}`} aria-current={currentView === 'inbox' ? 'page' : undefined}>
            <Inbox className="h-5 w-5 shrink-0" /><span className="max-w-full truncate px-1">الوارد</span>
          </button>
          <button type="button" onClick={() => { setSettingsInitialTab('mobile'); setIsSettingsModalOpen(true); }} className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-bold text-[#a5a5a5]">
            <Settings className="h-5 w-5 shrink-0" /><span className="max-w-full truncate px-1">الإعدادات</span>
          </button>
        </nav>
      )}

      {/* نافذة ربط واتساب بالرمز QR */}
      {isQRModalOpen && <WhatsAppQRModal
        isOpen={isQRModalOpen}
        onClose={() => setIsQRModalOpen(false)}
      />}

      {/* نافذة المراجعة والتدقيق السريعة */}
      {isReviewModalOpen && <QuickReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        transferData={reviewTransfer}
        receiptImageUrl={reviewImage}
        onSuccess={() => {
          setIsReviewModalOpen(false);
          if (reviewMsgId) {
            try {
              const saved = localStorage.getItem('hawalat_msg_status');
              const prev = saved ? JSON.parse(saved) : {};
              const updated = {
                ...prev,
                [reviewMsgId]: {
                  ...(prev[reviewMsgId] || {}),
                  airtable: true,
                  isReceived: true,
                },
              };
              localStorage.setItem('hawalat_msg_status', JSON.stringify(updated));
              fetch('/api/whatsapp/messages', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: reviewMsgId,
                  updates: {
                    airtable: true,
                    isReceived: true,
                  },
                }),
              }).catch(() => {});
            } catch (e) {}
          }
          toast.success('تم اعتماد وتسجيل الحوالة بنجاح، وتحديث حالتها إلى [تم استلامها ومسجلة].', 'اعتماد الحوالة');
        }}
      />}
      {/* نافذة الوصول من الهاتف عبر النفق السحابي */}
      {isPhoneModalOpen && <PhoneAccessModal
        isOpen={isPhoneModalOpen}
        onClose={() => setIsPhoneModalOpen(false)}
      />}

      {/* نافذة الإعدادات الشاملة الموحدة للنظام */}
      {isSettingsModalOpen && <SystemSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        waStatus={waStatus}
        currentUser={currentUser}
        budget={budget}
        onOpenQRModal={() => setIsQRModalOpen(true)}
        onOpenDashboard={() => navigateToView('dashboard')}
        onRefreshBudget={() => void fetchBudget(true)}
        onLogout={handleLogout}
        initialTab={settingsInitialTab}
      />}
    </div>
  );
}
