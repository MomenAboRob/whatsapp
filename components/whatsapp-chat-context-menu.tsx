"use client";

import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  Volume2,
  VolumeX,
  Pin,
  PinOff,
  CheckSquare,
  Mail,
  Heart,
  ListFilter,
  Trash2,
  LogOut,
  ChevronLeft,
  Plus,
  Check,
  Info,
  ExternalLink,
} from 'lucide-react';

export interface ChatContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  chat: any;
  isPinned: boolean;
  isArchived: boolean;
  isMuted: boolean;
  isUnread: boolean;
  isFavorite: boolean;
  customLists: Record<string, string[]>;
  onClose: () => void;
  onOpenInfo: (chat: any) => void;
  onPopoutChat?: (chat: any) => void;
  onTogglePin: (chat: any) => void;
  onToggleArchive: (chat: any) => void;
  onMute: (chat: any, duration: '8h' | '1w' | 'always' | 'unmute') => void;
  onToggleUnread: (chat: any) => void;
  onToggleFavorite: (chat: any) => void;
  onToggleCustomList: (chat: any, listName: string) => void;
  onCreateNewList: () => void;
  onClearChat: (chat: any) => void;
  onExitOrDelete: (chat: any) => void;
}

export function WhatsappChatContextMenu({
  isOpen,
  x,
  y,
  chat,
  isPinned,
  isArchived,
  isMuted,
  isUnread,
  isFavorite,
  customLists,
  onClose,
  onOpenInfo,
  onPopoutChat,
  onTogglePin,
  onToggleArchive,
  onMute,
  onToggleUnread,
  onToggleFavorite,
  onToggleCustomList,
  onCreateNewList,
  onClearChat,
  onExitOrDelete,
}: ChatContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<'mute' | 'lists' | null>(null);

  // إغلاق عند الضغط على Escape أو النقر خارج القائمة
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    setActiveSubmenu(null);
  }, [isOpen, chat]);

  if (!isOpen || !chat) return null;

  // احتساب إحداثيات ظهور القائمة بحيث لا تخرج خارج حدود الشاشة
  const menuWidth = 240;
  const menuHeight = 410;
  const screenW = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const screenH = typeof window !== 'undefined' ? window.innerHeight : 800;

  let posX = x;
  let posY = y;

  if (posX + menuWidth > screenW - 12) {
    posX = Math.max(12, screenW - menuWidth - 12);
  }
  if (posY + menuHeight > screenH - 12) {
    posY = Math.max(12, screenH - menuHeight - 12);
  }

  const chatKey = chat.id || chat.name;
  const listNames = Object.keys(customLists);

  return (
    <>
      {/* طبقة حماية شفافة لإلغاء القائمة عند النقر بالخارج */}
      <div
        className="fixed inset-0 z-[100] bg-black/20 md:bg-transparent"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      {/* الحاوية الرئيسية للقائمة السياقية (مطابقة للقطة شاشة واتساب بيتا تماماً) */}
      <div
        ref={menuRef}
        dir="rtl"
        style={{ top: `${posY}px`, left: `${posX}px` }}
        className="fixed z-[101] w-60 bg-[#233138] border border-[#2a3942] rounded-2xl shadow-2xl shadow-black/80 py-1.5 px-1 text-[#d1d7db] animate-in fade-in zoom-in-95 duration-100 select-none font-sans"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* معلومات المحادثة / المجموعة */}
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenInfo(chat);
          }}
          className="w-full flex items-center justify-between px-3 py-2 text-[13px] text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl text-right cursor-pointer transition-colors group"
        >
          <div className="flex items-center gap-3">
            <Info className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] shrink-0" />
            <span>{chat.isGroup ? 'معلومات المجموعة' : 'بيانات المحادثة'}</span>
          </div>
        </button>

        {/* فتح في نافذة مستقلة (Pop-out Window) */}
        {onPopoutChat && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onPopoutChat(chat);
            }}
            className="w-full flex items-center justify-between px-3 py-2 text-[13px] text-[#d1d7db] hover:text-[#21c063] hover:bg-[#182229] rounded-xl text-right cursor-pointer transition-colors group"
          >
            <div className="flex items-center gap-3">
              <ExternalLink className="w-4 h-4 text-[#8696a0] group-hover:text-[#21c063] shrink-0 transition-colors" />
              <span className="font-medium">فتح في نافذة مستقلة (Pop-out)</span>
            </div>
          </button>
        )}

        {/* أرشفة المحادثة (Archive chat) */}
        <button
          type="button"
          onClick={() => onToggleArchive(chat)}
          className="w-full flex items-center justify-between px-3 py-2 text-[13px] text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl text-right cursor-pointer transition-colors group"
        >
          <div className="flex items-center gap-3">
            <Archive className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] shrink-0" />
            <span>{isArchived ? 'إلغاء أرشفة المحادثة' : 'أرشفة المحادثة'}</span>
          </div>
        </button>

        {/* كتم الإشعارات (Mute notifications >) */}
        <div
          className="relative"
          onMouseEnter={() => setActiveSubmenu('mute')}
          onMouseLeave={() => setActiveSubmenu((cur) => (cur === 'mute' ? null : cur))}
        >
          <button
            type="button"
            onClick={() => {
              if (isMuted) {
                onMute(chat, 'unmute');
              } else {
                setActiveSubmenu((cur) => (cur === 'mute' ? null : 'mute'));
              }
            }}
            className={`w-full flex items-center justify-between px-3 py-2 text-[13px] rounded-xl text-right cursor-pointer transition-colors group ${
              activeSubmenu === 'mute' ? 'bg-[#182229] text-[#e9edef]' : 'text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229]'
            }`}
          >
            <div className="flex items-center gap-3">
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] shrink-0" />
              ) : (
                <Volume2 className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] shrink-0" />
              )}
              <span>{isMuted ? 'إلغاء كتم الإشعارات' : 'كتم الإشعارات'}</span>
            </div>
            {!isMuted && <ChevronLeft className="w-4 h-4 text-[#8696a0] shrink-0" />}
          </button>

          {/* القائمة الفرعية لمدد الكتم */}
          {activeSubmenu === 'mute' && !isMuted && (
            <div
              dir="rtl"
              className="absolute top-0 right-full mr-1.5 w-44 bg-[#233138] border border-[#2a3942] rounded-xl shadow-2xl p-1 flex flex-col gap-0.5 z-20 animate-in fade-in duration-100"
            >
              <button
                type="button"
                onClick={() => onMute(chat, '8h')}
                className="w-full text-right px-3 py-2 text-xs text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-lg cursor-pointer"
              >
                8 ساعات
              </button>
              <button
                type="button"
                onClick={() => onMute(chat, '1w')}
                className="w-full text-right px-3 py-2 text-xs text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-lg cursor-pointer"
              >
                أسبوع واحد
              </button>
              <button
                type="button"
                onClick={() => onMute(chat, 'always')}
                className="w-full text-right px-3 py-2 text-xs text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-lg cursor-pointer"
              >
                دائماً
              </button>
            </div>
          )}
        </div>

        {/* تثبيت المحادثة (Pin chat) */}
        <button
          type="button"
          onClick={() => onTogglePin(chat)}
          className="w-full flex items-center justify-between px-3 py-2 text-[13px] text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl text-right cursor-pointer transition-colors group"
        >
          <div className="flex items-center gap-3">
            {isPinned ? (
              <PinOff className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] shrink-0" />
            ) : (
              <Pin className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] shrink-0" />
            )}
            <span>{isPinned ? 'إلغاء تثبيت المحادثة' : 'تثبيت المحادثة'}</span>
          </div>
        </button>

        {/* تحديد كغير مقروءة (Mark as unread) */}
        <button
          type="button"
          onClick={() => onToggleUnread(chat)}
          className="w-full flex items-center justify-between px-3 py-2 text-[13px] text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl text-right cursor-pointer transition-colors group"
        >
          <div className="flex items-center gap-3">
            {isUnread ? (
              <CheckSquare className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] shrink-0" />
            ) : (
              <Mail className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] shrink-0" />
            )}
            <span>{isUnread ? 'تحديد كمقروءة' : 'تحديد كغير مقروءة'}</span>
          </div>
        </button>

        {/* إضافة إلى المفضلة (Add to Favorites) */}
        <button
          type="button"
          onClick={() => onToggleFavorite(chat)}
          className="w-full flex items-center justify-between px-3 py-2 text-[13px] text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl text-right cursor-pointer transition-colors group"
        >
          <div className="flex items-center gap-3">
            <Heart
              className={`w-4 h-4 shrink-0 transition-colors ${
                isFavorite
                  ? 'text-rose-500 fill-rose-500'
                  : 'text-[#8696a0] group-hover:text-[#aebac1]'
              }`}
            />
            <span>{isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}</span>
          </div>
        </button>

        {/* تعديل القوائم (Change list >) - ميزة قوائم واتساب الأصلية */}
        <div
          className="relative"
          onMouseEnter={() => setActiveSubmenu('lists')}
          onMouseLeave={() => setActiveSubmenu((cur) => (cur === 'lists' ? null : cur))}
        >
          <button
            type="button"
            onClick={() => setActiveSubmenu((cur) => (cur === 'lists' ? null : 'lists'))}
            className={`w-full flex items-center justify-between px-3 py-2 text-[13px] rounded-xl text-right cursor-pointer transition-colors group ${
              activeSubmenu === 'lists' ? 'bg-[#182229] text-[#e9edef]' : 'text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229]'
            }`}
          >
            <div className="flex items-center gap-3">
              <ListFilter className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] shrink-0" />
              <span>تعديل القوائم</span>
            </div>
            <ChevronLeft className="w-4 h-4 text-[#8696a0] shrink-0" />
          </button>

          {/* القائمة الفرعية للقوائم المخصصة مع خانات الاختيار */}
          {activeSubmenu === 'lists' && (
            <div
              dir="rtl"
              className="absolute top-0 right-full mr-1.5 w-52 bg-[#233138] border border-[#2a3942] rounded-xl shadow-2xl p-1.5 flex flex-col gap-1 z-20 animate-in fade-in duration-100 max-h-64 overflow-y-auto"
            >
              <div className="text-[11px] font-bold text-[#8696a0] px-2 py-1 select-none">
                قوائم واتساب
              </div>
              {listNames.map((listName) => {
                const isChecked = (customLists[listName] || []).includes(chatKey) || (customLists[listName] || []).includes(chat.name);
                return (
                  <button
                    key={listName}
                    type="button"
                    onClick={() => onToggleCustomList(chat, listName)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-[#d1d7db] hover:text-white hover:bg-[#182229] rounded-lg cursor-pointer transition-colors"
                  >
                    <span className="truncate">{listName}</span>
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
                        isChecked
                          ? 'bg-[#21c063] border-[#21c063] text-white'
                          : 'border-[#8696a0]/50'
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}

              <div className="border-t border-[#2a3942] my-1" />

              <button
                type="button"
                onClick={onCreateNewList}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[#21c063] hover:text-[#1daa55] hover:bg-[#182229] rounded-lg cursor-pointer font-bold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>قائمة جديدة</span>
              </button>
            </div>
          )}
        </div>

        {/* خط فاصل رمادي أنيق مثل واتساب تماماً */}
        <div className="border-t border-[#2a3942] my-1" />

        {/* مسح محتوى المحادثة (Clear chat) */}
        <button
          type="button"
          onClick={() => onClearChat(chat)}
          className="w-full flex items-center justify-between px-3 py-2 text-[13px] text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl text-right cursor-pointer transition-colors group"
        >
          <div className="flex items-center gap-3">
            <Trash2 className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] shrink-0" />
            <span>مسح محتوى المحادثة</span>
          </div>
        </button>

        {/* مغادرة المجموعة أو حذف المحادثة (Exit group / Delete chat) */}
        <button
          type="button"
          onClick={() => onExitOrDelete(chat)}
          className="w-full flex items-center justify-between px-3 py-2 text-[13px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl text-right cursor-pointer transition-colors group"
        >
          <div className="flex items-center gap-3">
            {chat.isGroup ? (
              <LogOut className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{chat.isGroup ? 'مغادرة المجموعة' : 'حذف المحادثة'}</span>
          </div>
        </button>
      </div>
    </>
  );
}
