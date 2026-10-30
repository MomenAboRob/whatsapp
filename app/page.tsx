"use client";

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

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

export default function HomePage() {
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [popoutChat, setPopoutChat] = useState<string | null>(null);

  useEffect(() => {
    setPopoutChat(new URLSearchParams(window.location.search).get('popoutChat'));
  }, []);

  return (
    <main className="h-dvh w-full overflow-hidden bg-[#161717]">
      <WhatsAppChatInterface
        isPopoutMode={Boolean(popoutChat)}
        initialChat={popoutChat || ''}
        onOpenReview={() => {}}
        onOpenQRModal={() => setIsQRModalOpen(true)}
      />
      {isQRModalOpen && (
        <WhatsAppQRModal
          isOpen={isQRModalOpen}
          onClose={() => setIsQRModalOpen(false)}
        />
      )}
    </main>
  );
}
