"use client";

import React, { useEffect, useRef } from 'react';
import { Zap, Settings, ArrowRight, CornerDownLeft, Sparkles, Hash } from 'lucide-react';
import { QuickReplyTemplate } from '@/lib/quick-replies';

interface QuickRepliesMenuProps {
  isOpen: boolean;
  searchQuery: string;
  templates: QuickReplyTemplate[];
  selectedIndex: number;
  onSelect: (template: QuickReplyTemplate) => void;
  onClose: () => void;
  onOpenManager: () => void;
  activeChatName?: string;
}

export const QuickRepliesMenu = React.memo(function QuickRepliesMenu({
  isOpen,
  searchQuery,
  templates,
  selectedIndex,
  onSelect,
  onClose,
  onOpenManager,
  activeChatName = 'المشترك',
}: QuickRepliesMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  const getCategoryColor = (cat: QuickReplyTemplate['category']) => {
    switch (cat) {
      case 'استلام وتدقيق':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'إنجاز وصرف':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'حالات واستفسار':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
      default:
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    }
  };

  return (
    <div
      ref={menuRef}
      dir="rtl"
      data-quick-replies-menu="true"
      className="absolute bottom-full mb-2 right-3 left-3 sm:left-auto sm:right-12 sm:w-[480px] max-h-[380px] bg-[#242626] border border-[#2e2f2f] rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150 backdrop-blur-md select-none"
      onClick={(e) => e.stopPropagation()}
    >
      {/* الرأس: شريط القوالب السريعة ومسار الاختصار */}
      <div className="px-3.5 py-2.5 bg-[#1d1f1f] border-b border-[#2e2f2f] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#21c063]/20 border border-[#21c063]/30 flex items-center justify-center text-[#21c063]">
            <Zap className="w-3.5 h-3.5 fill-[#21c063]" />
          </div>
          <span className="text-xs font-bold text-[#fafafa]">القوالب والردود السريعة</span>
          {searchQuery ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#2e2f2f] text-[#a5a5a5] font-mono">
              /{searchQuery}
            </span>
          ) : (
            <span className="text-[10px] text-[#a5a5a5]">اكتب اسم الرد أو استخدم الأسهم</span>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenManager}
          className="flex items-center gap-1 text-[11px] font-semibold text-[#a5a5a5] hover:text-[#21c063] hover:bg-[#2e2f2f] px-2 py-1 rounded-lg transition-colors cursor-pointer"
          title="إدارة وتعديل القوالب"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>إدارة القوالب</span>
        </button>
      </div>

      {/* قائمة القوالب المطابقة */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1 max-h-[290px] scrollbar-thin scrollbar-thumb-[#3b3d3d]">
        {templates.length === 0 ? (
          <div className="py-8 px-4 text-center">
            <Sparkles className="w-8 h-8 text-[#a5a5a5]/50 mx-auto mb-2 animate-pulse" />
            <div className="text-xs text-[#fafafa] font-bold">لا يوجد قالب مطابق للاختصار &quot;/{searchQuery}&quot;</div>
            <div className="text-[11px] text-[#a5a5a5] mt-1">
              يمكنك الضغط على زر &quot;إدارة القوالب&quot; لإضافة هذا الرد كقالب جديد دائماً.
            </div>
            <button
              type="button"
              onClick={onOpenManager}
              className="mt-3 px-3 py-1.5 rounded-xl bg-[#21c063] hover:bg-[#1daa55] text-white text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-md"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>إضافة قالب جديد الآن</span>
            </button>
          </div>
        ) : (
          templates.map((tpl, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={tpl.id}
                ref={isSelected ? selectedItemRef : null}
                onClick={() => onSelect(tpl)}
                className={`p-2.5 rounded-xl cursor-pointer transition-all flex flex-col gap-1 border ${
                  isSelected
                    ? 'bg-[#161717] border-[#21c063] shadow-md ring-1 ring-[#21c063]/30'
                    : 'bg-[#242626]/70 hover:bg-[#1d1f1f] border-transparent'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#21c063] bg-[#21c063]/15 px-2 py-0.5 rounded-md border border-[#21c063]/30 flex items-center gap-0.5">
                      <Hash className="w-3 h-3 text-[#21c063]" />
                      {tpl.shortcut}
                    </span>
                    <span className="text-xs font-bold text-[#fafafa]">{tpl.title}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getCategoryColor(
                        tpl.category
                      )}`}
                    >
                      {tpl.category}
                    </span>
                    {isSelected && (
                      <span className="text-[10px] text-[#21c063] bg-[#161717] px-1.5 py-0.5 rounded flex items-center gap-0.5 font-mono">
                        <span>Enter</span>
                        <CornerDownLeft className="w-3 h-3 inline" />
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-xs text-[#a5a5a5] line-clamp-2 leading-relaxed text-right mt-0.5">
                  {tpl.content.replace(/\{\{\s*name\s*\}\}/gi, activeChatName)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* الشريط السفلي: إرشادات التنقل السريع */}
      <div className="px-3 py-1.5 bg-[#161717] border-t border-[#2e2f2f] flex items-center justify-between text-[10px] text-[#a5a5a5]">
        <div className="flex items-center gap-3">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-[#242626] border border-[#2e2f2f] text-[#fafafa]">↑</kbd>{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-[#242626] border border-[#2e2f2f] text-[#fafafa]">↓</kbd> للتنقل
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-[#242626] border border-[#2e2f2f] text-[#fafafa]">Enter</kbd> للاختيار
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-[#242626] border border-[#2e2f2f] text-[#fafafa]">Esc</kbd> للإغلاق
          </span>
        </div>
        <div>
          <span>{templates.length} قوالب متاحة</span>
        </div>
      </div>
    </div>
  );
});
