"use client";

import React, { useState, useEffect } from 'react';
import { X, Download, ExternalLink, ZoomIn, ZoomOut, RotateCcw, Building, User } from 'lucide-react';
import { handleMediaDragStart, handleMediaDragEnd } from '@/lib/drag-drop-media';

interface WhatsappAvatarLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  avatarUrl?: string;
  name: string;
  subtitle?: string;
  isGroup?: boolean;
}

export function WhatsappAvatarLightbox({
  isOpen,
  onClose,
  avatarUrl,
  name,
  subtitle,
  isGroup,
}: WhatsappAvatarLightboxProps) {
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  useEffect(() => {
    if (!isOpen) {
      setZoomLevel(1);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (!avatarUrl) return;
    const a = document.createElement('a');
    a.href = avatarUrl;
    a.download = `avatar-${name.replace(/\s+/g, '_')}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpenExternal = () => {
    if (avatarUrl) {
      window.open(avatarUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-md flex flex-col justify-between p-3 sm:p-6 animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      {/* الشريط العلوي للتحكم والعنوان */}
      <div
        className="w-full flex items-center justify-between gap-3 text-white bg-black/40 border border-white/10 rounded-2xl px-4 py-3 shrink-0 backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col min-w-0">
          <h3 className="text-base sm:text-lg font-bold truncate text-[#fafafa]">{name}</h3>
          {subtitle && (
            <span className="text-xs text-[#8696a0] truncate font-mono mt-0.5">{subtitle}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {avatarUrl && (
            <>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                className="p-2 rounded-xl text-[#a5a5a5] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="تكبير"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(0.75, z - 0.25))}
                className="p-2 rounded-xl text-[#a5a5a5] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="تصغير"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              {zoomLevel !== 1 && (
                <button
                  type="button"
                  onClick={() => setZoomLevel(1)}
                  className="p-2 rounded-xl text-[#a5a5a5] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="إعادة ضبط الحجم"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
              )}
              <button
                type="button"
                onClick={handleDownload}
                className="p-2 rounded-xl text-[#a5a5a5] hover:text-emerald-400 hover:bg-white/10 transition-colors cursor-pointer"
                title="تنزيل الصورة"
              >
                <Download className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleOpenExternal}
                className="p-2 rounded-xl text-[#a5a5a5] hover:text-sky-400 hover:bg-white/10 transition-colors cursor-pointer"
                title="فتح في تبويب جديد"
              >
                <ExternalLink className="w-5 h-5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[#a5a5a5] hover:text-rose-400 hover:bg-white/10 transition-colors cursor-pointer ml-1"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* منطقة عرض الصورة الكاملة في المنتصف */}
      <div
        className="flex-1 flex items-center justify-center p-2 sm:p-6 overflow-hidden"
        onClick={onClose}
      >
        {avatarUrl ? (
          <div
            className="relative w-full h-full min-h-0 flex items-center justify-center transition-transform duration-150"
            style={{ transform: `scale(${zoomLevel})` }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={avatarUrl}
              alt={name}
              draggable={true}
              onDragStart={(e) => {
                handleMediaDragStart(e, avatarUrl, { fallbackName: `avatar_${name}` });
              }}
              onDragEnd={handleMediaDragEnd}
              className="w-full h-full max-w-[94vw] max-h-[calc(100dvh-9rem)] object-contain rounded-2xl shadow-2xl border border-white/10 cursor-grab active:cursor-grabbing select-none"
              title="اسحب صورة البروفايل إلى سطح المكتب أو أي مكان"
            />
          </div>
        ) : (
          <div
            className="w-64 h-64 sm:w-80 sm:h-80 rounded-full bg-[#182229] border-2 border-dashed border-[#2a3942] flex flex-col items-center justify-center gap-4 text-[#8696a0]"
            onClick={(e) => e.stopPropagation()}
          >
            {isGroup ? (
              <Building className="w-24 h-24 text-emerald-400/60" />
            ) : (
              <User className="w-24 h-24 text-sky-400/60" />
            )}
            <span className="text-sm font-semibold text-[#8696a0]">
              لا توجد صورة بروفايل مخصصة
            </span>
          </div>
        )}
      </div>

      {/* شريط الإرشادات السفلي */}
      <div className="text-center text-xs text-[#8696a0]/80 py-2 shrink-0">
        اضغط مفتاح الهروب (Esc) أو انقر خارج الصورة للإغلاق
      </div>
    </div>
  );
}
