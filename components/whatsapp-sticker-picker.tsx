"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Star,
  Clock,
  Plus,
  Smile,
  X,
  Sparkles,
  Download,
  Check,
  Film,
  Layers,
  Heart,
  Image as ImageIcon,
} from 'lucide-react';
import { BUILTIN_STICKER_PACKS, WhatsAppSticker, StickerPack, searchStickersInStore } from '@/lib/sticker-store';

interface WhatsAppStickerPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSendSticker: (stickerUrl: string) => void;
  favoriteStickers: WhatsAppSticker[];
  onToggleFavorite: (stickerUrl: string, stickerTitle?: string) => void;
  recentStickers: string[];
  onInsertEmoji?: (emoji: string) => void;
}

export const WhatsAppStickerPicker = React.memo(function WhatsAppStickerPicker({
  isOpen,
  onClose,
  onSendSticker,
  favoriteStickers,
  onToggleFavorite,
  recentStickers,
  onInsertEmoji,
}: WhatsAppStickerPickerProps) {
  const [bottomTab, setBottomTab] = useState<'stickers' | 'emoji' | 'gif'>('stickers');
  const [activePackId, setActivePackId] = useState<string>('favorites');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isStoreModalOpen, setIsStoreModalOpen] = useState<boolean>(false);
  const [installedPackIds, setInstalledPackIds] = useState<string[]>(['pepe', 'cuppy', 'together', 'chat_gems']);
  const containerRef = useRef<HTMLDivElement>(null);

  // تحميل الحزم المفعلة من التخزين المحلي
  useEffect(() => {
    try {
      const saved = localStorage.getItem('hawalat_installed_sticker_packs');
      if (saved) {
        setInstalledPackIds(JSON.parse(saved));
      }
    } catch (e) {}
  }, []);

  const toggleInstallPack = (packId: string) => {
    setInstalledPackIds((prev) => {
      const exists = prev.includes(packId);
      const updated = exists ? prev.filter((id) => id !== packId) : [...prev, packId];
      try {
        localStorage.setItem('hawalat_installed_sticker_packs', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // قائمة الحزم المعروضة في التبويبات
  const visiblePacks = useMemo(() => {
    return BUILTIN_STICKER_PACKS.filter((p) => installedPackIds.includes(p.id));
  }, [installedPackIds]);

  // نتائج البحث في متجر ملصقات واتساب
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchStickersInStore(searchQuery, favoriteStickers);
  }, [searchQuery, favoriteStickers]);

  // ملصقات التبويب النشط
  const currentStickers: WhatsAppSticker[] = useMemo(() => {
    if (searchQuery.trim()) {
      return searchResults;
    }

    if (activePackId === 'recent') {
      // الملصقات الأخيرة
      const recentList: WhatsAppSticker[] = [];
      const allKnown = [
        ...favoriteStickers,
        ...BUILTIN_STICKER_PACKS.flatMap((p) => p.stickers),
      ];
      for (const url of recentStickers) {
        const found = allKnown.find((s) => s.url === url);
        if (found) {
          recentList.push(found);
        } else {
          recentList.push({
            id: `rec_${url}`,
            url,
            title: 'ملصق أخير',
            packId: 'recent',
          });
        }
      }
      return recentList;
    }

    if (activePackId === 'favorites') {
      return favoriteStickers;
    }

    const pack = BUILTIN_STICKER_PACKS.find((p) => p.id === activePackId);
    return pack ? pack.stickers : [];
  }, [activePackId, searchQuery, searchResults, favoriteStickers, recentStickers]);

  if (!isOpen) return null;

  return (
    <>
      {/* طبقة نقر شفافة بالخلف للإغلاق السلس */}
      <div className="fixed inset-0 z-40 bg-transparent" onClick={onClose} />

      {/* نافذة منتقي ومتجر الملصقات العائمة المطابقة لواتساب ويب تماماً */}
      <div
        ref={containerRef}
        dir="ltr"
        className="absolute bottom-full mb-3 right-2 sm:right-6 z-50 w-[420px] max-w-[95vw] h-[410px] bg-[#202c33] border border-[#2a3942] rounded-2xl shadow-2xl flex flex-col overflow-hidden select-none animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. الشريط العلوي لتبويبات الملصقات (🕒 أحدث، ⭐ المفضلة، حزم الملصقات، ➕ المتجر) */}
        {bottomTab === 'stickers' && (
          <div className="flex items-center px-1.5 pt-1.5 pb-0 bg-[#202c33] border-b border-[#2a3942]/70 shrink-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* التبويب 1: الملصقات الأخيرة 🕒 */}
            <button
              type="button"
              onClick={() => {
                setActivePackId('recent');
                setSearchQuery('');
              }}
              className={`px-3 h-9 flex flex-col items-center justify-center transition-colors relative cursor-pointer shrink-0 ${
                activePackId === 'recent' && !searchQuery ? 'text-[#00a884]' : 'text-[#8696a0] hover:text-[#e9edef]'
              }`}
              title="Recent stickers (الأحدث)"
            >
              <Clock className="w-4 h-4" />
              {activePackId === 'recent' && !searchQuery && (
                <span className="absolute bottom-0 left-2 right-2 h-[3px] bg-[#00a884] rounded-t-sm" />
              )}
            </button>

            {/* التبويب 2: المفضلة ⭐ (حيث تظهر أي ملصقات تم تعليمها بالنجمة من المحادثات) */}
            <button
              type="button"
              onClick={() => {
                setActivePackId('favorites');
                setSearchQuery('');
              }}
              className={`px-3 h-9 flex flex-col items-center justify-center transition-colors relative cursor-pointer shrink-0 ${
                activePackId === 'favorites' && !searchQuery ? 'text-amber-400' : 'text-[#8696a0] hover:text-[#e9edef]'
              }`}
              title={`Favorite stickers (المفضلة - ${favoriteStickers.length})`}
            >
              <Star className={`w-4 h-4 ${favoriteStickers.length > 0 ? 'fill-amber-400/20' : ''}`} />
              {activePackId === 'favorites' && !searchQuery && (
                <span className="absolute bottom-0 left-2 right-2 h-[3px] bg-[#00a884] rounded-t-sm" />
              )}
            </button>

            {/* حزم الملصقات المثبتة من المتجر */}
            {visiblePacks.map((pack) => (
              <button
                key={pack.id}
                type="button"
                onClick={() => {
                  setActivePackId(pack.id);
                  setSearchQuery('');
                }}
                className={`px-3 h-9 flex flex-col items-center justify-center transition-colors relative cursor-pointer shrink-0 text-base ${
                  activePackId === pack.id && !searchQuery ? 'scale-110' : 'opacity-70 hover:opacity-100'
                }`}
                title={pack.arabicName || pack.name}
              >
                <span>{pack.icon}</span>
                {activePackId === pack.id && !searchQuery && (
                  <span className="absolute bottom-0 left-2 right-2 h-[3px] bg-[#00a884] rounded-t-sm" />
                )}
              </button>
            ))}

            {/* زر فتح متجر ملصقات واتساب (+) */}
            <button
              type="button"
              onClick={() => setIsStoreModalOpen((prev) => !prev)}
              className={`px-3 h-9 flex flex-col items-center justify-center transition-colors cursor-pointer shrink-0 ml-auto ${
                isStoreModalOpen ? 'text-[#00a884]' : 'text-[#8696a0] hover:text-[#00a884]'
              }`}
              title="WhatsApp Sticker Store (متجر الملصقات)"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 2. شريط البحث في متجر الملصقات كواتساب ويب تماماً */}
        {bottomTab === 'stickers' && (
          <div className="p-2.5 bg-[#202c33] shrink-0 border-b border-[#2a3942]/40">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-[#8696a0] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search via WhatsApp sticker store"
                className="w-full bg-[#111b21] text-xs text-[#e9edef] placeholder-[#8696a0] rounded-lg pl-9 pr-8 py-2 border border-[#222e35] focus:border-[#00a884] focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8696a0] hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* 3. نافذة متجر الملصقات عند النقر على (+) */}
        {isStoreModalOpen ? (
          <div className="flex-1 overflow-y-auto p-3 [scrollbar-width:thin] [scrollbar-color:#374045_transparent]">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#2a3942]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#00a884]" />
                <span className="text-xs font-bold text-[#e9edef]">WhatsApp Sticker Store (متجر الملصقات)</span>
              </div>
              <button
                type="button"
                onClick={() => setIsStoreModalOpen(false)}
                className="text-xs text-[#8696a0] hover:text-white underline cursor-pointer"
              >
                العودة
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              {BUILTIN_STICKER_PACKS.map((pack) => {
                const isInstalled = installedPackIds.includes(pack.id);
                return (
                  <div
                    key={pack.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#111b21] border border-[#222e35] hover:border-[#2a3942] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#202c33] flex items-center justify-center text-2xl shrink-0">
                        {pack.icon}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#e9edef] flex items-center gap-1.5">
                          <span>{pack.arabicName}</span>
                          <span className="text-[10px] font-normal text-[#8696a0]">({pack.stickers.length})</span>
                        </div>
                        <div className="text-[10px] text-[#8696a0]">{pack.author}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleInstallPack(pack.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                        isInstalled
                          ? 'bg-[#202c33] text-[#8696a0] hover:text-rose-400'
                          : 'bg-[#00a884] hover:bg-[#009475] text-white'
                      }`}
                    >
                      {isInstalled ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#00a884]" />
                          <span>مثبتة</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>إضافة</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : bottomTab === 'stickers' ? (
          /* 4. شبكة عرض الملصقات (Grid 5 أعمدة كواتساب ويب) */
          <div className="flex-1 overflow-y-auto p-3 [scrollbar-width:thin] [scrollbar-color:#374045_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-[#374045] [&::-webkit-scrollbar-thumb]:rounded-full">
            {searchQuery.trim() && (
              <div className="text-[11px] font-semibold text-[#8696a0] mb-2 px-1">
                Sticker Store Results ({searchResults.length})
              </div>
            )}

            {activePackId === 'favorites' && !searchQuery && (
              <div className="text-[11px] font-semibold text-amber-400/90 mb-2 px-1 flex items-center justify-between">
                <span>⭐ الملصقات المفضلة ({favoriteStickers.length})</span>
                <span className="text-[10px] text-[#8696a0]">انقر ⭐ على أي ملصق في الشات لإضافته هنا</span>
              </div>
            )}

            {currentStickers.length > 0 ? (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 place-items-center">
                {currentStickers.map((sticker) => {
                  const isFav = favoriteStickers.some((f) => f.url === sticker.url);
                  return (
                    <div
                      key={sticker.id}
                      className="group/item relative w-16 h-16 flex items-center justify-center p-1 rounded-xl hover:bg-[#111b21] transition-all cursor-pointer"
                      onClick={() => {
                        onSendSticker(sticker.url);
                        onClose();
                      }}
                      title={`${sticker.title} (انقر للإرسال في الشات)`}
                    >
                      <img
                        src={sticker.url}
                        alt={sticker.title}
                        className="w-full h-full object-contain transition-transform group-hover/item:scale-120 drop-shadow-sm select-none pointer-events-none"
                        loading="lazy"
                      />

                      {/* زر المفضلة ⭐ الصغير عند تمرير الماوس */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(sticker.url, sticker.title);
                        }}
                        className={`absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                          isFav
                            ? 'text-amber-400 opacity-100 bg-[#202c33]/90'
                            : 'text-[#8696a0] opacity-0 group-hover/item:opacity-100 hover:text-amber-400 bg-[#202c33]/90'
                        }`}
                        title={isFav ? 'إزالة من المفضلة ⭐' : 'إضافة للمفضلة ⭐'}
                      >
                        <Star className={`w-3 h-3 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-16 text-center text-xs text-[#8696a0] flex flex-col items-center gap-2">
                {activePackId === 'favorites' ? (
                  <>
                    <Star className="w-8 h-8 text-amber-400/40 mb-1" />
                    <span className="font-semibold text-[#e9edef]">لا توجد ملصقات في المفضلة بعد</span>
                    <span className="text-[11px] max-w-xs text-[#8696a0]">
                      عند رؤية أي ملصق يعجبك في أي محادثة، اضغط على أيقونة ⭐ ليظهر لك هنا فوراً!
                    </span>
                  </>
                ) : (
                  <>
                    <span>لم يتم العثور على أي ملصقات مطابقة</span>
                  </>
                )}
              </div>
            )}
          </div>
        ) : bottomTab === 'emoji' ? (
          /* تبويب الإيموجي السريع المتوافق مع واتساب */
          <div className="flex-1 overflow-y-auto p-3 [scrollbar-width:thin] [scrollbar-color:#374045_transparent]">
            <div className="text-[11px] font-semibold text-[#8696a0] mb-2 px-1">
              Popular Emojis (الإيموجي الأكثر استخداماً)
            </div>
            <div className="grid grid-cols-8 gap-2 place-items-center">
              {[
                '😂', '❤️', '👍', '🙏', '🔥', '😍', '👏', '🎉',
                '😊', '😭', '🤣', '🥰', '😘', '😁', '👌', '💪',
                '✨', '💯', '🤔', '😎', '🙌', '🥺', '🌹', '💐',
                '☕', '👀', '🤝', '🤍', '🖤', '💙', '✅', '❌',
                '⚠️', '⭐', '⚡', '💰', '💵', '📦', '📱', '📍',
              ].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onInsertEmoji?.(emoji)}
                  className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-[#111b21] transition-transform hover:scale-125 active:scale-95 cursor-pointer"
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* تبويب الـ GIF */
          <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center text-center text-xs text-[#8696a0]">
            <Film className="w-10 h-10 text-[#00a884]/60 mb-2 animate-pulse" />
            <p className="text-[#e9edef] font-semibold text-sm">مكتبة GIF المتحركة</p>
            <p className="text-[11px] mt-1 max-w-xs text-[#8696a0]">
              يمكنك إرسال مقاطع GIF المتحركة أو اختيار الملصقات المتحركة مباشرة من متجر الستيكرات ⬭
            </p>
            <button
              type="button"
              onClick={() => setBottomTab('stickers')}
              className="mt-3 px-3.5 py-1.5 rounded-xl bg-[#00a884] hover:bg-[#009475] text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              الذهاب إلى الملصقات ⬭
            </button>
          </div>
        )}

        {/* 5. شريط التبديل السفلي (😀 Emoji | GIF | ⬭ Stickers) مطابق تماماً لأسفل قائمة واتساب ويب */}
        <div className="px-3 py-2 bg-[#161717] border-t border-[#2a3942]/60 flex items-center justify-center gap-6 shrink-0">
          <button
            type="button"
            onClick={() => setBottomTab('emoji')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
              bottomTab === 'emoji' ? 'bg-[#202c33] text-[#00a884] shadow-xs' : 'text-[#8696a0] hover:text-[#e9edef]'
            }`}
          >
            <Smile className="w-4 h-4" />
            <span>Emoji</span>
          </button>

          <button
            type="button"
            onClick={() => setBottomTab('gif')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
              bottomTab === 'gif' ? 'bg-[#202c33] text-[#00a884] shadow-xs' : 'text-[#8696a0] hover:text-[#e9edef]'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>GIF</span>
          </button>

          <button
            type="button"
            onClick={() => setBottomTab('stickers')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
              bottomTab === 'stickers' ? 'bg-[#202c33] text-[#00a884] shadow-xs' : 'text-[#8696a0] hover:text-[#e9edef]'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Stickers</span>
          </button>
        </div>
      </div>
    </>
  );
});
