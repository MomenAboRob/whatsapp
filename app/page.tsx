"use client";

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { FileDigit, LayoutDashboard, MessageSquare, Send, Settings } from 'lucide-react';
import { WhatsAppWorkspace } from '@/components/whatsapp-workspace';
import { WhatsAppNumberCenter } from '@/components/whatsapp-number-center';

const WhatsAppChatInterface = dynamic(
  () => import('@/components/whatsapp-chat-interface').then((module) => module.WhatsAppChatInterface),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#161717] text-sm text-slate-300">
        جارٍ فتح المحادثات...
      </div>
    ),
  },
);

const WhatsAppQRModal = dynamic(
  () => import('@/components/whatsapp-qr-modal').then((module) => module.WhatsAppQRModal),
);
const SystemSettingsModal = dynamic(
  () => import('@/components/system-settings-modal').then((module) => module.SystemSettingsModal),
);

export default function HomePage() {
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [popoutChat, setPopoutChat] = useState<string | null>(null);
  const [view, setView] = useState<'whatsapp' | 'dashboard' | 'compose' | 'numbers'>('whatsapp');
  const [selectedChat, setSelectedChat] = useState('');
  const [composeTarget, setComposeTarget] = useState('');
  const [composeText, setComposeText] = useState('');
  const [composeRevision, setComposeRevision] = useState(0);
  const [taskRevision, setTaskRevision] = useState(0);
  const [taskMessage, setTaskMessage] = useState<{ id: string; chatName: string; text: string } | null>(null);
  const [newMentions, setNewMentions] = useState(0);
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [waStatus, setWaStatus] = useState<any>(null);
  const seenMentions = useRef<Set<string> | null>(null);

  useEffect(() => {
    setPopoutChat(new URLSearchParams(window.location.search).get('popoutChat'));
  }, []);
  useEffect(() => {
    if (popoutChat) return;
    const check = async () => {
      try {
        const response = await fetch('/api/whatsapp/workspace?summary=1', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        const current = new Set<string>((data.mentions || []).map((item: { id: string }) => item.id));
        setNewMentions((data.mentions || []).filter((item: { decision: string }) => item.decision === 'new').length);
        if (seenMentions.current && data.settings?.browserEnabled && 'Notification' in window && Notification.permission === 'granted') {
          for (const item of data.mentions || []) {
            if (seenMentions.current.has(item.id)) continue;
            new Notification(`منشن جديد في ${item.chatName}`, { body: `${item.sender}: ${item.text || 'رسالة وسائط'}`.slice(0, 160), tag: `mention-${item.id}` });
          }
        }
        seenMentions.current = current;
      } catch {}
    };
    void check();
    const timer = window.setInterval(() => { void check(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [popoutChat]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    void Promise.all([
      fetch('/api/auth/me').then((response) => response.json()),
      fetch('/api/whatsapp/status').then((response) => response.json()),
    ]).then(([auth, status]) => {
      setCurrentUser(auth.user || null);
      setWaStatus(status);
    }).catch(() => {});
  }, [isSettingsOpen]);

  const openCompose = (target = '', text = '') => {
    setComposeTarget(target);
    setComposeText(text);
    setComposeRevision((revision) => revision + 1);
    setView('compose');
  };

  const openChat = (jid: string) => {
    setSelectedChat(jid);
    setView('whatsapp');
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.replace('/login');
  };

  return (
    <main className="flex h-dvh w-full flex-col overflow-hidden bg-[#161717]">
      {!popoutChat && <nav dir="rtl" className="flex h-14 shrink-0 items-center gap-1 border-b border-[#2e2f2f] bg-[#151b18] px-2 text-white sm:px-4">
        <span className="ml-3 hidden text-sm font-black text-[#21c063] sm:inline">واتساب</span>
        <NavButton active={view === 'whatsapp'} onClick={() => setView('whatsapp')} icon={MessageSquare}>المحادثات</NavButton>
        <NavButton active={view === 'dashboard'} onClick={() => setView('dashboard')} icon={LayoutDashboard} badge={newMentions}>الداشبورد</NavButton>
        <NavButton active={view === 'numbers'} onClick={() => setView('numbers')} icon={FileDigit}>مركز الملفات</NavButton>
        <NavButton active={view === 'compose'} onClick={() => openCompose()} icon={Send}>إرسال لعدة جهات</NavButton>
        <div className="flex-1" />
        <NavButton active={false} onClick={() => setIsSettingsOpen(true)} icon={Settings}>الإعدادات</NavButton>
      </nav>}
      <div className={`min-h-0 flex-1 ${view === 'whatsapp' || popoutChat ? 'block' : 'hidden'}`}>
        <WhatsAppChatInterface
          key={selectedChat || popoutChat || 'main'}
          isPopoutMode={Boolean(popoutChat)}
          initialChat={selectedChat || popoutChat || ''}
          onOpenReview={() => {}}
          onOpenQRModal={() => setIsQRModalOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onScheduleChat={(chat, text) => openCompose(chat.id, text)}
          onCreateTask={(message) => {
            if (popoutChat) {
              window.history.replaceState(null, '', '/');
              setPopoutChat(null);
            }
            setTaskMessage({ id: message.id, chatName: message.chatName || 'محادثة', text: message.text || 'رسالة وسائط' });
            setTaskRevision((revision) => revision + 1);
            setView('dashboard');
          }}
        />
      </div>
      {!popoutChat && view === 'numbers' && <div className="min-h-0 flex-1"><WhatsAppNumberCenter /></div>}
      {!popoutChat && (view === 'dashboard' || view === 'compose') && <div className="min-h-0 flex-1">
        <WhatsAppWorkspace
          key={`${view}-${composeRevision}-${taskRevision}`}
          view={view}
          initialTarget={composeTarget}
          initialText={composeText}
          initialTask={taskMessage}
          onOpenChat={openChat}
          onTaskDraftConsumed={() => setTaskMessage(null)}
        />
      </div>}
      {isQRModalOpen && (
        <WhatsAppQRModal
          isOpen={isQRModalOpen}
          onClose={() => setIsQRModalOpen(false)}
        />
      )}
      {isSettingsOpen && <SystemSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        waStatus={waStatus}
        currentUser={currentUser}
        budget={null}
        onOpenQRModal={() => setIsQRModalOpen(true)}
        onLogout={() => void logout()}
      />}
    </main>
  );
}

function NavButton({ active, onClick, icon: Icon, badge, children }: {
  active: boolean;
  onClick: () => void;
  icon: typeof MessageSquare;
  badge?: number;
  children: React.ReactNode;
}) {
  return <button type="button" onClick={onClick} className={`relative flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-bold transition-colors sm:px-3 ${active ? 'bg-[#21c063]/15 text-[#21c063]' : 'text-[#b1beb6] hover:bg-white/5 hover:text-white'}`}>
    <Icon className="h-4 w-4" />
    <span className="hidden sm:inline">{children}</span>
    {badge ? <span className="rounded-full bg-[#21c063] px-1.5 text-[10px] text-[#092116]">{badge}</span> : null}
  </button>;
}
